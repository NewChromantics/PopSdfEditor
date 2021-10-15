import {MatrixInverse4x4,Normalise3,Add3,Distance3,GetRayPositionAtTime,GetRayRayIntersection3} from './PopEngineCommon/Math.js'

export default function()
{
	//	make a shape factory?
};


export class Shape_t
{
	constructor()
	{
		this.Position = [0.0,0.0,0];
	}
}


//	if the input position is a string, it's already a variable
//	if not, convert to vec3
export function PositionToString(Position)
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
		this.Smooth = 0.0;
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
			//	not been converted to type
			if ( !Shape.GetSdf )
			{
				console.warn(`Found shape that's not a shape_t`);
				return;
			}
			let ParentPos = PositionToString(Position);
			let ChildPos = PositionToString(Shape.Position );
			let Pos = `(${ParentPos} + ${ChildPos})`;
			let Sdf = Shape.GetSdf( Parameters, Pos );
			if ( !Sdf )
				return;
			if ( typeof Sdf == typeof '' )
			{
				ChildSdfValues.push( Sdf );
			}
			else
			{
				ChildPreambles.push( Sdf.Prefix );
				ChildSdfValues.push( Sdf.Sdf );
			}
		}
		this.Shapes.forEach(EnumShapeSdf);
		
		if ( !ChildSdfValues.length )
			return null;
		
		let DistanceVar = Math.floor(Math.random()*9999);
		DistanceVar = `d_${DistanceVar}`;
		let Prefix = 
		`
		${ChildPreambles.join('')}
		float ${DistanceVar} = ${ChildSdfValues[0]};
		`;
		for ( let s=1;	s<ChildSdfValues.length;	s++ )
		{
			const Smoothf = this.Smooth.toFixed(4);
			Prefix += `
			${DistanceVar} = opSmoothUnion( ${DistanceVar}, ${ChildSdfValues[s]}, ${Smoothf} );
			`;
		}
		
		const SdfData = {};
		SdfData.Prefix = Prefix;
		SdfData.Sdf = DistanceVar;
		return SdfData;
	}
	
	AddShape(Shape)
	{
		this.Shapes.push(Shape);
		return Shape;
	}
}

//	auto detect shapes from json and create instances
export function JsonToShape(ShapeJson)
{
	if ( !ShapeJson )
		return null;
	if ( typeof ShapeJson != typeof {} )
		return null;



	const JsonKeys = Object.keys( ShapeJson );
	function HasAllKeys(Type)
	{
		const TypeKeys = Object.keys( new Type );
		//const JsonKeys = Object.keys( ShapeJson );
		for ( let RequiredKey of TypeKeys )
			if ( !JsonKeys.includes(RequiredKey) )
				return false;
		return true;
	}
	const ShapeTypes = [Box_t,Sphere_t,Line_t,ShapeTree_t];



	//	first look for children, then if we HAVE children, we have to turn into a tree, even if we're not one
	let ChildShapes = [];

	let PotentialChildren = [];
	if ( Array.isArray(ShapeJson) )
	{
		PotentialChildren = ShapeJson;
		//	gr: can use this for both arrays and objects!
		PotentialChildren = Object.values(ShapeJson);
	}
	else
	{
		PotentialChildren = Object.values(ShapeJson);
	}	
	ChildShapes = PotentialChildren.map(JsonToShape);
	ChildShapes = ChildShapes.filter( s => s!=null );



	
	let RootShape;
	if ( !Array.isArray(ShapeJson) )	//	dont need this, but quicker for debugging (and probably saving a load of cpu time)
	{	
		for ( let ShapeType of ShapeTypes )
		{
			if ( !HasAllKeys(ShapeType) )
				continue;
			RootShape = new ShapeType();
			
			//	gr: only assign expected keys?
			//	gr: probably dont wanna lose meta, but for clarity, for now...
			//Object.assign( RootShape, ShapeJson );
			const TypeKeys = Object.keys(RootShape);
			for ( let Key of TypeKeys )
			{
				if ( Key != 'Shapes' )
					RootShape[Key] = ShapeJson[Key];
			}
		}
	}
	
	if ( !RootShape && ChildShapes.length==0 )
		return null;
	
	//	if I am an empty shape tree, collapse (just remove it)
	//	may just remove from ShapeTypes? but we may want to keep some meta
	if ( RootShape instanceof ShapeTree_t )
	{
		//	this will always be the case with a new instance...
		if ( RootShape.Shapes.length == 0 )
			RootShape = null;
	}
	
	if ( !RootShape && ChildShapes.length==1 )
		return ChildShapes[0];
	
	//	do we need to be a tree?
	let RequireTree = (RootShape instanceof ShapeTree_t) || ( ChildShapes.length>0);
	
	if ( RequireTree && !(RootShape instanceof ShapeTree_t) )
	{
		//	convert to tree
		//	todo: if tree has non-basic union, we can't just move root into children
		//		but if we're in this situation... probably doesnt anyway?
		//		unless we drop a tree onto a basic shape
		ChildShapes.push( RootShape );
		RootShape = new ShapeTree_t();
	}
	
	for ( let ChildShape of ChildShapes )
	{
		if ( ChildShape == null )
			continue;
		RootShape.AddShape(ChildShape);
	}
	
	return RootShape;
}
