export default '';
import {MatrixInverse4x4,Normalise3,Add3,Distance3,GetRayPositionAtTime,GetRayRayIntersection3} from './PopEngineCommon/Math.js'
import PromiseQueue from './PopEngineCommon/PromiseQueue.js'


function GetHoverButton()
{
	return 'Hover';
}

export class GizmoManager_t
{
	constructor()
	{
		this.Gizmos = [];
		
		//	button we're using to grab axis
		this.SelectedButton = null;	
		this.SelectedGizmoIndex = null;
		this.SelectedGizmoTime = null;	//	grab t (todo: rename from [ray]time to... normal?)
		
		//	we put names of gizmos in this queue to reduce queue size
		this.GizmoChangedQueue = new PromiseQueue('GizmoChangedQueue');
	}
	
	async WaitForGizmoChange()
	{
		const ChangedGizmoName = await this.GizmoChangedQueue.WaitForNext();
		const Gizmo = this.GetGizmo(ChangedGizmoName);
		return Gizmo;
	}
	
	OnGizmoChanged(Gizmo)
	{
		this.GizmoChangedQueue.PushUnique( Gizmo.Name );
	}
	
	//	if initial pos is specified, we create any missing gizmos
	GetGizmo(Name,InitialPosition=null)
	{
		let Gizmo = this.Gizmos.find( g => g.Name==Name );
		if ( Gizmo )
			return Gizmo;
			
		if ( !InitialPosition )
			return null;
			
		function OnChanged()
		{
			this.OnGizmoChanged(Gizmo);
		}
		Gizmo = new GizmoAxis_t(Name,OnChanged.bind(this));
		Gizmo.Position = InitialPosition.slice(); 
		this.Gizmos.push(Gizmo);
		return Gizmo;
	}
	
	GetUniforms()
	{
		const Uniforms = {};
		Uniforms.AxisPositions = this.Gizmos.map( a => a.GetUniform4() ).flat();
		return Uniforms;
	}
	
	Iteration(InputRays)
	{
		//	do axis hover
		let Hit;
		
		if ( this.SelectedButton && !Object.keys(InputRays).includes(this.SelectedButton) )
		{
			//	let go
			const Gizmo = this.Gizmos[this.SelectedGizmoIndex]; 
			Gizmo.BakeSelectedOffset();
			this.OnGizmoChanged(Gizmo);
			//this.SelectedButton = null;
			//this.SelectedAxisIndex = null;
		}
		else if ( this.SelectedButton )
		{
			const Gizmo = this.Gizmos[this.SelectedGizmoIndex]; 
			Hit = Gizmo.GetAxisIntersection(InputRays,false);
			//	move axis
			if ( !Hit )
			{
				console.warning(`expected hit`);
			}
			else
			{
				Gizmo.SetRenderSelectedAxisOffset( Hit.AxisTime - this.SelectedGizmoTime );
				//console.log(`Move axis from ${this.SelectedGizmoTime} to ${Hit.AxisTime}`);
				this.OnGizmoChanged(Gizmo);
			}
		}
		else 
		{
			//	new selection
			for ( let i=0;	i<this.Gizmos.length;	i++ )
			{
				Hit = this.Gizmos[i].GetAxisIntersection(InputRays,true);
				if ( !Hit )
					continue;
					
				if ( Hit.Button == GetHoverButton() )
					continue;

				this.SelectedButton = Hit.Button;
				this.SelectedGizmoIndex = i;
				this.SelectedGizmoTime = Hit.AxisTime;
				this.Gizmos[i].SelectedAxis = Hit.AxisIndex;
				break;
			}
		}
		
		if ( !Hit )
		{
			this.SelectedButton = null;
			this.SelectedGizmoIndex = null;
			this.SelectedGizmoTime = null;
			this.Gizmos.forEach( a => a.SelectedGizmo=null );
			this.Gizmos.forEach( a => a.SelectedGizmoRenderOffset=0 );
		}
	}
}


//	line with a handle from center outwards in some direction
export class GizmoRadius_t
{
	constructor(Name,GetPosition,OnChanged)
	{
		this.Name = Name;
		this.GetPosition = GetPosition;
		this.OnChanged = OnChanged; 

		this.Radius = 1;
	}
}


export class GizmoAxis_t
{
	constructor(Name,OnChanged)
	{
		this.Name = Name;
		this.Position = [0,0,0];
		this.SelectedAxis = null;
		this.SelectedAxisRenderOffset = 0;
		this.OnChanged = OnChanged; 
	}
	
	BakeSelectedOffset()
	{
		this.Position[this.SelectedAxis] += this.SelectedAxisRenderOffset;
		this.SelectedAxis = null;
		this.SelectedAxisRenderOffset = 0;
		this.OnChanged( this.Position, true );
	}
	
	SetRenderSelectedAxisOffset(Offset)
	{
		this.SelectedAxisRenderOffset = Offset;
	}
	
	GetRenderPosition()
	{
		let Pos = this.Position.slice();
		
		if ( this.SelectedAxis !== null )
		{
			Pos[this.SelectedAxis] += this.SelectedAxisRenderOffset;
		}
		return Pos;
	}
	
	GetUniform4()
	{
		let Pos = this.GetRenderPosition();
		
		let RenderAxiss = this.SelectedAxis === null ? (1|2|4) : (1<<this.SelectedAxis);
		//let RenderAxiss = this.SelectedAxis === null ? [1,2,3] : [this.SelectedAxis];
		//RenderAxiss = RenderAxiss.reduce( (v,Current) => {return Current|(1<<v)}, 0 );
		Pos.push( RenderAxiss );
		return Pos;
	}
	
	GetAxisRays(OnlySelected=false)
	{
		let AxisSize = 0.1;
		let AxisRadius = (AxisSize*0.001);
		let Rays = [];
		let PushLine = (x,y,z)=>//	xyz=offset
		{
			const Ray = {};
			Ray.Start = this.Position.slice();
			Ray.Direction = Normalise3([x,y,z]);
			Ray.End = Add3( Ray.Start, [x,y,z] );
			Rays.push(Ray);
		}
		OnlySelected = OnlySelected && this.SelectedAxis!==null;
		let Includex = (!OnlySelected)||(this.SelectedAxis==0);
		let Includey = (!OnlySelected)||(this.SelectedAxis==1);
		let Includez = (!OnlySelected)||(this.SelectedAxis==2);
		if ( Includex )
			PushLine(AxisSize,0,0);
		if ( Includey )
			PushLine(0,AxisSize,0);
		if ( Includez )
			PushLine(0,0,AxisSize);
		return Rays;
	}
	
	GetAxisIntersection(InputRays,MustBeOnAxis)
	{
		function GetAxisIntersection(AxisRay,InputRay,AxisIndex,Button)
		{
			let AxisSize = 0.1;
			//let AxisRadius = (AxisSize*0.001);
			let AxisRadius = 0.01;
		
			const Intersection = GetRayRayIntersection3(InputRay.Start,InputRay.Direction,AxisRay.Start,AxisRay.Direction);
			const Hit = {};
			Hit.DistanceFromCamera = Intersection.IntersectionTimeA;
			Hit.PositionOnAxis = GetRayPositionAtTime(AxisRay.Start,AxisRay.Direction,Intersection.IntersectionTimeB);
			Hit.PositionOnInput = GetRayPositionAtTime(InputRay.Start,InputRay.Direction,Intersection.IntersectionTimeA);
			Hit.DistanceFromAxis = Distance3(Hit.PositionOnAxis,Hit.PositionOnInput);
			Hit.AxisTime = Intersection.IntersectionTimeB;
			Hit.OnAxis = (Hit.AxisTime>=0) && (Hit.AxisTime<=1);
			Hit.OnAxis = Hit.OnAxis && Hit.DistanceFromAxis < AxisRadius;
			Hit.AxisIndex = AxisIndex;
			Hit.Button = Button;
			if ( Button == 'Left' )
			{
				//console.log(Hit);////console.log(Hit.Distance);
			}
			return Hit;
		}
	
		const OnlySelected = true;
		let AxisRays = this.GetAxisRays(OnlySelected);
		let AxisHits = [];
		//for ( let InputRay of Object.values(InputRays) )
		for ( let [Button,InputRay] of Object.entries(InputRays) )
		{
			let Hits = AxisRays.map( (ar,i) => GetAxisIntersection(ar,InputRay,i,Button) );
			AxisHits.push( ...Hits );
		}
		
		function SortDistance(a,b)
		{
			return (a.Distance < b.Distance) ? -1 : 1;
		}
		if ( MustBeOnAxis )
			AxisHits = AxisHits.filter( h => h.OnAxis );
		AxisHits.sort( SortDistance );
		return AxisHits[0];
	}
}
