export default function(Globals,MapSdfs,MaterialSource){return `
precision highp float;
varying vec3 WorldPosition;
varying vec4 OutputProjectionPosition;
uniform mat4 CameraToWorldTransform;
uniform vec3 WorldLightPosition;
#define WorldUp	vec3(0,1,0)

uniform float TimeNormal;

#define dm_t	vec2	//	distance material
#define dmh_t	vec3	//	distance material heat


#define Mat_None	0.0
#define PinkColour		vec4(0.8,0,0.8,1.0)

#define FarZ			10.0
#define MAX_STEPS		40
#define CLOSE_ENOUGH	0.01001

float sdSphere(vec3 Position,vec4 Sphere);
float sdBox( vec3 p, vec3 c, vec3 b );

${Globals.join('')}

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
float opSmoothUnion( float d1, float d2, float k ) {
    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) - k*h*(1.0-h); }
float opSmoothIntersection( float d1, float d2, float k ) {
    float h = clamp( 0.5 - 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) + k*h*(1.0-h); }
    
    
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

dm_t Map(vec3 Position,vec3 Dir)
{
	dm_t d = dm_t(999.0,Mat_None);
	
	${MapSdfs.join('\n')}
	
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
		if ( StepDistanceMat.x <= CLOSE_ENOUGH )
		{
			HitMaterial = StepDistanceMat.y;
			break;
		}
	}
	return dmh_t( RayDistance, HitMaterial, Heat );
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


vec4 GetLitColour(vec3 WorldPosition,vec3 Normal,vec4 SeedColour,float Specular,float Shadow)
{
	//return vec4(SeedColour,1.0);
	vec3 RumBright = SeedColour.xyz * vec3(1.0/0.7,1.0/0.5,1.0/0.1);
	vec3 RumMidTone = SeedColour.xyz;

	vec3 Colour = RumMidTone;

	vec3 DirToLight = normalize( WorldLightPosition-WorldPosition );
	float Dot = max(0.0,dot( DirToLight, Normal ));

	Colour = mix( Colour, RumBright, Dot );
	
	//	invalidate specular by shadow intensity
	Specular *= 1.0 - (Shadow*Shadow);
	
	//	specular
	float DotMax = mix( 1.0, 0.96, Specular ); 
	if ( Dot > DotMax )
		Colour = vec3(1,1,1);
		
	return vec4( Colour, SeedColour.w );
}


vec4 GetMaterialColour_Flat(vec3 WorldPosition,vec3 WorldNormal,float Shadow,vec4 Colour,float Specular)
{
	return Colour;
}

vec4 GetMaterialColour_Lit(vec3 WorldPosition,vec3 WorldNormal,float Shadow,vec4 Colour,float Specular)
{
	return GetLitColour(WorldPosition,WorldNormal,Colour,Specular,Shadow);
}

vec4 GetMaterialColour(float Material,vec3 WorldPosition,vec3 WorldNormal,float Shadow)
{
	if ( Material == Mat_None )		return vec4(0,0,0,0);

	${MaterialSource.join('')}

	vec4 Colour = vec4(1,1,1,1);
	vec4 ShadowColour = vec4(0,0,0,1);
	Colour = mix( Colour, ShadowColour, Shadow );
	return Colour;

	
	//	no material, render normal
	WorldNormal += 1.0;
	WorldNormal /= 2.0;
	//return vec4(WorldNormal,1.0);
	return GetLitColour(WorldPosition,WorldNormal,PinkColour,1.0,Shadow);
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


void main()
{
	vec3 RayPos,RayDir;
	GetWorldRay( RayPos, RayDir );
	vec4 HitDistance = GetRayCastDistanceHeatMaterial(RayPos,RayDir).xzzy;
	vec3 HitPos = RayPos + (RayDir*HitDistance.x); 
	
	vec3 Normal = calcNormal(HitPos);

		
	//Colour.xyz *= mix(1.0,0.7,HitDistance.y);	//	ao from heat

	
	float Shadowk = 2.50;
	float ShadowMult = 0.0;
	vec3 ShadowRayPos = HitPos+Normal*0.01;
	vec3 ShadowRayDir = normalize(WorldLightPosition-HitPos);
	//float Shadow = softshadow( ShadowRayPos, ShadowRayDir, Shadowk );
	float Shadow = HardShadow( ShadowRayPos, ShadowRayDir );
	//float Shadow = 1.0;

	//	check shadow first, as we don't want specular to appear when in shadow
	vec4 Colour = GetMaterialColour(HitDistance.w,HitPos,Normal,1.0-Shadow);

	Colour.xyz *= mix( ShadowMult, 1.0, Shadow );//Shadow * ShadowMult;

	gl_FragColor = Colour;
	if ( Colour.w == 0.0 )	discard;
}
`};
