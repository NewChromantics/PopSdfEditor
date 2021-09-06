import {GetRayRayIntersection3,Clamp01} from './PopEngine/Math.js'

export default class Game_t
{
	constructor()
	{
		this.UserHoverHandle = false;
		this.LastHoverMaterial = 0;
		this.MouseUv = [0.5,0.5];
		this.MouseButtonsDown = {};	//	key=button value=uv
		this.HandleTime = 0;
		this.ToastPositionTime = 0;
		this.ToastVelocity = 0;
		this.Heat = 0;
		this.HeatSpeed = 0.90;
		this.Cook = 0;
		const CookSeconds = 14;
		this.CookSpeed = 1/CookSeconds;	//	per sec

		this.ToasterSize	= [ 0.4,	0.2,		0.2 ];
		this.HandleSize		= [ 0.04,	0.02,		0.04];
		this.HandleTop		= [ 0.24,	0.08,	0.06 ];
		this.HandleBottom	= [ 0.24,	-0.08,	0.06 ];
		this.FloorY = 0.30;
		this.WallZ = 1.30;
		this.WorldLightPosition = [-0.9,2.4,-1.8];
	}
	
	async GameLoop()
	{
	}
	
	GetUserHandleTime(InputRays)
	{
		const HandleRay = {};
		HandleRay.Start = this.HandleTop;
		HandleRay.Direction = [0,-1,0];
		const HandleTimeLength = this.HandleTop[1] - this.HandleBottom[1];
		
		const HandleTimes = [];
		
		for ( let Ray of Object.values(InputRays) )
		{
			const Intersection = GetRayRayIntersection3(Ray.Start,Ray.Direction,HandleRay.Start,HandleRay.Direction);
			let Time = Intersection.IntersectionTimeB / HandleTimeLength;
			Time = Clamp01(Time);
			HandleTimes.push(Time);
		}
		
		HandleTimes.push(null);
		return HandleTimes[0];
	}
	
	Iteration(TimeDelta,InputRays)
	{
		//GameState.UserHoverHandle = GameState.LastHoverMaterial == Mat_Handle;
		//GameState.UserHoverHandle = Time % 1 < 0.5;

		//	spring handle up
		this.HandleTime -= 0.4;
		this.HandleTime = Math.max(0,this.HandleTime);
		const HandleTime = this.GetUserHandleTime(InputRays);
		this.UserHoverHandle = ( HandleTime !== null );
		if ( HandleTime !== null )
		{
			this.HandleTime = HandleTime;
		}
		
		
		
		//	+gravity
		this.ToastVelocity += 2;	//	basically m/s
		//	see if there's force pushing us up (ie, handle has moved up)
		if ( this.ToastPositionTime > this.HandleTime )
		{
			let Force = this.ToastPositionTime - this.HandleTime;
			Force *= 68;
			console.log(`Force=${Force}`);
			//Force = Math.min( Force, 28 );
			//GameState.ToastVelocity = 0;//	helps with the bounce, but need double-movements from force
			this.ToastVelocity -= Force;
			//	avoids the velocity=0 below
			this.ToastPositionTime = this.HandleTime;
		}	
		this.ToastPositionTime += this.ToastVelocity * TimeDelta;
		//	clamp/collision
		if ( this.ToastPositionTime > this.HandleTime )
		{
			this.ToastPositionTime = this.HandleTime;
			this.ToastVelocity = 0;
		}
		
		
		
		
		
		//	update heat
		if ( this.HandleTime >= 1.0 )
		{
			this.Heat += this.HeatSpeed * TimeDelta;
			this.Heat = Math.min( 1, this.Heat );
		}
		else
		{
			this.Heat -= this.HeatSpeed * TimeDelta;
			this.Heat = Math.max( 0, this.Heat );
		}
		
		//	cook bread
		this.Cook += this.CookSpeed * this.Heat * TimeDelta;
		this.Cook = Math.min( 1, this.Cook );
	}
	
	GetUniforms()
	{
		return Object.assign({},this);
	}
}
