import {MatrixInverse4x4,Normalise3,Add3,Distance3,GetRayPositionAtTime,GetRayRayIntersection3} from './PopEngineCommon/Math.js'

export default ``;

//	if the input position is a string, it's already a variable
//	if not, convert to vec3
function PositionToString(Position)
{
	if ( typeof Position == typeof '' )
		return Position;
		
	let [x,y,z] = Position;
	return `vec3(${x},${y},${z})`;
}

export class Box_t
{
	constructor(Sizex,Sizey,Sizez)
	{
		this.Size = [Sizex,Sizey,Sizez];
	}
	
	
	GetSdf(Parameters,Position)
	{
		Position = PositionToString(Position);
		let rx = this.Size[0] / 2;
		let ry = this.Size[1] / 2;
		let rz = this.Size[2] / 2;
		let r = `vec3(${rx},${ry},${rz})`;
		return `sdBox( ${Parameters}, ${Position}, ${r} )`;
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
		Position = PositionToString(Position);
		let Offset = PositionToString(this.EndOffset);
		let r = this.Radius;
		let s = Position;
		let e = `${Position} + ${Offset}`;
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
		Position = PositionToString(Position);
		let r = this.Radius;
		let s = `vec4(${Position},${r})`;
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
			//	hmm, does this work, propogating a string down? (it might do... varname + vec3() + vec3())
			//let Pos = Add3( Position, Shape.Offset );
			let ParentPos = PositionToString(Position);
			let ChildPos = PositionToString(Shape.Offset );
			let Pos = `(${ParentPos} + ${ChildPos})`;
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
