import GlContext_t from './TinyWebgl.js'
import FragSource from './ToasterShader.js'
//	remove these big dependencies!
import Camera_t from './PopEngine/Camera.js'
import {MatrixInverse4x4} from './PopEngine/Math.js'


const VertSource = `
precision highp float;
attribute vec3 LocalPosition;
uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;
uniform vec3 WorldMin;
uniform vec3 WorldMax;
varying vec3 WorldPosition;	//	output
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
}
`;


const Camera = new Camera_t();
Camera.Position = [ 0,0.30,-0.70 ];
Camera.LookAt = [ 0,0,0 ];
Camera.FovVertical = 70;
const WorldLightPosition = [-0.9,2.4,-1.8];
		
function GetCameraUniforms(Uniforms,ScreenRect)
{
	const RenderTargetRect = [0,0,1,ScreenRect[3]/ScreenRect[2]];
	Uniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
	Uniforms.CameraProjectionTransform = Camera.GetProjectionMatrix( RenderTargetRect );

	Uniforms.CameraToWorldTransform = MatrixInverse4x4( Uniforms.WorldToCameraTransform );
}


const GameState = {};
GameState.UserHoverHandle = false;
GameState.MouseUv = [0.5,0.5];


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
}

function MouseDown(Event)
{
	let uv = GetMouseUv(Event);
	console.log(`MouseDown ${uv}`);
}

function MouseUp(Event)
{
	let uv = GetMouseUv(Event);
	console.log(`Mouseup ${uv}`);
}

function MouseWheel(Event)
{
	let uv = GetMouseUv(Event);
	console.log(`MouseWheel ${uv}`);
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


function UpdateInteraction(Time)
{
	GameState.UserHoverHandle = Time % 1 < 0.5;
	GameState.MouseUv
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
		Uniforms.FloorY = 0.30;
		Uniforms.WallZ = 1.30;
		Uniforms.WorldMin = [-w,-h,-d];
		Uniforms.WorldMax = [w,h,d];
		Uniforms.WorldLightPosition = WorldLightPosition;
		Object.assign(Uniforms,GameState);
		
		Context.Draw(Cube,Shader,Uniforms);
	}
}

export default Loop;

