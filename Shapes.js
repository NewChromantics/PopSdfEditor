import {MatrixInverse4x4,Normalise3,Add3,Distance3,GetRayPositionAtTime,GetRayRayIntersection3} from './PopEngineCommon/Math.js'

export default ``;

export class Box_t
{
	constructor(Sizex,Sizey,Sizez)
	{
		this.Size = [Sizex,Sizey,Sizez];
	}
	
	
	GetSdf(Parameters,Position)
	{
		let [x,y,z] = Position;
		let rx = this.Size[0] / 2;
		let ry = this.Size[1] / 2;
		let rz = this.Size[2] / 2;
		let c = `vec3(${x},${y},${z})`;
		let r = `vec3(${rx},${ry},${rz})`;
		return `sdBox( ${Parameters}, ${c}, ${r} )`;
	}
}

export class Line_t
{
	constructor(Offx,Offy,Offz,Radius)
	{
		this.EndOffset = [Offx,Offy,Offz];
		this.Radius = Radius;
	}
	
	GetSdf(Parameters,Position)
	{
		let [sx,sy,sz] = Position;
		let [ex,ey,ez] = Add3( Position, this.EndOffset );
		let r = this.Radius;
		let s = `vec3(${sx},${sy},${sz})`;
		let e = `vec3(${ex},${ey},${ez})`;
		return `sdCapsule( ${Parameters}, ${s}, ${e}, ${r} )`;
	}
}

export class Sphere_t
{
	constructor(SphereRadius)
	{
		this.Radius = SphereRadius;
	}
	
	GetSdf(Parameters,Position)
	{
		let [x,y,z] = Position;
		let r = this.Radius;
		let s = `vec4(${x},${y},${z},${r})`;
		return `sdSphere( ${Parameters}, ${s} )`;
	}

}

export const Operators = {};
Operators.OR = 'OR';
Operators.AND = 'AND';
Operators.NOT = 'NOT';

//	tree of shapes joined with operators
export class ShapeTree_t
{
	constructor()
	{
		this.Smooth = 0.1;
		this.Shapes = [];
		this.Operator = Operators.OR;
	}

	GetSdf(Parameters,Position)
	{
		if ( !this.Shapes.length )
			return null;
		
		function GetShapeSdf(Shape)
		{
			let Pos = Add3( Position, Shape.Offset );
			let Sdf = Shape.Shape.GetSdf( Parameters, Pos );
			return Sdf; 
		}
		const ShapeSdfs = this.Shapes.map( GetShapeSdf );

		let DistanceVar = Math.floor(Math.random()*9999);
		DistanceVar = `d_${DistanceVar}`;
		let Prefix = 
		`
		float ${DistanceVar} = ${ShapeSdfs[0]};
		`;
		for ( let s=1;	s<ShapeSdfs.length;	s++ )
		{
			Prefix += `
			${DistanceVar} = opSmoothUnion( ${DistanceVar}, ${ShapeSdfs[s]}, ${this.Smooth} );
			`;
		}
		
		return [Prefix,DistanceVar];
	}
	
	AddShape(Shape,Offset=[0,0,0])
	{
		const SubShape = {};
		SubShape.Shape = Shape;
		SubShape.Offset = Offset;
		this.Shapes.push(SubShape);
	}
}
