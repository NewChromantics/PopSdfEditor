import GlContext_t from './TinyWebgl.js'
import GizmoFragSource from './GizmoShader.js'
import SceneFragSource from './SceneShader.js'

import Camera_t from './PopEngineCommon/Camera.js'
import {MatrixInverse4x4,Normalise3,Add3,Distance3,GetRayPositionAtTime,GetRayRayIntersection3} from './PopEngineCommon/Math.js'

import Pop from './PopEngineCommon/PopEngine.js'
import {CreatePromise} from './PopEngineCommon/PopApi.js'
import {NormalToRainbow} from './PopEngineCommon/Colour.js'

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



class GizmoAxis_t
{
	constructor(Name)
	{
		this.Name = Name;
		this.Position = [0,0,0];
		this.SelectedAxis = null;
		this.SelectedAxisRenderOffset = 0; 
	}
	
	BakeSelectedOffset()
	{
		this.Position[this.SelectedAxis] += this.SelectedAxisRenderOffset;
		this.SelectedAxis = null;
		this.SelectedAxisRenderOffset = 0;
	}
	
	SetRenderSelectedAxisOffset(Offset)
	{
		this.SelectedAxisRenderOffset = Offset;
	}
	
	GetRenderPosition()
	{
		let Pos = this.Position.slice();
		
		if ( this.SelectedAxis !== null )
		{
			Pos[this.SelectedAxis] += this.SelectedAxisRenderOffset;
		}
		return Pos;
	}
	
	GetUniform4()
	{
		let Pos = this.GetRenderPosition();
		
		let RenderAxiss = this.SelectedAxis === null ? (1|2|4) : (1<<this.SelectedAxis);
		//let RenderAxiss = this.SelectedAxis === null ? [1,2,3] : [this.SelectedAxis];
		//RenderAxiss = RenderAxiss.reduce( (v,Current) => {return Current|(1<<v)}, 0 );
		Pos.push( RenderAxiss );
		return Pos;
	}
	
	GetAxisRays(OnlySelected=false)
	{
		let AxisSize = 0.1;
		let AxisRadius = (AxisSize*0.001);
		let Rays = [];
		let PushLine = (x,y,z)=>//	xyz=offset
		{
			const Ray = {};
			Ray.Start = this.Position.slice();
			Ray.Direction = Normalise3([x,y,z]);
			Ray.End = Add3( Ray.Start, [x,y,z] );
			Rays.push(Ray);
		}
		OnlySelected = OnlySelected && this.SelectedAxis!==null;
		let Includex = (!OnlySelected)||(this.SelectedAxis==0);
		let Includey = (!OnlySelected)||(this.SelectedAxis==1);
		let Includez = (!OnlySelected)||(this.SelectedAxis==2);
		if ( Includex )
			PushLine(AxisSize,0,0);
		if ( Includey )
			PushLine(0,AxisSize,0);
		if ( Includez )
			PushLine(0,0,AxisSize);
		return Rays;
	}
	
	GetAxisIntersection(InputRays,MustBeOnAxis)
	{
		function GetAxisIntersection(AxisRay,InputRay,AxisIndex,Button)
		{
			let AxisSize = 0.1;
			//let AxisRadius = (AxisSize*0.001);
			let AxisRadius = 0.01;
		
			const Intersection = GetRayRayIntersection3(InputRay.Start,InputRay.Direction,AxisRay.Start,AxisRay.Direction);
			const Hit = {};
			Hit.DistanceFromCamera = Intersection.IntersectionTimeA;
			Hit.PositionOnAxis = GetRayPositionAtTime(AxisRay.Start,AxisRay.Direction,Intersection.IntersectionTimeB);
			Hit.PositionOnInput = GetRayPositionAtTime(InputRay.Start,InputRay.Direction,Intersection.IntersectionTimeA);
			Hit.DistanceFromAxis = Distance3(Hit.PositionOnAxis,Hit.PositionOnInput);
			Hit.AxisTime = Intersection.IntersectionTimeB;
			Hit.OnAxis = (Hit.AxisTime>=0) && (Hit.AxisTime<=1);
			Hit.OnAxis = Hit.OnAxis && Hit.DistanceFromAxis < AxisRadius;
			Hit.AxisIndex = AxisIndex;
			Hit.Button = Button;
			if ( Button == 'Left' )
			{
				//console.log(Hit);////console.log(Hit.Distance);
			}
			return Hit;
		}
	
		const OnlySelected = true;
		let AxisRays = this.GetAxisRays(OnlySelected);
		let AxisHits = [];
		//for ( let InputRay of Object.values(InputRays) )
		for ( let [Button,InputRay] of Object.entries(InputRays) )
		{
			let Hits = AxisRays.map( (ar,i) => GetAxisIntersection(ar,InputRay,i,Button) );
			AxisHits.push( ...Hits );
		}
		
		function SortDistance(a,b)
		{
			return (a.Distance < b.Distance) ? -1 : 1;
		}
		if ( MustBeOnAxis )
			AxisHits = AxisHits.filter( h => h.OnAxis );
		AxisHits.sort( SortDistance );
		return AxisHits[0];
	}
}

class GizmoManager_t
{
	constructor()
	{
		this.Gizmos = [];
		
		//	button we're using to grab axis
		this.SelectedButton = null;	
		this.SelectedGizmoIndex = null;
		this.SelectedGizmoTime = null;	//	grab t (todo: rename from [ray]time to... normal?)
	}
	
	//	if initial pos is specified, we create any missing gizmos
	GetGizmo(Name,InitialPosition=null)
	{
		let Gizmo = this.Gizmos.find( g => g.Name==Name );
		if ( Gizmo )
			return Gizmo;
			
		if ( !InitialPosition )
			return null;
			
		Gizmo = new GizmoAxis_t(Name);
		Gizmo.Position = InitialPosition.slice(); 
		this.Gizmos.push(Gizmo);
		return Gizmo;
	}
	
	GetUniforms()
	{
		const Uniforms = {};
		Uniforms.AxisPositions = this.Gizmos.map( a => a.GetUniform4() ).flat();
		return Uniforms;
	}
	
	Iteration(InputRays)
	{
		//	do axis hover
		let Hit;
		
		if ( this.SelectedButton && !Object.keys(InputRays).includes(this.SelectedButton) )
		{
			//	let go
			const Gizmo = this.Gizmos[this.SelectedGizmoIndex]; 
			Gizmo.BakeSelectedOffset();
			//this.SelectedButton = null;
			//this.SelectedAxisIndex = null;
		}
		else if ( this.SelectedButton )
		{
			const Gizmo = this.Gizmos[this.SelectedGizmoIndex]; 
			Hit = Gizmo.GetAxisIntersection(InputRays,false);
			//	move axis
			if ( !Hit )
			{
				console.warning(`expected hit`);
			}
			else
			{
				Gizmo.SetRenderSelectedAxisOffset( Hit.AxisTime - this.SelectedGizmoTime );
				//console.log(`Move axis from ${this.SelectedGizmoTime} to ${Hit.AxisTime}`);
			}
		}
		else 
		{
			//	new selection
			for ( let i=0;	i<this.Gizmos.length;	i++ )
			{
				Hit = this.Gizmos[i].GetAxisIntersection(InputRays,true);
				if ( !Hit )
					continue;
					
				if ( Hit.Button == GetHoverButton() )
					continue;

				this.SelectedButton = Hit.Button;
				this.SelectedGizmoIndex = i;
				this.SelectedGizmoTime = Hit.AxisTime;
				this.Gizmos[i].SelectedAxis = Hit.AxisIndex;
				break;
			}
		}
		
		if ( !Hit )
		{
			this.SelectedButton = null;
			this.SelectedGizmoIndex = null;
			this.SelectedGizmoTime = null;
			this.Gizmos.forEach( a => a.SelectedGizmo=null );
			this.Gizmos.forEach( a => a.SelectedGizmoRenderOffset=0 );
		}
	}
}

class Actor_t
{
	constructor(Name)
	{
		this.Name = Name;
		this.Position = [0.1,0.1,0];
		this.ShapeParam = [0.4];
		this.Colour = [0,0.5,0.5];
	}
	
	GetRenderPosition(GizmoManager)
	{
		const Gizmo = GizmoManager.GetGizmo(this.Name, this.Position );
		if ( !Gizmo )
			return this.Position.slice();
		return Gizmo.GetRenderPosition();
	}
}

class SceneManager_t
{
	constructor()
	{
		this.WorldLightPosition = [-0.4,1.4,-1.4];
		this.Actors = [];
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
		function ActorPosition(Actor,ActorIndex)
		{
			let Position = Actor.GetRenderPosition(GizmoManager);
			return [...Position,1];
		}
		function ActorMaterial(Actor)
		{
			return [...Actor.Colour,0.5];
		}
		function ActorShapeParam(Actor)
		{
			return [...Actor.ShapeParam,0,0,0,0].slice(0,4);
		}
		
		const Uniforms = {};
		Uniforms.ObjectPositions = this.Actors.map(ActorPosition);
		Uniforms.ObjectMaterials = this.Actors.map(ActorMaterial);
		Uniforms.ObjectShapeParams = this.Actors.map(ActorShapeParam);
		
		Uniforms.WorldLightPosition = this.GetLightPosition(GizmoManager);
		return Uniforms;
	}
}

async function RenderLoop(Canvas,GetGame)
{
	BindEvents(Canvas);
	const Context = new GlContext_t(Canvas);

	const GizmoShader = Context.CreateShader( VertSource, GizmoFragSource );
	const SceneShader = Context.CreateShader( VertSource, SceneFragSource );
	const GizmoCube = Context.CreateCubeGeo( GizmoShader );
	const SceneCube = GizmoCube;
	
	const Gizmos = new GizmoManager_t();
	const Scene = new SceneManager_t();
	
	Scene.Actors.push( new Actor_t('Sphere1') );
	Scene.Actors.push( new Actor_t('Sphere2') );
	Scene.Actors[1].Colour = [0.5,0.5,0];
	Scene.Actors[1].Position[0]+=0.4;
	
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

