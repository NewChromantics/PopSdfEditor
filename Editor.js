import GizmoFragSource from './GizmoShader.js'
import SceneFragSourcer from './SceneShader.js'
import PromiseQueue from './PopEngineCommon/PromiseQueue.js'
import Camera_t from './PopEngineCommon/Camera.js'
import {MatrixInverse4x4,Normalise3,Add3,Distance3,GetRayPositionAtTime,GetRayRayIntersection3} from './PopEngineCommon/Math.js'

import {CreateCubeGeometry} from './PopEngineCommon/CommonGeometry.js'

import Pop from './PopEngineCommon/PopEngine.js'
import {CreatePromise} from './PopEngineCommon/PopApi.js'
import {NormalToRainbow} from './PopEngineCommon/Colour.js'
import {Box_t,Line_t,Sphere_t,ShapeTree_t} from './Shapes.js'

import {GizmoManager_t,GizmoAxis_t,GizmoRadius_t} from './Gizmos.js'
import {Actor_t,SceneManager_t} from './Scene.js'


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
Camera.Position = [ 0,0.30,-0.90 ];
Camera.LookAt = [ 0,0,0 ];
Camera.FovVertical = 70;

let LastRenderTargetRect = [0,0,1,1];
let LastScreenRect = null;
		
function GetCameraUniforms(Uniforms,ScreenRect)
{
	LastScreenRect = ScreenRect;
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

function GetMouseValue(x,y,Button)
{	
	const Rect = {};
	//	gr: screen rect is window space
	//		xy is renderview space, so ignore x/y
	Rect.left = 0
	Rect.right = Rect.left + LastScreenRect[2];
	Rect.top = 0;
	Rect.bottom = Rect.top + LastScreenRect[3];
	const ClientX = x;
	const ClientY = y;
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

function OnMouseMove(x,y,Button)
{
	let Value = GetMouseValue(x,y,Button);
	if ( Button === null )
		Button = GetHoverButton();
	
	if ( HandleMouse( Button, Value, false ) )
		return;
		
	InputState.MouseButtonsDown[Button] = Value;
	/*
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
	*/
	
}

function OnMouseDown(x,y,Button)
{
	delete InputState.MouseButtonsDown[GetHoverButton()];

	let Value = GetMouseValue(x,y,Button);
	if ( HandleMouse( Button, Value, true ) )
		return;

	InputState.MouseButtonsDown[Button] = Value;
}

function OnMouseUp(x,y,Button)
{
	let Value = GetMouseValue(x,y,Button);
	delete InputState.MouseButtonsDown[Button];
}

function OnMouseScroll(x,y,Button,WheelDelta)
{
	//	gr should update mouse here?
	Button = GetWheelButton();
	let Value = GetMouseValue(x,y,Button);
	//console.log(`MouseWheel ${uv}`);
	
	Value.Force = WheelDelta[1];

	//const Button = GetWheelButton();

	if ( HandleMouse( Button, Value, true ) )
		return;
	
	//	need to either auto-remove this state once read, or maybe we need an event queue (probably that)
	InputState.MouseButtonsDown[Button] = Value;
}



function BindEvents(RenderView)
{
	RenderView.OnMouseDown = OnMouseDown;
	RenderView.OnMouseMove = OnMouseMove;
	RenderView.OnMouseUp = OnMouseUp;
	RenderView.OnMouseScroll = OnMouseScroll;
/*
	Element.addEventListener('mousemove', MouseMove );
	Element.addEventListener('wheel', MouseWheel, false );
	Element.addEventListener('contextmenu', MouseContextMenu, false );
	Element.addEventListener('mousedown', MouseDown, false );
	Element.addEventListener('mouseup', MouseUp, false );
	
	Element.addEventListener('touchmove', MouseMove );
	Element.addEventListener('touchstart', MouseDown, false );
	Element.addEventListener('touchend', MouseUp, false );
	Element.addEventListener('touchcancel', MouseUp, false );
	*/
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


let SceneTree = null;
try
{
	SceneTree = new Pop.Gui.Tree(null,'SceneTree');
}
catch(e)
{
}

function CreateShapeFromShapeTypeName(Name)
{
	switch (Name)
	{
		case 'ShapeTree':	return new ShapeTree_t();
		case 'Box':		return new Box_t();
		case 'Line':	return new Line_t();
		case 'Sphere':	return new Sphere_t();
		default:		throw `Unknown shape type ${Name}`;
	}
}

function UpdateSceneFromTree(Scene,NewSceneJson)
{
	console.log(`UpdateSceneFromTree`,NewSceneJson);
	
	//	all keys should be actor names
	let NewSceneActorNames = Object.keys(NewSceneJson);
	for ( let ActorName of NewSceneActorNames )
	{
		const Actor = Scene.GetActor( ActorName );
		if ( !Actor )
			throw `Failed to find shape's actor ${ActorName} in scene`;
		
		//	this object is shape
		//	but it could have had another shape dropped onto it
		const NewShapeJson = NewSceneJson[ActorName];

		//	put all shapes into a list
		//	if there's multiple, we have to change into a tree shape
		//	if 1, reduce to a basic shape
		const ChildShapes = [];

		//	old/root shape
		{
			const ShapeType = NewShapeJson.Type;
			if ( !ShapeType )
				throw `Expecting shape json to have a .Type`;
			const RootShape = CreateShapeFromShapeTypeName(ShapeType);
			ChildShapes.push(RootShape);
		}

		//	delete meta keys that can't be a shape
		delete NewShapeJson.Type;
		delete NewShapeJson._TreeMeta;
		delete NewShapeJson.Operator;

		//	gr: this needs to recurse...

		//	the names will be lost, but we can identify them
		const ChildShapeNames = Object.keys(NewShapeJson);
		for ( let ChildShapeKey of ChildShapeNames )
		{
			const ChildShapeObject = NewShapeJson[ChildShapeKey];
			const ShapeType = ChildShapeObject.Type;
			if ( !ShapeType )
				throw `Expecting shape json to have a .Type`;
			const ChildShape = CreateShapeFromShapeTypeName(ShapeType);
			ChildShapes.push( ChildShape );
		}
		
		if ( ChildShapes.length == 0 )
		{
			Actor.Shape = null;
		}
		else if ( ChildShapes.length == 1 )
		{
			Actor.Shape = ChildShapes[0];
		}
		else
		{
			Actor.Shape = new ShapeTree_t();
			for ( let ChildShape of ChildShapes )
				Actor.Shape.AddShape(ChildShape);
		}
		
		Actor.OnActorChanged('Shape');
	}
	
	//	actors no longer in root	
	let DeletedActors = Scene.Actors.filter( a => !NewSceneActorNames.includes(a.Name) );
	let DeletedActorNames = DeletedActors.map( a => a.Name );
	for ( let DeletedActorName of DeletedActorNames )
		Scene.DeleteActor(DeletedActorName);
}

function UpdateTreeGui(Scene)
{
	if ( !SceneTree )
		return;
	
	function ShapeToJson(Shape)
	{
		const Json = {};
		Json._TreeMeta = {};
		Json._TreeMeta.Draggable = true;
		Json._TreeMeta.Droppable = true;
		Json.Type = (Shape.constructor.name).split('_t').slice(0,-1).join('_t');
		
		if ( Shape.Operator )
			Json.Operator = Shape.Operator;
		
		if ( Shape.Shapes )
		{
			let SubShapeJsons = Shape.Shapes.map( ss => ShapeToJson(ss.Shape) );
			//	need to be an array to allow reordering (gr:do we care about order?)
			//Json.Children = SubShapeJsons;
			Object.assign( Json, SubShapeJsons );	//	each turns into #0 #1 etc
			
		}
		
		return Json;
	}
	
	//	get a tree of shapes for v1
	const SceneJson = {};
	for ( let Actor of Scene.Actors )
	{
		let ActorJson = ShapeToJson( Actor.Shape );
		//ActorJson.Position = Actor.Position.map(f=>f.toFixed(3)).join(', ');
		//ActorJson.ShapeType = (Actor.Shape.constructor.name).split('_t').slice(0,-1).join('_t');
		SceneJson[Actor.Name] = ActorJson;
	}
	
	SceneTree.SetValue(SceneJson);
}


async function RenderLoop(Canvas,GetGame)
{
	let Window;
	//let Window = new Pop.Gui.Window();
	let RenderView = new Pop.Gui.RenderView(Window,Canvas);
	let Context = new Pop.Sokol.Context(RenderView);

	BindEvents(RenderView);
	
	
	const GizmoShader = await Context.CreateShader( VertSource, GizmoFragSource );
	let SceneShader = null;
	const CubeGeo = CreateCubeGeometry();
	const GizmoCube = await Context.CreateGeometry( CubeGeo );//, GizmoShader );
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
	Actor4.Shape.AddShape( new ShapeTree_t() ).AddShape( new Sphere_t(0.1), [0.0,-0.2,-0.1] );
	Actor4.Colour = [0.5,0,0];
	Actor4.Position[0] = 0.0;

	const BakedScenePositions = false;
	
	async function SceneChangedThread()
	{
		UpdateTreeGui(Scene);
			
		while(Scene)
		{
			const ChangedKey = await Scene.WaitForChange();
			UpdateTreeGui(Scene);
				
			//	dont need to invalidate SDF if we're not baking positions
			if ( !BakedScenePositions && ChangedKey == 'Position' )
				continue;
				 
			//console.log(`Invalidating shader (reason=${ChangedKey})`);
			SceneShader = null;
		}
	}
	async function SceneUiChangedThread()
	{
		while( SceneTree )
		{
			const NewTreeJson = await SceneTree.WaitForChange();
			UpdateSceneFromTree( Scene, NewTreeJson );
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
	SceneUiChangedThread().catch(console.error);
	SceneChangedThread().catch(console.error);
	GizmoChangedThread().catch(console.error);
	
	function RenderGizmos()
	{
		const Uniforms = {};
		GetCameraUniforms(Uniforms,Context.GetScreenRect());

		//	bounding box
		const Bounds = Gizmos.GetBoundingBox();
		Uniforms.WorldMin = Bounds.Min;
		Uniforms.WorldMax = Bounds.Max;
		Object.assign( Uniforms, Gizmos.GetUniforms() );
		
		return ['Draw',GizmoCube,GizmoShader,Uniforms];

		//let Pixels = Context.ReadPixels();
		//Pixels = Pixels.slice(0,4);
		//GameState.LastHoverMaterial = Pixels[0];
	}
	
	async function RenderScene()
	{
		//	generate new scene shader if we need to
		if ( !SceneShader )
		{
			try
			{
				const SceneSdfSource = Scene.GetSdfSource(Gizmos,BakedScenePositions);
				const SceneFragSource = SceneFragSourcer( SceneSdfSource.Globals, SceneSdfSource.MapSdfs, SceneSdfSource.MaterialSource );
				SceneShader = await Context.CreateShader( VertSource, SceneFragSource );
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
		const SceneBounds = Scene.GetBoundingBox();
		Uniforms.WorldMin = SceneBounds.Min;
		Uniforms.WorldMax = SceneBounds.Max;
		Object.assign( Uniforms, Scene.GetObjectUniforms(Gizmos) );
		//Context.Draw(SceneCube,SceneShader,Uniforms);
		return ['Draw',SceneCube,SceneShader,Uniforms];
	}
	
	
	
	
	while(true)
	{
		let Game = GetGame();
		
		const TimeDelta = 1/60;
		let Time = Pop.GetTimeNowMs() / 1000;
		//let Time = await Context.WaitForFrame();

		//	update
		if ( Game )
			Game.Iteration(TimeDelta,GetInputRays());
		Gizmos.Iteration(GetInputRays());


		//	render
		Time = Time/100 % 1;
		const ClearColour = NormalToRainbow(Time);
		const ClearCmd = ['SetRenderTarget',null,ClearColour];
		
		const SceneCmd = await RenderScene();
		const GizmoCmd = RenderGizmos();
	
		const RenderCommands = [ClearCmd,SceneCmd,GizmoCmd];
		await Context.Render(RenderCommands);
		
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

