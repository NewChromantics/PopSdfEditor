export default function(MapSource){return `
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
#define Mat_Object0	1.0

#define PinkColour		vec3(0.8,0,0.8)

#define ObjectCount	10
uniform vec4 ObjectMaterials[ObjectCount];
uniform vec4 ObjectPositions[ObjectCount];
uniform vec4 ObjectShapeParams[ObjectCount];

#define FarZ		10.0
#define MAX_STEPS	20

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

dm_t sdObject(vec3 Position,vec4 ObjectPosition,vec4 ObjectShapeParam,int ObjectIndex)
{
	//vec3 ObjectPosition = ObjectPositions[ObjectIndex].xyz;
	//vec4 ObjectShapeParam = ObjectShapeParams[ObjectIndex];
	float Material = Mat_Object0 + float(ObjectIndex);

	//	todo: param/w needs to specify shape?
	//	need to think about the tree
	float Distance = sdSphere( Position.xyz, vec4(ObjectPosition.xyz,ObjectShapeParam.x) );
	Material = mix( Mat_None, Material, ObjectPosition.w );
	
	return dm_t( Distance, Material );
}

dm_t sdObjects(vec3 Position)
{
	//dm_t Hit = dm_t(999.0,Mat_None);
	dm_t Hit = sdObject(Position,ObjectPositions[0],ObjectShapeParams[0],0);
	for ( int i=0;	i<ObjectCount;	i++ )
	{
		dm_t Distancei = sdObject(Position,ObjectPositions[i],ObjectShapeParams[i],i);
		if ( Distancei.y == Mat_None )
			//Distancei = Hit;
			continue;
		//if ( i == 0 )
		//	Hit = Distancei;
	
		//	gr: how I think it should work
		/*
		float Smoothk = 0.001;
		Distancei.x = opSmoothUnion( Hit.x, Distancei.x, Smoothk );
		Hit = Closest( Distancei, Hit );
		*/
		float Smoothk = 0.1;
		float MergedDistance = opSmoothUnion( Hit.x, Distancei.x, Smoothk );
		//	get closest material
		Hit = Closest( Distancei, Hit );
		Hit.x = MergedDistance; 
	}
	return Hit;
}

dm_t Map(vec3 Position,vec3 Dir)
{
	dm_t d = dm_t(999.0,Mat_None);
	
	${MapSource}
	
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

vec4 GetObjectColour(vec3 WorldPosition,vec3 WorldNormal,int ObjectIndex)
{
	//	cant index as its dynamic
	//vec4 ObjectMaterial = ObjectMaterials[ObjectIndex];
	vec4 ObjectMaterial = vec4(PinkColour,1.0);
	for ( int i=0;	i<ObjectCount;	i++ )
		if ( i == ObjectIndex )
			ObjectMaterial = ObjectMaterials[i];

	vec3 Rgb = ObjectMaterial.xyz;
	float Specular = ObjectMaterial.w;
	
	return GetLitColour( WorldPosition, WorldNormal, Rgb, Specular );
}


vec4 GetMaterialColour(float Material,vec3 WorldPos,vec3 WorldNormal)
{
	if ( Material == Mat_None )		return vec4(0,0,0,0);

	if ( Material >= Mat_Object0 )
		return GetObjectColour( WorldPos, WorldNormal, int(Material-Mat_Object0) );
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


void main()
{
	vec3 RayPos,RayDir;
	GetWorldRay( RayPos, RayDir );
	vec4 HitDistance = GetRayCastDistanceHeatMaterial(RayPos,RayDir).xzzy;
	vec3 HitPos = RayPos + (RayDir*HitDistance.x); 
	
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
`};
