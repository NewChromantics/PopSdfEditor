import GlContext_t from './TinyWebgl.js'

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
void main()
{
	gl_FragColor = vec4(0,1,0,1);
}
`;

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
		Uniforms.WorldMin = [0,0,0];
		Uniforms.WorldMax = [1,1,1];
		Context.Draw(Cube,Shader,Uniforms);
	}
}

export default Loop;

