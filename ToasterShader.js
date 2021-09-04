export default `
precision highp float;
varying vec3 WorldPosition;
uniform mat4 CameraToWorldTransform;
uniform vec3 WorldLightPosition;
uniform float FloorY;
uniform float WallZ;
#define FarZ	20.0
#define WorldUp	vec3(0,1,0)

#define Mat_None	0.0
#define Mat_Floor	0.1
#define Mat_Toaster	0.2
#define Mat_Bread	0.3
#define Mat_Red		0.4
#define Mat_Blue	0.5
#define dm_t	vec2	//	distance material
#define dmh_t	vec3	//	distance material heat

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

float opUnion( float d1, float d2 ) { return min(d1,d2); }

float opSubtraction( float d1, float d2 ) { return max(-d1,d2); }

float opIntersection( float d1, float d2 ) { return max(d1,d2); }

float sdPlane( vec3 p, vec3 n, float h )
{
	// n must be normalized
	return dot(p,n) + h;
}
vec2 sdFloor(vec3 Position,vec3 Direction)
{
	//return vec2(999.0,0.0);//	should fail to render a floor
	float d = sdPlane(Position,WorldUp,FloorY);
	float tp1 = ( Position.y <= FloorY ) ? 1.0 : 0.0;
	/*
	float tp1 = (Position.y-FloorY)/Direction.y;
	if ( tp1 > 0.0 )
	{
		//d = tp1;	//	gr: why is sdPlane distance wrong? but right in map() 
		tp1 = 1.0;
	}
	else
	{
	//d = 99.9;
		tp1 = 0.0;
	}
	*/
	return vec2(d,tp1);
}

float sdBackWall(vec3 Position)
{
	//return vec2(999.0,0.0);//	should fail to render a floor
	return sdPlane(Position,vec3(0,0,-1),WallZ);
}
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

#define ToasterSize	vec3( 0.4, 0.2, 0.2 )
#define HoleSize	vec3( ToasterSize.x * 0.9, 1.0, 0.06 )
#define ToastSize	vec3( ToasterSize.x * 0.6, 0.16, 0.03 )
#define ToastPos1	(vec3(0,0.09,0.05)+ToasterPos)
#define ToasterPos	vec3(0,0,0)//vec3(0,-0.20,0)
#define ShadowMult	0.4

float sdToast(vec3 Position,vec3 ToastPosition)
{
	Position -= ToastPosition;
	float Hole1 = sdBox( Position, vec3(0,0,0), ToastSize/2.0 );
	//	bumpy bread!
	//	swap this for holes
	Hole1 += rand( floor((Position/ToastSize.xxx)*20.0)/20.0 )*0.0009;
	return Hole1;
}
float sdToaster(vec3 Position)
{
	Position -=ToasterPos;
	float Box = sdBox( Position, vec3(0,0,0), ToasterSize/2.0 );
	float Hole1 = sdBox( Position, vec3(0,0.05,0.05), HoleSize/2.0 );
	float Hole2 = sdBox( Position, vec3(0,0.05,-0.05), HoleSize/2.0 );
	float Hole = min(Hole1,Hole2);
	Box -= 0.01;
	Box = opSubtraction( Hole, Box );
	
	vec3 HandleSize = vec3( 0.03,0.02,0.04);
	float HandleTop = ToasterSize.y / 2.0 * 0.7;
	float HandleBottom = ToasterSize.y / 2.0 * 0.1;
	float HandleTime = 1.0;
	float HandleY = mix( HandleTop, HandleBottom, HandleTime );
	vec3 HandlePos = vec3( HandleSize.x+ToasterSize.x/2.0, HandleY, 0 );
	float Handle = sdBox( Position, HandlePos, HandleSize );
	
	Box = opUnion( Box, Handle );
	return Box;
}


dm_t Closest(dm_t a,dm_t b)
{
	return a.x < b.x ? a : b;
}

dm_t Map(vec3 Position,vec3 Dir)
{
	dm_t d = dm_t(999.0,Mat_None);
	//d = Closest( d, sdSphere( Position, vec4(0,0,0,0.10) );
	
	d = Closest( d, dm_t( sdBackWall(Position), Mat_Floor ) );	//	only need this for calcnormal
	//d = Closest( d, dm_t( sdFloor(Position,Dir).x, Mat_Blue ) );	//	only need this for calcnormal
	d = Closest( d, dm_t( sdToaster(Position), Mat_Toaster ) );	//	only need this for calcnormal
	d = Closest( d, dm_t( sdToast(Position,ToastPos1), Mat_Bread ) );	//	only need this for calcnormal
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
	vec2 FloorTop = sdFloor(RayPos,RayDir);
	float DidHitFloor = FloorTop.y;
	//float DidHitFloor = 0.0;
	
	//	gr: for some reason, this I think is really small and we hit it straight away??
	//float MaxDistance = mix( FarZ, FloorTop.x, DidHitFloor );
	//
	float MaxDistance = FarZ;
	
	float RayDistance = 0.0;
	float HitMaterial = mix(Mat_None,Mat_Floor,DidHitFloor);	//	change to material later. 0 = miss
	float Heat = 0.0;
	
	for ( int s=0;	s<30;	s++ )
	{
		Heat += 1.0/30.0;
		vec3 StepPos = RayPos + (RayDir*RayDistance);
		dm_t StepDistanceMat = Map(StepPos,RayDir);
		RayDistance += StepDistanceMat.x;
		if ( RayDistance >= MaxDistance )
		{
			RayDistance = MaxDistance;
			HitMaterial = Mat_Red;
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

/*
vec3 GetLitColour(vec3 Position,vec3 Normal,vec3 Colour,float Shiny)
{
	float Dot = abs( dot( Normal, normalize(WorldLightPosition-Position) ) );
	Dot = mix( 0.5, 1.0, Dot );
	Dot *= Dot;
	//Dot = 1.0 - Dot;	Dot *= Dot;	Dot=1.0-Dot; 
	
	Shiny *= 0.15;
	if ( Dot > 1.0-Shiny )
		return mix( Colour, vec3(1,1,1), Range(1.0-Shiny, 1.0, Dot ) );
	Colour *= Dot;
	return Colour;
}
*/
vec4 GetLitColour(vec3 WorldPosition,vec3 Normal,vec3 SeedColour,float Specular)
{
	vec3 RumBright = SeedColour;//	rum
	//vec3 RumMidTone = vec3(181, 81, 4)/vec3(255,255,255);//	rum
	vec3 RumMidTone = RumBright * vec3(0.7,0.5,0.1);//vec3(181, 81, 4)/vec3(255,255,255);//	rum

	vec3 Colour = RumMidTone;
		
	vec3 DirToLight = normalize( WorldLightPosition-WorldPosition );
	float Dot = dot( DirToLight, Normal );

	Colour = mix( Colour, RumBright, Dot );
	
	//	specular
	float DotMax = mix( 1.0, 0.96, Specular ); 
	if ( Dot > DotMax )
		Colour = vec3(1,1,1);
		
	return vec4( Colour, 1.0 );
}

vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, -s, s, c);
	return m * v;
}

#define FloorWhite		(vec3(171, 205, 237) /vec3(255,255,255))
#define FloorBlue		(vec3(87, 139, 189)/vec3(255,255,255))
#define ToasterColour	(vec3(255, 163, 64)/vec3(255,255,255))
#define BreadColour		vec3(0.98, 0.88, 0.72 )
#define BreadSpecular	0.0
#define ToasterSpecular	1.0

vec3 GetFloorColour(vec3 WorldPosition,vec3 WorldNormal)
{
	float CheqSize = 0.4;
	//vec2 Chequer = rotate( WorldPosition.xz, 0.1);
	vec2 Chequer = rotate( WorldPosition.xy, 0.4);
	Chequer = mod( Chequer, CheqSize ) / CheqSize;
	bool x = Chequer.x < 0.5;
	bool y = Chequer.y < 0.5;
	vec3 Colour = (x==y) ? FloorBlue : FloorWhite;
	//return GetLitColour(WorldPosition,WorldNormal,Colour,0.0);
	return Colour;	
}


vec4 GetMaterialColour(float Material,vec3 WorldPos,vec3 WorldNormal)
{
	if ( Material == Mat_Floor )	return vec4(GetFloorColour(WorldPos,WorldNormal),1.0);
	if ( Material == Mat_Toaster )	return GetLitColour(WorldPos,WorldNormal,ToasterColour,ToasterSpecular);
	if ( Material == Mat_Bread )	return GetLitColour(WorldPos,WorldNormal,BreadColour,BreadSpecular);
	if ( Material == Mat_Red )		return vec4(1,0,0,1);
	if ( Material == Mat_Blue )		return vec4(0,0,1,1);
	//if ( Material == Mat_None )	
	return vec4(0,0,0,0);
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

void main()
{
	vec3 RayPos,RayDir;
	GetWorldRay( RayPos, RayDir );
	vec4 HitDistance = GetRayCastDistanceHeatMaterial(RayPos,RayDir).xzzy;
	vec3 HitPos = RayPos + (RayDir*HitDistance.x); 
	vec3 Normal = calcNormal(HitPos);

	vec4 Colour = GetMaterialColour(HitDistance.w,HitPos,Normal);
		
	//Colour.xyz *= mix(1.0,0.7,HitDistance.y);	//	ao from heat

	
	float Shadowk = 3.00;
	vec3 ShadowRayPos = HitPos+Normal*0.1;
	vec3 ShadowRayDir = normalize(WorldLightPosition-HitPos);
	float Shadow = softshadow( ShadowRayPos, ShadowRayDir, Shadowk );
	//float Shadow = HardShadow( ShadowRayPos, ShadowRayDir );
	Colour.xyz *= mix( ShadowMult, 1.0, Shadow );//Shadow * ShadowMult;

	gl_FragColor = Colour;
	//if ( Colour.w == 0.0 )	discard;
}
`;
