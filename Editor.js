import GlContext_t from './TinyWebgl.js'
import GizmoFragSource from './GizmoShader.js'
import SceneFragSourcer from './SceneShader.js'
import PromiseQueue from './PopEngineCommon/PromiseQueue.js'
import Camera_t from './PopEngineCommon/Camera.js'
import {MatrixInverse4x4,Normalise3,Add3,Distance3,GetRayPositionAtTime,GetRayRayIntersection3} from './PopEngineCommon/Math.js'

import Pop from './PopEngineCommon/PopEngine.js'
import {CreatePromise} from './PopEngineCommon/PopApi.js'
import {NormalToRainbow} from './PopEngineCommon/Colour.js'
import {Box_t,Line_t,Sphere_t,ShapeTree_t} from './Shapes.js'

import {GizmoManager_t,GizmoAxis_t,GizmoRadius_t} from './Gizmos.js'

const VertSource = `
precision highp float;
attribute vec3 LocalPosition;
uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;
uniform vec3 WorldMin;
uniform vec3 WorldMax;
varying vec3 WorldPosition;	//	output
varying vec4 OutputProjectionPosition;
void main()
{
	//	expecting cube 0..1
	vec3 LocalPos01 = LocalPosition;
	vec4 WorldPos;
	WorldPos.xyz = mix( WorldMin, WorldMax, LocalPos01 );
	WorldPos.w = 1.0;
	vec4 CameraPos = WorldToCameraTransform * WorldPos;	//	world to camera space
	vec4 ProjectionPos = CameraProjectionTransform * CameraPos;
	gl_Position = ProjectionPos;
	
	WorldPosition = WorldPos.xyz;
	OutputProjectionPosition = gl_Position;
}
`;


const Camera = new Camera_t();
Camera.Position = [ 0,0.30,-3.90 ];
Camera.LookAt = [ 0,0,0 ];
Camera.FovVertical = 70;

let LastRenderTargetRect = [0,0,1,1];
		
function GetCameraUniforms(Uniforms,ScreenRect)
{
	LastRenderTargetRect = [0,0,1,ScreenRect[3]/ScreenRect[2]];
	Uniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
	Uniforms.CameraProjectionTransform = Camera.GetProjectionMatrix( LastRenderTargetRect );

	Uniforms.CameraToWorldTransform = MatrixInverse4x4( Uniforms.WorldToCameraTransform );
	Uniforms.RenderTargetRect = LastRenderTargetRect;
}


const InputState = {};
class InputValue_t
{
	constructor(uv,px,Force=1)
	{
		this.uv = uv;
		this.px = px;
		this.Force = Force;
	}
}
InputState.MouseButtonsDown = {};	//	key=button value=InputValue_t


function Range(Min,Max,Value)
{
	return (Value-Min) / (Max-Min);
}

function GetMouseValue(Event)
{	
	Element = Event.currentTarget;
	const Rect = Element.getBoundingClientRect();
	const ClientX = Event.pageX || Event.clientX;
	const ClientY = Event.pageY || Event.clientY;
	const u = Range( Rect.left, Rect.right, ClientX ); 
	const v = Range( Rect.top, Rect.bottom, ClientY ); 
	
	let Input = new InputValue_t();
	Input.uv = [u,v]; 
	Input.px = [ClientX,ClientY]; 
	return Input;
}


//	return true to notify we used the input and don't pass onto game
function HandleMouse(Button,InputValue,FirstDown)
{
	if ( Button == 'Right' )
	{
		//	should just get px from event!	
		const [x,y] = InputValue.px;
		Camera.OnCameraOrbit( x, y, 0, FirstDown );
		return true;
	}
	
	if ( Button == GetWheelButton() )
	{
		Camera.OnCameraZoom( -InputValue.Force );
		return true;
	}

	return false;
}

function HtmlMouseToButton(Button)
{
	return ['Left','Middle','Right','Back','Forward'][Button];
}
function GetHoverButton()
{
	return 'Hover';
}
function GetWheelButton()
{
	return 'Wheel';
}

function MouseMove(Event)
{
	let Value = GetMouseValue(Event);
	
	//	update all buttons
	const Buttons = Event.buttons || 0;	//	undefined if touches
	const ButtonMasks = [ 1<<0, 1<<2, 1<<1 ];	//	move button bits do NOT match mouse events
	const ButtonsDown = ButtonMasks.map( (Bit,Button) => (Buttons&Bit)?HtmlMouseToButton(Button):null ).filter( b => b!==null );
	
	if ( !ButtonsDown.length )
		ButtonsDown.push(GetHoverButton()); 
	
	function OnMouseButton(Button)
	{
		if ( HandleMouse( Button, Value, false ) )
			return;
		InputState.MouseButtonsDown[Button] = Value;
	}
	ButtonsDown.forEach(OnMouseButton);
	
}

function MouseDown(Event)
{
	delete InputState.MouseButtonsDown[GetHoverButton()];

	let Value = GetMouseValue(Event);
	const Button = HtmlMouseToButton(Event.button);
	if ( HandleMouse( Button, Value, true ) )
	{
		Event.preventDefault();
		return;
	}
	//console.log(`MouseDown ${uv} Button=${Button}`);
	InputState.MouseButtonsDown[Button] = Value;
}

function MouseUp(Event)
{
	let Value = GetMouseValue(Event);
	//console.log(`Mouseup ${uv}`);
	const Button = HtmlMouseToButton(Event.button);
	delete InputState.MouseButtonsDown[Button];
}

function MouseWheel(Event)
{
	//	gr should update mouse here?
	let Value = GetMouseValue(Event);
	//console.log(`MouseWheel ${uv}`);
	
	//	gr: maybe change scale based on
	//WheelEvent.deltaMode = DOM_DELTA_PIXEL, DOM_DELTA_LINE, DOM_DELTA_PAGE
	const DeltaScale = 0.01;
	const WheelDelta = [ Event.deltaX * DeltaScale, Event.deltaY * DeltaScale, Event.deltaZ * DeltaScale ];
	Value.Force = WheelDelta[1];

	const Button = GetWheelButton();

	if ( HandleMouse( Button, Value, true ) )
	{
		Event.preventDefault();
		return;
	}
	
	//	need to either auto-remove this state once read, or maybe we need an event queue (probably that)
	InputState.MouseButtonsDown[Button] = Value;

	//	stop scroll
	Event.preventDefault();
}

function MouseContextMenu(Event)
{
	Event.preventDefault();
	return;
}


function BindEvents(Element)
{
	Element.addEventListener('mousemove', MouseMove );
	Element.addEventListener('wheel', MouseWheel, false );
	Element.addEventListener('contextmenu', MouseContextMenu, false );
	Element.addEventListener('mousedown', MouseDown, false );
	Element.addEventListener('mouseup', MouseUp, false );
	
	Element.addEventListener('touchmove', MouseMove );
	Element.addEventListener('touchstart', MouseDown, false );
	Element.addEventListener('touchend', MouseUp, false );
	Element.addEventListener('touchcancel', MouseUp, false );
}

function GetInputRays()
{
	//	turn 2d inputs into 3d rays 
	//	in future, 3d input can be really small rays at the tips of fingers etc
	let State3 = {};
	
	for ( let Button of Object.keys(InputState.MouseButtonsDown) )
	{
		const uv = InputState.MouseButtonsDown[Button].uv;
		const Ray = GetRayFromCameraUv(uv);
		State3[Button] = Ray;
	}
	
	return State3;
}


function GetRayFromCameraUv(uv)
{
	const WorldRay = Camera.GetScreenRay(...uv,LastRenderTargetRect);
	return WorldRay;
}



class Actor_t
{
	constructor(Name)
	{
		this.Name = Name;
		this.OnActorChanged = function(){};

		this.Position = [0.0,0.0,0];
		this.Colour = [0,0.5,0.5,1];
		this.Specular = 1;

		this.Shape = null;
	}
		
	OnChanged(Change)
	{
		this.OnActorChanged(this,Change);
	}
	
	GetRenderPosition(GizmoManager)
	{
		const Gizmo = GizmoManager.GetGizmo(this.Name, this.Position );
		if ( !Gizmo )
			return this.Position.slice();
		return Gizmo.GetRenderPosition();
	}
	
	GetSdf(Parameters,VariableName,GizmoManager)
	{
		let Position = this.GetRenderPosition(GizmoManager);
		const ParamsSource = Parameters.join(',');
		if ( !this.Shape )
			return null;
		
		if ( VariableName )
			Position = VariableName;
		
		return this.Shape.GetSdf( ParamsSource, Position );
	}
}

class SceneManager_t
{
	constructor()
	{
		this.WorldLightPosition = [-0.4,1.4,-1.4];
		this.Actors = [];
		this.SceneChangedQueue = new PromiseQueue('SceneChangedQueue');
	}
	
	async WaitForChange()
	{
		return this.SceneChangedQueue.WaitForLatest();
	}
	
	GetActor(Name)
	{
		return this.Actors.find( a => a.Name == Name );
	}
	
	GetLightPosition(GizmoManager)
	{
		const Gizmo = GizmoManager.GetGizmo('Light', this.WorldLightPosition );
		if ( Gizmo )
			return Gizmo.GetRenderPosition();
			
		return this.WorldLightPosition.slice();
	}
	
	GetObjectUniforms(GizmoManager)
	{
		const Uniforms = {};
		
		Uniforms.WorldLightPosition = this.GetLightPosition(GizmoManager);

		//	expand [should be] unique actor uniform into our uniforms
		const ActorActorUniforms = this.Actors.map( a => this.GetActorUniforms(a,GizmoManager) );
		for ( let ActorActorUniform of ActorActorUniforms )
			for ( let ActorUniform of Object.values(ActorActorUniform) )
				Uniforms[ActorUniform.Uniform] = ActorUniform.Value;
		
		return Uniforms;
	}
	
	GetActorUniforms(Actor,GizmoManager)
	{
		const Uniforms = {};
		Uniforms.Position = {};
		Uniforms.Position.Uniform = `${Actor.Name}_Position_`;
		Uniforms.Position.Value = Actor.GetRenderPosition(GizmoManager);
		
		Uniforms.Colour = {};
		Uniforms.Colour.Uniform = `${Actor.Name}_Colour_`;
		Uniforms.Colour.Value = [...Actor.Colour,1,1,1,1].slice(0,4);
		
		Uniforms.Specular = {};
		Uniforms.Specular.Uniform = `${Actor.Name}_Specular_`;
		Uniforms.Specular.Value = Actor.Specular;
		
		return Uniforms;
	}
	
	GetSdfSource(GizmoManager,BakeValues=false)
	{
		let Globals = [];
		let MaterialMaps = [];
		let MaterialSource = [];
		function PushMaterial(FunctionName,MaterialName,Colour,Specular)
		{
			const MaterialMap = {};
			MaterialMap.FunctionName = FunctionName;
			MaterialMap.MaterialName = MaterialName;
			MaterialMap.Colour = Colour;
			MaterialMaps.push(MaterialMap);
			
			const Source = `
			if ( Material == ${MaterialName} )	return GetMaterialColour_${FunctionName}( WorldPosition, WorldNormal, Shadow, ${Colour}, ${Specular} );
			`;
			MaterialSource.push(Source);
			
			Globals.push(`uniform vec4 ${Colour};`);
			Globals.push(`uniform float ${Specular};`);
		}
		
		//	need to manage material uniforms here
		function ActorToSdf(Actor,ActorIndex)
		{
			const ActorUniforms = this.GetActorUniforms(Actor,GizmoManager);
			
			
			//	setup material
			const Material = `${Actor.Name}_Material`;
			//	just some id
			const Materialf = `(1000.0 + ${ActorIndex}.0)`;
			Globals.push(`const float ${Material} = ${Materialf};`);
			
			PushMaterial('Lit',Material,ActorUniforms.Colour.Uniform,ActorUniforms.Specular.Uniform);
			
			
			//	setup position/map/sdf
			let PositionVariableName = BakeValues ? null : ActorUniforms.Position.Uniform;
			let Sdf = Actor.GetSdf([`Position`],PositionVariableName,GizmoManager);
			
			if ( PositionVariableName )
			{
				//	step/version 1, pos as constant
				const [x,y,z] = Actor.GetRenderPosition(GizmoManager);
				//const Global = `const vec3 ${PositionVariableName} = vec3( ${x}, ${y}, ${z} );`
				const Global = `uniform vec3 ${PositionVariableName};`
				Globals.push(Global);
			}			
			
			//	if GetSdf returns an array, the last line goes in the usual distance code
			//	the rest is prefix
			let Prefix = '';
			if ( Array.isArray(Sdf) )
			{
				let Var = Sdf.pop();
				Prefix = Sdf.join('');
				Sdf = Var;
			}
			
			let Source = '';
			Source += Prefix;
			Source += `d = Closest( d, dm_t(${Sdf},${Material}) );`;
			return Source;
		}
		let MapSdfs = this.Actors.map( ActorToSdf.bind(this) );
		
		const Source = {};
		Source.MapSdfs = MapSdfs;
		Source.Globals = Globals;
		Source.MaterialSource = MaterialSource;
		return Source;
	}
	
	OnActorChanged(Actor,ChangeKey)
	{
		this.SceneChangedQueue.Push(ChangeKey);
	}
	
	AddActor(Actor)
	{
		this.Actors.push(Actor);
		Actor.OnActorChanged = this.OnActorChanged.bind(this);
		return Actor;
	}
}

async function RenderLoop(Canvas,GetGame)
{
	BindEvents(Canvas);
	const Context = new GlContext_t(Canvas);

	
	const GizmoShader = Context.CreateShader( VertSource, GizmoFragSource );
	let SceneShader = null;
	const GizmoCube = Context.CreateCubeGeo( GizmoShader );
	const SceneCube = GizmoCube;
	
	const Gizmos = new GizmoManager_t();
	const Scene = new SceneManager_t();
	
	let Actor1 = Scene.AddActor( new Actor_t('Sphere1') );
	Actor1.Shape = new Sphere_t(0.1);
	Actor1.Position[0]+=0.8;
	
	let Actor2 = Scene.AddActor( new Actor_t('Sphere2') );
	Actor2.Shape = new Box_t(0.1,0.2,0.1);
	Actor2.Colour = [0.5,0.5,0];
	Actor2.Position[0]+=0.4;
	
	let Actor3 = Scene.AddActor( new Actor_t('Sphere3') );
	Actor3.Shape = new Line_t(0.1,0.2,0.1,0.04);
	Actor3.Colour = [0.5,0,0.5];
	Actor3.Position[0]-=0.4;

	let Actor4 = Scene.AddActor( new Actor_t('Tree') );
	Actor4.Shape = new ShapeTree_t();
	Actor4.Shape.AddShape( new Box_t(0.1,0.2,0.1) );
	Actor4.Shape.AddShape( new Line_t(0.1,0.2,0.1,0.04), [0.1,0.1,0.1] );
	Actor4.Shape.AddShape( new Sphere_t(0.1), [0.0,-0.2,-0.1] );
	Actor4.Colour = [0.5,0,0];
	Actor4.Position[0] = 0.0;

	const BakedScenePositions = false;
	
	async function SceneChangedThread()
	{
		while(Scene)
		{
			const ChangedKey = await Scene.WaitForChange();
			
			//	dont need to invalidate SDF if we're not baking positions
			if ( !BakedScenePositions && ChangedKey == 'Position' )
				continue;
				 
			//console.log(`Invalidating shader (reason=${ChangedKey})`);
			SceneShader = null;
		}
	}
	async function GizmoChangedThread()
	{
		while(Gizmos)
		{
			const ChangedGizmo = await Gizmos.WaitForGizmoChange();
			let Actor = Scene.GetActor(ChangedGizmo.Name);
			if ( !Actor )
			{
				console.warn(`Failed to find actor for gizmo ${ChangedGizmo.Name}`);
				await Pop.Yield(400);
				continue;
			}
			Actor.Position = ChangedGizmo.Position.slice();
			Actor.OnChanged('Position');
		}
	}
	SceneChangedThread().catch(console.error);
	GizmoChangedThread().catch(console.error);
	
	function RenderGizmos()
	{
		const Uniforms = {};
		GetCameraUniforms(Uniforms,Context.GetScreenRect());

		//	bounding box
		let w=0.40,h=0.20,d=0.20;	//	toaster cm
		w=h=d=100;
		Uniforms.WorldMin = [-w,-h,-d];
		Uniforms.WorldMax = [w,h,d];
		Object.assign( Uniforms, Gizmos.GetUniforms() );
		Context.Draw(GizmoCube,GizmoShader,Uniforms);

		//let Pixels = Context.ReadPixels();
		//Pixels = Pixels.slice(0,4);
		//GameState.LastHoverMaterial = Pixels[0];
	}
	
	function RenderScene()
	{
		//	generate new scene shader if we need to
		if ( !SceneShader )
		{
			try
			{
				const SceneSdfSource = Scene.GetSdfSource(Gizmos,BakedScenePositions);
				const SceneFragSource = SceneFragSourcer( SceneSdfSource.Globals, SceneSdfSource.MapSdfs, SceneSdfSource.MaterialSource );
				SceneShader = Context.CreateShader( VertSource, SceneFragSource );
			}
			catch(e)
			{
				Pop.Warning(`failed to create scene shader; ${e}`);
			}
		}
		
		if ( !SceneShader )
			return;
		const Uniforms = {};
		GetCameraUniforms(Uniforms,Context.GetScreenRect());

		//	bounding box
		let w=0.40,h=0.20,d=0.20;	//	toaster cm
		w=h=d=100;
		Uniforms.WorldMin = [-w,-h,-d];
		Uniforms.WorldMax = [w,h,d];
		Object.assign( Uniforms, Scene.GetObjectUniforms(Gizmos) );
		Context.Draw(SceneCube,SceneShader,Uniforms);
	}
	
	
	
	
	while(true)
	{
		let Game = GetGame();
		
		const TimeDelta = 1/60;
		let Time = await Context.WaitForFrame();

		//	update
		if ( Game )
			Game.Iteration(TimeDelta,GetInputRays());
		Gizmos.Iteration(GetInputRays());


		//	render
		Time = Time/100 % 1;
		Context.Clear(NormalToRainbow(Time));
		
		RenderScene();
		RenderGizmos();
	}
}


async function AppLoop(Canvas)
{
	let Game;
	function GetGame()
	{
		return Game;
	}
	const RenderThread = RenderLoop(Canvas,GetGame);

/*
	while ( true )
	{
		Game = new Game_t();
		const Result = await Game.GameLoop();
		window.alert(Result);
		Yield(3000);
		Game = null;
	}
	*/
}


export default AppLoop;

