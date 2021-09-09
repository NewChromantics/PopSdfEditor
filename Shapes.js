import {MatrixInverse4x4,Normalise3,Add3,Distance3,GetRayPositionAtTime,GetRayRayIntersection3} from './PopEngineCommon/Math.js'

export default function()
{
	//	make a shape factory?
};

export class Shape_t
{
}

//	if the input position is a string, it's already a variable
//	if not, convert to vec3
function PositionToString(Position)
{
	if ( typeof Position == typeof '' )
		return Position;
		
	let [x,y,z] = Position;
	return `vec3(${x},${y},${z})`;
}

export class Box_t extends Shape_t
{
	constructor(Sizex=1,Sizey=1,Sizez=1)
	{
		super();
		this.Size = [Sizex,Sizey,Sizez];
	}
	
	
	GetSdf(Parameters,Position)
	{
		Position = PositionToString(Position);
		let rx = (this.Size[0] / 2).toFixed(5);
		let ry = (this.Size[1] / 2).toFixed(5);
		let rz = (this.Size[2] / 2).toFixed(5);
		let r = `vec3(${rx},${ry},${rz})`;
		return `sdBox( ${Parameters}, ${Position}, ${r} )`;
	}
}

export class Line_t extends Shape_t
{
	constructor(Offx=1,Offy=1,Offz=1,Radius=1)
	{
		super();
		this.EndOffset = [Offx,Offy,Offz];
		this.Radius = Radius;
	}
	
	GetSdf(Parameters,Position)
	{
		Position = PositionToString(Position);
		let Offset = PositionToString(this.EndOffset);
		let r = this.Radius.toFixed(5);
		let s = Position;
		let e = `${Position} + ${Offset}`;
		return `sdCapsule( ${Parameters}, ${s}, ${e}, ${r} )`;
	}
}

export class Sphere_t extends Shape_t
{
	constructor(SphereRadius=1)
	{
		super();
		this.Radius = SphereRadius;
	}
	
	GetSdf(Parameters,Position)
	{
		Position = PositionToString(Position);
		let r = this.Radius.toFixed(5);
		let s = `vec4(${Position},${r})`;
		return `sdSphere( ${Parameters}, ${s} )`;
	}

}

export const Operators = {};
Operators.OR = 'OR';
Operators.AND = 'AND';
Operators.NOT = 'NOT';

//	tree of shapes joined with operators
export class ShapeTree_t extends Shape_t
{
	constructor()
	{
		super();
		this.Smooth = 0.1;
		this.Shapes = [];
		this.Operator = Operators.OR;
	}

	GetSdf(Parameters,Position)
	{
		if ( !this.Shapes.length )
			return null;
		
		const ChildPreambles = [];
		const ChildSdfValues = [];	//	could be a call, could be a variable (in preamble)
		
		function EnumShapeSdf(Shape)
		{
			//	hmm, does this work, propogating a string down? (it might do... varname + vec3() + vec3())
			//let Pos = Add3( Position, Shape.Offset );
			let ParentPos = PositionToString(Position);
			let ChildPos = PositionToString(Shape.Offset );
			let Pos = `(${ParentPos} + ${ChildPos})`;
			let Sdf = Shape.Shape.GetSdf( Parameters, Pos );
			if ( !Sdf )
				return;
			if ( typeof Sdf == typeof '' )
			{
				ChildSdfValues.push( Sdf );
			}
			else
			{
				ChildPreambles.push( Sdf[0] );
				ChildSdfValues.push( Sdf[1] );
			}
		}
		this.Shapes.forEach(EnumShapeSdf);
		
		let DistanceVar = Math.floor(Math.random()*9999);
		DistanceVar = `d_${DistanceVar}`;
		let Prefix = 
		`
		${ChildPreambles.join('')}
		float ${DistanceVar} = ${ChildSdfValues[0]};
		`;
		for ( let s=1;	s<ChildSdfValues.length;	s++ )
		{
			Prefix += `
			${DistanceVar} = opSmoothUnion( ${DistanceVar}, ${ChildSdfValues[s]}, ${this.Smooth} );
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
		return SubShape.Shape;
	}
}
