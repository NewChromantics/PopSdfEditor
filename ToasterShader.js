export default `
precision highp float;
varying vec3 WorldPosition;
uniform mat4 CameraToWorldTransform;
uniform vec3 WorldLightPosition;
uniform float FloorY;
#define FarZ	20.0
#define WorldUp	vec3(0,1,0)


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
	float d = sdPlane(Position,WorldUp,FloorY);
	float tp1 = (Position.y-FloorY)/Direction.y;
	if ( tp1 > 0.0 )
	{
		//d = tp1;	//	gr: why is floorhit distance wrong?
		tp1 = 1.0;
	}
	else
	{
		tp1 = 0.0;
	}
	return vec2(d,tp1);
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
#define ToastSize	vec3( ToasterSize.x * 0.7, 0.16, 0.03 )
#define ToastPos1	vec3(0,0.09,0.05)

float sdToast(vec3 Position,vec3 ToastPosition)
{
	Position -= ToastPosition;
	float Hole1 = sdBox( Position, vec3(0,0,0), ToastSize/2.0 );
	return Hole1;
}
float sdToaster(vec3 Position)
{
	float Box = sdBox( Position, vec3(0,0,0), ToasterSize/2.0 );
	float Hole1 = sdBox( Position, vec3(0,0.05,0.05), HoleSize/2.0 );
	float Hole2 = sdBox( Position, vec3(0,0.05,-0.05), HoleSize/2.0 );
	float Hole = min(Hole1,Hole2);
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



float Map(vec3 Position,vec3 Dir)
{
	float d = 999.0;
	//d = min( d, sdSphere( Position, vec4(0,0,0,0.10) );
	d = min( d, sdFloor(Position,Dir).x );	//	only need this for calcnormal
	d = min( d, sdToaster(Position) );	//	only need this for calcnormal
	d = min( d, sdToast(Position,ToastPos1) );	//	only need this for calcnormal
	return d;
}

vec3 calcNormal(vec3 pos)
{
	vec2 e = vec2(1.0,-1.0)*0.5773;
	const float eps = 0.0005;
	vec3 Dir = vec3(0,0,0);
	return normalize( e.xyy * Map( pos + e.xyy*eps,Dir ) + 
					  e.yyx * Map( pos + e.yyx*eps,Dir ) + 
					  e.yxy * Map( pos + e.yxy*eps,Dir ) + 
					  e.xxx * Map( pos + e.xxx*eps,Dir ) );
}

//	returns distance + hit(later: material)
vec2 GetRayCastDistance(vec3 RayPos,vec3 RayDir)
{
	vec2 FloorTop = sdFloor(RayPos,RayDir);
	float DidHitFloor = FloorTop.y;
	float MaxDistance = mix( FarZ, DidHitFloor, FloorTop.x ); 
	float RayDistance = 0.0;
	float Hit = DidHitFloor;	//	change to material later. 0 = miss
	for ( int s=0;	s<30;	s++ )
	{
		vec3 HitPos = RayPos + (RayDir*RayDistance);
		float StepDistance = Map(HitPos,RayDir);
		RayDistance += StepDistance;
		if ( RayDistance >= MaxDistance )
			break;
		if ( StepDistance < 0.005 )
		{
			Hit = 1.0;	//	change to material
			break;
		}
	}
	return vec2( RayDistance, Hit );
}

void main()
{
	vec3 RayPos,RayDir;
	GetWorldRay( RayPos, RayDir );
	vec4 HitDistance = GetRayCastDistance(RayPos,RayDir).xxxy;
	vec3 HitPos = RayPos + (RayDir*HitDistance.x); 
	vec3 Normal = calcNormal(HitPos);
	
	//	shadow
	vec4 HitShadow = GetRayCastDistance( HitPos+Normal*0.1, normalize(WorldLightPosition-HitPos) ).xxxy;
	
	Normal += 1.0;
	Normal /= 2.0;
	Normal *= 1.0 - HitShadow.w;
	gl_FragColor = mix( vec4(1,0,0,1), vec4(Normal,1), HitDistance.w );
}
`;
