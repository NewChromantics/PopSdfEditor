import GlContext_t from './TinyWebgl.js'
import FragSource from './ToasterShader.js'
//	remove these big dependencies!
import Camera_t from './PopEngine/Camera.js'
import {MatrixInverse4x4,GetRayRayIntersection3,Clamp01} from './PopEngine/Math.js'


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
Camera.Position = [ 0,0.30,-0.70 ];
Camera.LookAt = [ 0,0,0 ];
Camera.FovVertical = 70;
		
function GetCameraUniforms(Uniforms,ScreenRect)
{
	GameState.RenderTargetRect = [0,0,1,ScreenRect[3]/ScreenRect[2]];
	Uniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
	Uniforms.CameraProjectionTransform = Camera.GetProjectionMatrix( GameState.RenderTargetRect );

	Uniforms.CameraToWorldTransform = MatrixInverse4x4( Uniforms.WorldToCameraTransform );
}


const GameState = {};
GameState.UserHoverHandle = false;
GameState.LastHoverMaterial = 0;
GameState.MouseUv = [0.5,0.5];
GameState.MouseButtonsDown = {};	//	key=button value=uv
GameState.HandleTime = 0;
GameState.ToastPositionTime = 0;
GameState.ToastVelocity = 0;
GameState.RenderTargetRect = [0,0,1,1];
GameState.Heat = 0;
GameState.HeatSpeed = 0.90;
GameState.Cook = 0;
const CookSeconds = 14;
GameState.CookSpeed = 1/CookSeconds;	//	per sec

const GameConstants = {};
GameConstants.ToasterSize	= [ 0.4,	0.2,		0.2 ];
GameConstants.HandleSize	= [ 0.04,	0.02,		0.04];
GameConstants.HandleTop		= [ 0.24,	0.08,	0.06 ];
GameConstants.HandleBottom	= [ 0.24,	-0.08,	0.06 ];
GameConstants.FloorY = 0.30;
GameConstants.WallZ = 1.30;
GameConstants.WorldLightPosition = [-0.9,2.4,-1.8];
		
function Range(Min,Max,Value)
{
	return (Value-Min) / (Max-Min);
}

function GetMouseUv(Event)
{
	Element = Event.currentTarget;
	const Rect = Element.getBoundingClientRect();
	const ClientX = Event.pageX || Event.clientX;
	const ClientY = Event.pageY || Event.clientY;
	const u = Range( Rect.left, Rect.right, ClientX ); 
	const v = Range( Rect.top, Rect.bottom, ClientY ); 
	return [u,v];
}

function MouseMove(Event)
{
	let uv = GetMouseUv(Event);
	//console.log(`MouseMove ${uv}`);
	GameState.MouseUv = uv;
	
	//	update buttons
	const ButtonMasks = [ 1<<0, 1<<2, 1<<1 ];	//	move button bits do NOT match mouse events
	const Buttons = Event.buttons || 0;	//	undefined if touches
	for ( let i=0;	i<ButtonMasks.length;	i++ )
		if ( ( Buttons & ButtonMasks[i] ) != 0 )
			GameState.MouseButtonsDown.Left = uv;

}

function MouseDown(Event)
{
	let uv = GetMouseUv(Event);
	//console.log(`MouseDown ${uv}`);
	GameState.MouseButtonsDown.Left = uv;
}

function MouseUp(Event)
{
	let uv = GetMouseUv(Event);
	//console.log(`Mouseup ${uv}`);
	delete GameState.MouseButtonsDown.Left;
}

function MouseWheel(Event)
{
	let uv = GetMouseUv(Event);
	//console.log(`MouseWheel ${uv}`);
}

function BindEvents(Element)
{
	Element.addEventListener('mousemove', MouseMove );
	Element.addEventListener('wheel', MouseWheel, false );
	//Element.addEventListener('contextmenu', ContextMenu, false );
	Element.addEventListener('mousedown', MouseDown, false );
	Element.addEventListener('mouseup', MouseUp, false );
	
	Element.addEventListener('touchmove', MouseMove );
	Element.addEventListener('touchstart', MouseDown, false );
	Element.addEventListener('touchend', MouseUp, false );
	Element.addEventListener('touchcancel', MouseUp, false );
}

	
/*
void GetMouseRay(out vec3 RayPos,out vec3 RayDir)
{
	vec2 ViewportUv = mix( vec2(-1,1), vec2(1,-1), MouseUv);
	vec4 Near4 = CameraToWorldTransform * vec4(ViewportUv,0,1);
	vec4 Far4 = CameraToWorldTransform * vec4(ViewportUv,1,1);
	vec3 Near3 = Near4.xyz / Near4.w;
	vec3 Far3 = Far4.xyz / Far4.w;
	RayPos = Near3;
	RayDir = Far3 - Near3;
	RayDir = normalize(RayDir);
}*/

function UvToHandlePosition(uv)
{
	//	get ray
	//	get distance to handle's top-bottom line
	//	see if it's in handle distance (sdf)
	//	null if too far
	
}

function GetRayFromCameraUv(uv)
{
	const RenderTargetRect = GameState.RenderTargetRect;
	const WorldRay = Camera.GetScreenRay(...uv,RenderTargetRect);
	return WorldRay;
}

function GetUserHandleTime()
{
	const HandleRay = {};
	HandleRay.Start = GameConstants.HandleTop;
	HandleRay.Direction = [0,-1,0];
	const HandleTimeLength = GameConstants.HandleTop[1] - GameConstants.HandleBottom[1];
	
	const HandleTimes = [];
	
	for ( let uv of Object.values(GameState.MouseButtonsDown) )
	{
		let Ray = GetRayFromCameraUv(uv);
		const Intersection = GetRayRayIntersection3(Ray.Start,Ray.Direction,HandleRay.Start,HandleRay.Direction);
		let Time = Intersection.IntersectionTimeB / HandleTimeLength;
		Time = Clamp01(Time);
		HandleTimes.push(Time);
	}
	
	HandleTimes.push(null);
	return HandleTimes[0];
}


const Mat_Handle = 3;
function UpdateInteraction(Time,TimeDelta=1/60)
{
	//GameState.UserHoverHandle = GameState.LastHoverMaterial == Mat_Handle;
	//GameState.UserHoverHandle = Time % 1 < 0.5;

	//	spring handle up
	GameState.HandleTime -= 0.4;
	GameState.HandleTime = Math.max(0,GameState.HandleTime);


	const HandleTime = GetUserHandleTime();
	GameState.UserHoverHandle = ( HandleTime !== null );
	if ( HandleTime !== null )
	{
		GameState.HandleTime = HandleTime;
	}
	
	
	
	//	+gravity
	GameState.ToastVelocity += 1;
	//	see if there's force pushing us up (ie, handle has moved up)
	if ( GameState.ToastPositionTime > GameState.HandleTime )
	{
		let Force = GameState.ToastPositionTime - GameState.HandleTime;
		console.log(`Force=${Force}`);
		Force *= 65;
		GameState.ToastVelocity -= Force;
	}	
	GameState.ToastPositionTime += GameState.ToastVelocity * TimeDelta;
	//	clamp/collision
	if ( GameState.ToastPositionTime > GameState.HandleTime )
	{
		GameState.ToastPositionTime = GameState.HandleTime;
		GameState.ToastVelocity = 0;
	}
	
	
	
	
	
	//	update heat
	if ( GameState.HandleTime >= 1.0 )
	{
		GameState.Heat += GameState.HeatSpeed * TimeDelta;
		GameState.Heat = Math.min( 1, GameState.Heat );
	}
	else
	{
		GameState.Heat -= GameState.HeatSpeed * TimeDelta;
		GameState.Heat = Math.max( 0, GameState.Heat );
	}
	
	//	cook bread
	GameState.Cook += GameState.CookSpeed * GameState.Heat * TimeDelta;
	GameState.Cook = Math.min( 1, GameState.Cook );
}

async function Loop(Canvas)
{
	BindEvents(Canvas);
	const Context = new GlContext_t(Canvas);
	const Shader = Context.CreateShader( VertSource, FragSource );
	const Cube = Context.CreateCubeGeo( Shader );
	while(true)
	{
		let Time = await Context.WaitForFrame();
		UpdateInteraction(Time);
		Time = Time % 1;
		Context.Clear([1,Time,0,1]);
		const Uniforms = {};
		GetCameraUniforms(Uniforms,Context.GetScreenRect());
		//	bounding box
		let w=0.40,h=0.20,d=0.20;	//	toaster cm
		w=h=d=1;
		Uniforms.WorldMin = [-w,-h,-d];
		Uniforms.WorldMax = [w,h,d];
		Uniforms.TimeNormal = Time;
		
		//GameState.HandleTime = Time;
		
		Object.assign(Uniforms,GameState);
		Object.assign(Uniforms,GameConstants);
		Context.Draw(Cube,Shader,Uniforms);
		let Pixels = Context.ReadPixels();
		Pixels = Pixels.slice(0,4);
		GameState.LastHoverMaterial = Pixels[0];
	}
}

export default Loop;

