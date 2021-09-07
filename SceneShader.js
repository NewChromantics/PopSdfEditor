export default `
precision highp float;
varying vec3 WorldPosition;
varying vec4 OutputProjectionPosition;
uniform mat4 CameraToWorldTransform;
uniform vec3 WorldLightPosition;
#define FarZ	20.0
#define WorldUp	vec3(0,1,0)

uniform float TimeNormal;

#define Mat_None	0.0
#define Mat_ObjectA	1.0
#define dm_t	vec2	//	distance material
#define dmh_t	vec3	//	distance material heat

#define ObjectAColour		vec3(1,0,1)

uniform vec4 RenderTargetRect;

#define MAX_AXISS	1
uniform vec4 AxisPositions[MAX_AXISS];	//	w = size? 0 dont render
#define AxisSize	0.1
#define AxisRadius	(AxisSize*0.001)

//	really we should raytrace instead of step
#define MAX_STEPS	10

void GetMouseRay(out vec3 RayPos,out vec3 RayDir)
{
	float CameraViewportRatio = RenderTargetRect.w/RenderTargetRect.z;
	//	gr: need the viewport used in the matrix... can we extract it?
	float Halfw = (1.0/CameraViewportRatio)/2.0;
	float Halfh = 1.0 / 2.0;
	vec2 ViewportUv = mix( vec2(-Halfw,Halfh), vec2(Halfw,-Halfh), MouseUv);
	vec4 Near4 = CameraToWorldTransform * vec4(ViewportUv,0,1);
	vec4 Far4 = CameraToWorldTransform * vec4(ViewportUv,1,1);
	vec3 Near3 = Near4.xyz / Near4.w;
	vec3 Far3 = Far4.xyz / Far4.w;
	RayPos = Near3;
	RayDir = Far3 - Near3;
	RayDir = normalize(RayDir);
}

void GetWorldRay(out vec3 RayPos,out vec3 RayDir)
{
	//	ray goes from camera
	//	to WorldPosition, which is the triangle's surface pos
	vec4 CameraWorldPos4 = CameraToWorldTransform * vec4(0,0,0,1);
	vec3 CameraWorldPos3 = CameraWorldPos4.xyz / CameraWorldPos4.w;
	RayPos = CameraWorldPos3;
	RayDir = WorldPosition - RayPos;
	RayDir = normalize(RayDir);
}

float rand(vec3 co)
{
	return fract(sin(dot(co, vec3(12.9898, 78.233, 54.53))) * 43758.5453);
}

float opUnion( float d1, float d2 )			{ return min(d1,d2); }
float opSubtraction( float d1, float d2 )	{ return max(-d1,d2); }
float opIntersection( float d1, float d2 )	{ return max(d1,d2); }
float sdPlane( vec3 p, vec3 n, float h )	{return dot(p,n) + h;}

float sdSphere(vec3 Position,vec4 Sphere)
{
	return length( Position-Sphere.xyz )-Sphere.w;
}

float sdBox( vec3 p, vec3 c, vec3 b )
{
	p = p-c;
	vec3 q = abs(p) - b;
	return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}
float sdCapsule( vec3 p, vec3 a, vec3 b, float r )
{
  vec3 pa = p - a, ba = b - a;
  float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
  return length( pa - ba*h ) - r;
}

dm_t Closest(dm_t a,dm_t b)
{
	return a.x < b.x ? a : b;
}


dm_t sdAxis(vec3 Position,vec4 Axis)
{
	vec3 ap = Axis.xyz;
	float as = AxisSize;
	vec3 ax = ap + vec3(as,0,0);
	vec3 ay = ap + vec3(0,as,0);
	vec3 az = ap + vec3(0,0,as);
	//	prep for bitwise operators
	#define RENDER_NONE	0	//	defualt so missing uniforms=0
	#define RENDER_X	1
	#define RENDER_Y	2
	#define RENDER_Z	4
	#define RENDER_ALL	7
	int Selected = int(Axis.w);
	
	float Includex = Selected==RENDER_X || Selected == RENDER_ALL ? 1.0 : 0.0; 
	float Includey = Selected==RENDER_Y || Selected == RENDER_ALL ? 1.0 : 0.0; 
	float Includez = Selected==RENDER_Z || Selected == RENDER_ALL ? 1.0 : 0.0; 
	
	dm_t dx = dm_t( sdCapsule( Position, ap, ax, AxisRadius ), Mat_AxisX );
	dm_t dy = dm_t( sdCapsule( Position, ap, ay, AxisRadius ), Mat_AxisY );
	dm_t dz = dm_t( sdCapsule( Position, ap, az, AxisRadius ), Mat_AxisZ );
	
	dx.x = mix( 9999.0, dx.x, Includex );
	dy.x = mix( 9999.0, dy.x, Includey );
	dz.x = mix( 9999.0, dz.x, Includez );
	
	dm_t Hit = dx;
	Hit = Closest( Hit, dy );
	Hit = Closest( Hit, dz );
	return Hit;
}

dm_t sdAxiss(vec3 Position)
{
	dm_t Hit = dm_t(999.0,Mat_None);
	for ( int a=0;	a<MAX_AXISS;	a++ )
	{
		Hit = Closest( Hit, sdAxis(Position,AxisPositions[a]) );
	}
	return Hit;
}


dm_t Map(vec3 Position,vec3 Dir)
{
	dm_t d = dm_t(999.0,Mat_None);
	d = Closest( d, sdAxiss(Position) );
	return d;
}

float MapDistance(vec3 Position)
{
	vec3 Dir = vec3(0,0,0);
	return Map( Position, Dir ).x;
}

vec3 calcNormal(vec3 pos)
{
	vec2 e = vec2(1.0,-1.0)*0.5773;
	const float eps = 0.0005;
	vec3 Dir = vec3(0,0,0);
	return normalize( e.xyy * MapDistance( pos + e.xyy*eps ) + 
					  e.yyx * MapDistance( pos + e.yyx*eps ) + 
					  e.yxy * MapDistance( pos + e.yxy*eps ) + 
					  e.xxx * MapDistance( pos + e.xxx*eps ) );
}

dmh_t GetRayCastDistanceHeatMaterial(vec3 RayPos,vec3 RayDir)
{
	float MaxDistance = FarZ;
	float RayDistance = 0.0;
	float HitMaterial = Mat_None;
	float Heat = 0.0;
	
	for ( int s=0;	s<MAX_STEPS;	s++ )
	{
		Heat += 1.0/float(MAX_STEPS);
		vec3 StepPos = RayPos + (RayDir*RayDistance);
		dm_t StepDistanceMat = Map(StepPos,RayDir);
		RayDistance += StepDistanceMat.x;
		if ( RayDistance >= MaxDistance )
		{
			RayDistance = MaxDistance;
			//HitMaterial = Mat_Red;
			break;
		}
		if ( StepDistanceMat.x < 0.005 )
		{
			HitMaterial = StepDistanceMat.y;
			break;
		}
	}
	return dmh_t( RayDistance, HitMaterial, Heat );
}

float ZeroOrOne(float f)
{
	//	or max(1.0,floor(f+0.0001)) ?
	//return max( 1.0, f*10000.0);
	return (f ==0.0) ? 0.0 : 1.0; 
}

vec3 GetNormalColour(vec3 Normal)
{
	Normal += 1.0;
	Normal /= 2.0;
	return Normal;
}

float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}


vec4 GetLitColour(vec3 WorldPosition,vec3 Normal,vec3 SeedColour,float Specular)
{
	//return vec4(SeedColour,1.0);
	vec3 RumBright = SeedColour * vec3(1.0/0.7,1.0/0.5,1.0/0.1);
	vec3 RumMidTone = SeedColour;

	vec3 Colour = RumMidTone;
		
	vec3 DirToLight = normalize( WorldLightPosition-WorldPosition );
	float Dot = max(0.0,dot( DirToLight, Normal ));

	Colour = mix( Colour, RumBright, Dot );
	
	//	specular
	float DotMax = mix( 1.0, 0.96, Specular ); 
	if ( Dot > DotMax )
		Colour = vec3(1,1,1);
		
	return vec4( Colour, 1.0 );
}

vec4 GetMaterialColour(float Material,vec3 WorldPos,vec3 WorldNormal)
{
	if ( Material == Mat_None )		return vec4(0,0,0,0);
	if ( Material == Mat_AxisX )	return GetLitColour( WorldPos, WorldNormal, AxisColourX, AxisSpecular );
	if ( Material == Mat_AxisY )	return GetLitColour( WorldPos, WorldNormal, AxisColourY, AxisSpecular );
	if ( Material == Mat_AxisZ )	return GetLitColour( WorldPos, WorldNormal, AxisColourZ, AxisSpecular );

	//if ( !UserHoverHandle )
	//	if ( Material == Mat_Handle )	return GetLitColour(WorldPos,WorldNormal,ToasterColour,ToasterSpecular);
	
	return GetLitColour(WorldPos,WorldNormal,PinkColour,1.0);
}


float softshadow( in vec3 ro, in vec3 rd, float k )
{
    float res = 1.0;
    float ph = 1e20;
    float t = 0.0;
    for ( int i=0;	i<10;	i++ )
    {
        float h = MapDistance(ro + rd*t);
        if( h<0.001 )
            return 0.0;
        float y = h*h/(2.0*ph);
        float d = sqrt(h*h-y*y);
        res = min( res, k*d/max(0.0,t-y) );
        ph = h;
        t += h;
    }
    return res;
}


float HardShadow(vec3 Position,vec3 Direction)
{
	vec4 HitShadow = GetRayCastDistanceHeatMaterial( Position, Direction ).xzzy;
	return HitShadow.w > 0.0 ? 0.0 : 1.0;
	//	*= 0 if hit something
	//Colour.xyz *= mix( 1.0, ShadowMult, ZeroOrOne(HitShadow.w)*(1.0-HitShadow.y) );
/*
	//	shadow
	vec4 HitShadow = GetRayCastDistanceHeatMaterial( HitPos+Normal*0.1, normalize(WorldLightPosition-HitPos) ).xzzy;
	//	*= 0 if hit something
	Colour.xyz *= mix( 1.0, ShadowMult, ZeroOrOne(HitShadow.w)*(1.0-HitShadow.y) );
	*/
}

//	output data at 0,0
vec2 GetScreenUv()
{
	//vec3 ndc = gl_Position.xyz / gl_Position.w;
	vec2 uv = OutputProjectionPosition.xy / OutputProjectionPosition.zz;
	//vec2 uv = OutputProjectionPosition.xy / OutputProjectionPosition.ww;
	//uv *= OutputProjectionPosition.ww;
	uv += 1.0;
	uv /= 2.0;
	return uv;
}

#define UV0	(GetScreenUv().x<=0.0&&GetScreenUv().y<=0.00)

void main()
{
	vec3 RayPos,RayDir;
	if ( UV0 )
		GetMouseRay( RayPos, RayDir );
	else
		GetWorldRay( RayPos, RayDir );
	vec4 HitDistance = GetRayCastDistanceHeatMaterial(RayPos,RayDir).xzzy;
	vec3 HitPos = RayPos + (RayDir*HitDistance.x); 
	
	if ( UV0 )
	{
		//	output is bytes... can we improve this?
		float Mat = HitDistance.w/255.0;
		gl_FragColor = vec4(Mat,Mat,Mat,Mat);
		//gl_FragColor = vec4(HitPos,HitDistance.w/255.0);
		//gl_FragColor = vec4(1,2,3,4);
		return;
	}
	
	vec3 Normal = calcNormal(HitPos);

	vec4 Colour = GetMaterialColour(HitDistance.w,HitPos,Normal);
		
	//Colour.xyz *= mix(1.0,0.7,HitDistance.y);	//	ao from heat

	
	float Shadowk = 2.50;
	vec3 ShadowRayPos = HitPos+Normal*0.1;
	vec3 ShadowRayDir = normalize(WorldLightPosition-HitPos);
	float Shadow = softshadow( ShadowRayPos, ShadowRayDir, Shadowk );
	//float Shadow = HardShadow( ShadowRayPos, ShadowRayDir );
	//Colour.xyz *= mix( ShadowMult, 1.0, Shadow );//Shadow * ShadowMult;

	gl_FragColor = Colour;
	if ( Colour.w == 0.0 )	discard;
}
`;
