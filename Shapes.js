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
