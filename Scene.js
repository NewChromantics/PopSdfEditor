import PromiseQueue from './PopEngineCommon/PromiseQueue.js'

export default '';

export class Actor_t
{
	constructor(Name)
	{
		this.Name = Name;
		this.OnActorChanged = function(){};

		this.Position = [0.0,0.0,0];
		this.Colour = [0,0.5,0.5,1];
		this.Specular = 1;

		this.Shape = null;
	}
		
	OnChanged(Change)
	{
		this.OnActorChanged(this,Change);
	}
	
	GetRenderPosition(GizmoManager)
	{
		const Gizmo = GizmoManager.GetGizmo(this.Name, this.Position );
		if ( !Gizmo )
			return this.Position.slice();
		return Gizmo.GetRenderPosition();
	}
	
	GetSdf(Parameters,VariableName,GizmoManager)
	{
		let Position = this.GetRenderPosition(GizmoManager);
		const ParamsSource = Parameters.join(',');
		if ( !this.Shape )
			return null;
		
		if ( VariableName )
			Position = VariableName;
		
		return this.Shape.GetSdf( ParamsSource, Position );
	}
}

export class SceneManager_t
{
	constructor()
	{
		this.WorldLightPosition = [-0.4,1.4,-1.4];
		this.Actors = [];
		this.SceneChangedQueue = new PromiseQueue('SceneChangedQueue');
	}
	
	GetBoundingBox()
	{
		let Size = 100;
		const Box = {};
		Box.Min = [-Size,-Size,-Size];
		Box.Max = [Size,Size,Size];
		return Box;
	}
	
	async WaitForChange()
	{
		return this.SceneChangedQueue.WaitForLatest();
	}
	
	GetActor(Name)
	{
		return this.Actors.find( a => a.Name == Name );
	}
	
	DeleteActor(Name)
	{
		this.Actors = this.Actors.filter( a => a.Name != Name );
		this.SceneChangedQueue.Push('DeletedActor');
	}
	
	GetLightPosition(GizmoManager)
	{
		const Gizmo = GizmoManager.GetGizmo('Light', this.WorldLightPosition );
		if ( Gizmo )
			return Gizmo.GetRenderPosition();
			
		return this.WorldLightPosition.slice();
	}
	
	GetObjectUniforms(GizmoManager)
	{
		const Uniforms = {};
		
		Uniforms.WorldLightPosition = this.GetLightPosition(GizmoManager);

		//	expand [should be] unique actor uniform into our uniforms
		const ActorActorUniforms = this.Actors.map( a => this.GetActorUniforms(a,GizmoManager) );
		for ( let ActorActorUniform of ActorActorUniforms )
			for ( let ActorUniform of Object.values(ActorActorUniform) )
				Uniforms[ActorUniform.Uniform] = ActorUniform.Value;
		
		return Uniforms;
	}
	
	GetActorUniforms(Actor,GizmoManager)
	{
		const Uniforms = {};
		Uniforms.Position = {};
		Uniforms.Position.Uniform = `${Actor.Name}_Position_`;
		Uniforms.Position.Value = Actor.GetRenderPosition(GizmoManager);
		
		Uniforms.Colour = {};
		Uniforms.Colour.Uniform = `${Actor.Name}_Colour_`;
		Uniforms.Colour.Value = [...Actor.Colour,1,1,1,1].slice(0,4);
		
		Uniforms.Specular = {};
		Uniforms.Specular.Uniform = `${Actor.Name}_Specular_`;
		Uniforms.Specular.Value = Actor.Specular;
		
		return Uniforms;
	}
	
	GetSdfSource(GizmoManager,BakeValues=false)
	{
		let Globals = [];
		let MaterialMaps = [];
		let MaterialSource = [];
		function PushMaterial(FunctionName,MaterialName,Colour,Specular)
		{
			const MaterialMap = {};
			MaterialMap.FunctionName = FunctionName;
			MaterialMap.MaterialName = MaterialName;
			MaterialMap.Colour = Colour;
			MaterialMaps.push(MaterialMap);
			
			const Source = `
			if ( Material == ${MaterialName} )	return GetMaterialColour_${FunctionName}( WorldPosition, WorldNormal, Shadow, ${Colour}, ${Specular} );
			`;
			MaterialSource.push(Source);
			
			Globals.push(`uniform vec4 ${Colour};`);
			Globals.push(`uniform float ${Specular};`);
		}
		
		//	need to manage material uniforms here
		function ActorToSdf(Actor,ActorIndex)
		{
			const ActorUniforms = this.GetActorUniforms(Actor,GizmoManager);
			
			
			//	setup material
			const Material = `${Actor.Name}_Material`;
			//	just some id
			const Materialf = `(1000.0 + ${ActorIndex}.0)`;
			Globals.push(`const float ${Material} = ${Materialf};`);
			
			PushMaterial('Lit',Material,ActorUniforms.Colour.Uniform,ActorUniforms.Specular.Uniform);
			
			
			//	setup position/map/sdf
			let PositionVariableName = BakeValues ? null : ActorUniforms.Position.Uniform;
			let Sdf = Actor.GetSdf([`Position`],PositionVariableName,GizmoManager);
			
			if ( PositionVariableName )
			{
				//	step/version 1, pos as constant
				const [x,y,z] = Actor.GetRenderPosition(GizmoManager);
				//const Global = `const vec3 ${PositionVariableName} = vec3( ${x}, ${y}, ${z} );`
				const Global = `uniform vec3 ${PositionVariableName};`
				Globals.push(Global);
			}			
			
			//	if GetSdf returns an array, the last line goes in the usual distance code
			//	the rest is prefix
			let Prefix = '';
			if ( Array.isArray(Sdf) )
			{
				let Var = Sdf.pop();
				Prefix = Sdf.join('');
				Sdf = Var;
			}
			
			let Source = '';
			Source += Prefix;
			Source += `d = Closest( d, dm_t(${Sdf},${Material}) );`;
			return Source;
		}
		let MapSdfs = this.Actors.map( ActorToSdf.bind(this) );
		
		const Source = {};
		Source.MapSdfs = MapSdfs;
		Source.Globals = Globals;
		Source.MaterialSource = MaterialSource;
		return Source;
	}
	
	OnActorChanged(Actor,ChangeKey)
	{
		this.SceneChangedQueue.Push(ChangeKey);
	}
	
	AddActor(Actor)
	{
		this.Actors.push(Actor);
		Actor.OnActorChanged = this.OnActorChanged.bind(this);
		this.SceneChangedQueue.Push('AddedActor');
		return Actor;
	}
}
