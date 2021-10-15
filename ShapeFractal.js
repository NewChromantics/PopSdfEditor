import { Shape_t, PositionToString } from './Shapes.js'




const sdFractal = `
float sdFractal(vec3 z,vec3 Transform)
{
	//z -= Transform;
	vec3 a1 = vec3(1,1,1);
	vec3 a2 = vec3(-1,-1,1);
	vec3 a3 = vec3(1,-1,-1);
	vec3 a4 = vec3(-1,1,-1);
	vec3 c;
	int n = 0;
	float dist, d;
	#define Iterations	10
	#define Scale 2.0
	for ( int n=0;	n<Iterations;	n++ ) 
	{
		c = a1; dist = length(z-a1);
		d = length(z-a2); if (d < dist) { c = a2; dist=d; }
		d = length(z-a3); if (d < dist) { c = a3; dist=d; }
		d = length(z-a4); if (d < dist) { c = a4; dist=d; }
		z = Scale*z - c*(Scale-1.0);
	}
	int nn = Iterations-0;
	return length(z) * pow(Scale, float(-nn));
}
`;



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
