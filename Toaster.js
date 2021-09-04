import GlContext_t from './TinyWebgl.js'

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

const FragSource = `
precision highp float;
varying vec3 WorldPosition;
uniform mat4 CameraToWorldTransform;

void GetWorldRay(out vec3 RayPos,out vec3 RayDir)
{
	float Near = 0.01;
	float Far = 10.0;	
	//	ray goes from camera
	//	to WorldPosition, which is the triangle's surface pos
	vec4 CameraWorldPos4 = CameraToWorldTransform * vec4(0,0,0,1);
	vec3 CameraWorldPos3 = CameraWorldPos4.xyz / CameraWorldPos4.w;
	RayPos = CameraWorldPos3;
	RayDir = WorldPosition - RayPos;
	RayDir = normalize(RayDir);
}
float sdSphere(vec3 Position,vec4 Sphere)
{
	return length( Position-Sphere.xyz )-Sphere.w;
}
float Map(vec3 Position)
{
	return sdSphere( Position, vec4(0,0,0,0.10) );
}
vec3 calcNormal(vec3 pos )
{
	vec2 e = vec2(1.0,-1.0)*0.5773;
	const float eps = 0.0005;
	return normalize( e.xyy * Map( pos + e.xyy*eps ) + 
					  e.yyx * Map( pos + e.yyx*eps ) + 
					  e.yxy * Map( pos + e.yxy*eps ) + 
					  e.xxx * Map( pos + e.xxx*eps ) );
}
void main()
{
	vec3 RayPos,RayDir;
	GetWorldRay( RayPos, RayDir );
	bool Hit = false;
	float RayDistance = 0.0;
	vec3 HitPos;
	for ( int s=0;	s<20;	s++ )
	{
		HitPos = RayPos + (RayDir*RayDistance);
		float StepDistance = Map(HitPos);
		Hit = ( StepDistance < 0.001 );
		RayDistance += StepDistance;
		if ( Hit )
			break;
	}
	vec3 Normal = (calcNormal(HitPos) + vec3(1,1,1)) / 2.0;
	gl_FragColor = Hit ? vec4(Normal,1) : vec4(1,0,0,1);
}
`;

const Camera = new Camera_t();
Camera.Position = [ 0,0.20,0.60 ];
Camera.LookAt = [ 0,0,0 ];
		
function GetCameraUniforms(Uniforms,ScreenRect)
{
	const RenderTargetRect = [0,0,1,ScreenRect[3]/ScreenRect[2]];
	Uniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
	Uniforms.CameraProjectionTransform = Camera.GetProjectionMatrix( RenderTargetRect );

	Uniforms.CameraToWorldTransform = MatrixInverse4x4( Uniforms.WorldToCameraTransform );
}

async function Loop(Canvas)
{
	const Context = new GlContext_t(Canvas);
	const Shader = Context.CreateShader( VertSource, FragSource );
	const Cube = Context.CreateCubeGeo( Shader );
	while(true)
	{
		let Time = await Context.WaitForFrame();
		Time = Time % 1;
		Context.Clear([1,Time,0,1]);
		const Uniforms = {};
		Uniforms.WorldToCameraTransform = [1,0,0,0,	0,1,0,0,	0,0,1,0,	0,0,0,1];
		Uniforms.CameraProjectionTransform = [1,0,0,0,	0,1,0,0,	0,0,1,0,	0,0,0,1];
		GetCameraUniforms(Uniforms,Context.GetScreenRect());
		//	bounding box
		let w=0.40,h=0.20,d=0.20;	//	toaster cm
		Uniforms.WorldMin = [-w,-h,-d];
		Uniforms.WorldMax = [w,h,d];
		Context.Draw(Cube,Shader,Uniforms);
	}
}

export default Loop;

