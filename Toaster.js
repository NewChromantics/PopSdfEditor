import GlContext_t from './TinyWebgl.js'
import GizmoFragSource from './GizmoShader.js'
import SceneFragSource from './SceneShader.js'

import Camera_t from './PopEngineCommon/Camera.js'
import {MatrixInverse4x4,Normalise3,Add3,Distance3,GetRayPositionAtTime,GetRayRayIntersection3} from './PopEngineCommon/Math.js'

import Pop from './PopEngineCommon/PopEngine.js'
import {CreatePromise} from './PopEngineCommon/PopApi.js'


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
	return [u,v,ClientX,ClientY];
}


//	return true to notify we used the input and don't pass onto game
function HandleMouse(Button,uv,FirstDown)
{
	if ( Button != 'Right' )
		return false;

	//	should just get px from event!	
	const x = uv[2];
	const y = uv[3];
	Camera.OnCameraOrbit( x, y, 0, FirstDown );

	return true;
}

function HtmlMouseToButton(Button)
{
	return ['Left','Middle','Right','Back','Forward'][Button];
}
function GetHoverButton()
{
	return 'Hover';
}

function MouseMove(Event)
{
	let uv = GetMouseUv(Event);
	
	//	update all buttons
	const Buttons = Event.buttons || 0;	//	undefined if touches
	const ButtonMasks = [ 1<<0, 1<<2, 1<<1 ];	//	move button bits do NOT match mouse events
	const ButtonsDown = ButtonMasks.map( (Bit,Button) => (Buttons&Bit)?HtmlMouseToButton(Button):null ).filter( b => b!==null );
	
	if ( !ButtonsDown.length )
		ButtonsDown.push(GetHoverButton()); 
	
	function OnMouseButton(Button)
	{
		if ( HandleMouse( Button, uv, false ) )
			return;
		InputState.MouseButtonsDown[Button] = uv.slice(0,2);
	}
	ButtonsDown.forEach(OnMouseButton);
	
}

function MouseDown(Event)
{
	delete InputState.MouseButtonsDown[GetHoverButton()];

	let uv = GetMouseUv(Event);
	const Button = HtmlMouseToButton(Event.button);
	if ( HandleMouse( Button, uv, true ) )
	{
		Event.preventDefault();
		return;
	}
	console.log(`MouseDown ${uv} Button=${Button}`);
	InputState.MouseButtonsDown[Button] = uv.slice(0,2);
}

function MouseUp(Event)
{
	let uv = GetMouseUv(Event);
	//console.log(`Mouseup ${uv}`);
	const Button = HtmlMouseToButton(Event.button);
	delete InputState.MouseButtonsDown[Button];
}

function MouseWheel(Event)
{
	let uv = GetMouseUv(Event);
	//console.log(`MouseWheel ${uv}`);
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



class GizmoAxis_t
{
	constructor()
	{
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
	
	GetUniform4()
	{
		let Pos4 = this.Position.slice();
		
		if ( this.SelectedAxis !== null )
		{
			Pos4[this.SelectedAxis] += this.SelectedAxisRenderOffset;
		}
		
		let RenderAxiss = this.SelectedAxis === null ? (1|2|4) : (1<<this.SelectedAxis);
		//let RenderAxiss = this.SelectedAxis === null ? [1,2,3] : [this.SelectedAxis];
		//RenderAxiss = RenderAxiss.reduce( (v,Current) => {return Current|(1<<v)}, 0 );
		Pos4.push( RenderAxiss );
		return Pos4;
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
				console.log(Hit.DistanceFromAxis);
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
		this.Gizmos = [ new GizmoAxis_t() ];
		
		//	button we're using to grab axis
		this.SelectedButton = null;	
		this.SelectedGizmoIndex = null;
		this.SelectedGizmoTime = null;	//	grab t (todo: rename from [ray]time to... normal?)
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
				console.log(`Move axis from ${this.SelectedGizmoTime} to ${Hit.AxisTime}`);
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

async function RenderLoop(Canvas,GetGame)
{
	BindEvents(Canvas);
	const Context = new GlContext_t(Canvas);
	const GizmoShader = Context.CreateShader( VertSource, GizmoFragSource );
	const Cube = Context.CreateCubeGeo( GizmoShader );
	
	const Gizmos = new GizmoManager_t();
	
	while(true)
	{
		let Game = GetGame();
		
		const TimeDelta = 1/60;
		let Time = await Context.WaitForFrame();
		Time = Time/20 % 1;
		Context.Clear([0.5,Time,0,1]);
		
		if ( Game )
			Game.Iteration(TimeDelta,GetInputRays());
		
		Gizmos.Iteration(GetInputRays());
		
		const Uniforms = {};

		GetCameraUniforms(Uniforms,Context.GetScreenRect());
		
		if ( Game )
			Object.assign(Uniforms,Game.GetUniforms());
			
		//	bounding box
		let w=0.40,h=0.20,d=0.20;	//	toaster cm
		w=h=d=1;
		Uniforms.WorldMin = [-w,-h,-d];
		Uniforms.WorldMax = [w,h,d];
		Uniforms.TimeNormal = Time;

		Object.assign( Uniforms, Gizmos.GetUniforms() );
		
		Context.Draw(Cube,GizmoShader,Uniforms);
		//let Pixels = Context.ReadPixels();
		//Pixels = Pixels.slice(0,4);
		//GameState.LastHoverMaterial = Pixels[0];
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

