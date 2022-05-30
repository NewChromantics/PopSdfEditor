import { Shape_t, PositionToString } from './Shapes.js'




const sdFractal_Tet = `

//	gr: this sphere-tests in tetrahedrons getting bigger and bigger
//	so we end up with a bumpy surface
//	http://blog.hvidtfeldts.net/index.php/2011/08/distance-estimated-3d-fractals-iii-folding-space/
float sdFractal(vec3 z,vec3 Transform)
{
	z -= Transform;
	vec3 a1 = vec3(1,0.3,1);
	vec3 a2 = vec3(-1,-1,1);
	vec3 a3 = vec3(1,-1,-1);
	vec3 a4 = vec3(-1,1,-1);
	vec3 c;
	int n = 0;
	float dist, d;
	
	//#define sdFrac(Vertex)	sdBox( z, Vertex, vec3(0.01) ) 
	#define sdFrac(Vertex)	sdSphere( z, vec4( Vertex, 0.01 ) )
	
	#define Iterations	8
	#define Scale 2.0
	for ( int n=0;	n<Iterations;	n++ ) 
	{
		c = a1; 
		dist = 999999.0;
		d = sdFrac(a1); if (d < dist) { c = a1; dist=d; }
		d = sdFrac(a2); if (d < dist) { c = a2; dist=d; }
		d = sdFrac(a3); if (d < dist) { c = a3; dist=d; }
		d = sdFrac(a4); if (d < dist) { c = a4; dist=d; }
		z = Scale*z - c*(Scale-1.0);
	}
	int nn = Iterations-0;
	return length(z) * pow(Scale, float(-nn));
}
`;
const sdFractal = sdFractal_Tet;


export class Fractal_t extends Shape_t
{
	constructor(Sizex=1,Sizey=1,Sizez=1)
	{
		super();
		this.Size = [Sizex,Sizey,Sizez];
	}
	
	
	GetSdf(Parameters,Position)
	{
		Position = PositionToString(Position);
		
		const SdfData = {};
		SdfData.Globals = [sdFractal];
		
		SdfData.Sdf = `sdFractal( ${Parameters}, ${Position} )`;
		return SdfData;
	}
}
