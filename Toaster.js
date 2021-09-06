import GlContext_t from './TinyWebgl.js'
import FragSource from './ToasterShader.js'
//	remove these big dependencies!
import Camera_t from './PopEngine/Camera.js'
import {MatrixInverse4x4} from './PopEngine/Math.js'

import Game_t from './ToasterGame.js'

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
InputState.MouseButtonsDown = {};	//	key=button value=uv
		
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
	
	//	update buttons
	const ButtonMasks = [ 1<<0, 1<<2, 1<<1 ];	//	move button bits do NOT match mouse events
	const Buttons = Event.buttons || 0;	//	undefined if touches
	for ( let i=0;	i<ButtonMasks.length;	i++ )
		if ( ( Buttons & ButtonMasks[i] ) != 0 )
			InputState.MouseButtonsDown.Left = uv;

}

function MouseDown(Event)
{
	let uv = GetMouseUv(Event);
	//console.log(`MouseDown ${uv}`);
	InputState.MouseButtonsDown.Left = uv;
}

function MouseUp(Event)
{
	let uv = GetMouseUv(Event);
	//console.log(`Mouseup ${uv}`);
	delete InputState.MouseButtonsDown.Left;
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

function GetInputRays()
{
	//	turn 2d inputs into 3d rays 
	//	in future, 3d input can be really small rays at the tips of fingers etc
	let State3 = {};
	
	for ( let Button of Object.keys(InputState.MouseButtonsDown) )
	{
		const uv = InputState.MouseButtonsDown[Button];
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



async function Loop(Canvas)
{
	let Game = new Game_t();
	BindEvents(Canvas);
	const Context = new GlContext_t(Canvas);
	const Shader = Context.CreateShader( VertSource, FragSource );
	const Cube = Context.CreateCubeGeo( Shader );
	while(true)
	{
		const TimeDelta = 1/60;
		let Time = await Context.WaitForFrame();
		Time = Time % 1;
		Context.Clear([1,Time,0,1]);
		
		Game.Iteration(TimeDelta,GetInputRays());
		
		const Uniforms = {};

		GetCameraUniforms(Uniforms,Context.GetScreenRect());
		Object.assign(Uniforms,Game.GetUniforms());
		//	bounding box
		let w=0.40,h=0.20,d=0.20;	//	toaster cm
		w=h=d=1;
		Uniforms.WorldMin = [-w,-h,-d];
		Uniforms.WorldMax = [w,h,d];
		Uniforms.TimeNormal = Time;

		
		Context.Draw(Cube,Shader,Uniforms);
		//let Pixels = Context.ReadPixels();
		//Pixels = Pixels.slice(0,4);
		//GameState.LastHoverMaterial = Pixels[0];
	}
}

export default Loop;

