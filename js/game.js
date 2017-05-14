var debugCanvas;
var debugCtx;
var canvas;
var ctx;
var world;
var bC;
var waterLevel = -35;
var stats;

var initscount=0;
var currentTime;
var mechanicsFps = 15;
var timeStep = 1000/mechanicsFps;
var relativeTimescale = 60/mechanicsFps;	//originally tuned for 60fps mechanics
var maxUpdatesPerFrame = 5;
var playerBody;
var willFireGun=false;
var autofireCountdown=0;


//var destroy_list = [];

var floatingPlatform;

var landscapeBlocks=[];
var scheduledBlocksToUpdate=[];
var scheduledBlocksToPurge=[[],[]];

var   b2Vec2 = Box2D.Common.Math.b2Vec2
		, b2Mat22 = Box2D.Common.Math.b2Mat22
        , b2BodyDef = Box2D.Dynamics.b2BodyDef
        , b2Body = Box2D.Dynamics.b2Body
        , b2FixtureDef = Box2D.Dynamics.b2FixtureDef
        , b2Fixture = Box2D.Dynamics.b2Fixture
        , b2World = Box2D.Dynamics.b2World
		, b2WorldManifold = Box2D.Collision.b2WorldManifold
        , b2MassData = Box2D.Collision.Shapes.b2MassData
        , b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape
        , b2CircleShape = Box2D.Collision.Shapes.b2CircleShape
		, b2Shape = Box2D.Collision.Shapes.b2Shape
        , b2DebugDraw = Box2D.Dynamics.b2DebugDraw
	    , b2BuoyancyController = Box2D.Dynamics.Controllers.b2BuoyancyController
          ;

var camTargetPos = new b2Vec2(0,0);
var camPos = new b2Vec2(0,0);
var camVel = new b2Vec2(0,0);
var camPosInterp = new b2Vec2(0,0);
var camLookAhead = new b2Vec2(0,0);
		
window.onresize = aspectFitCanvas;		

function aspectFitCanvas(evt) {
    var ww = window.innerWidth;
    var wh = window.innerHeight;
	var desiredAspect=2;
	var pixelRatio=1;		//set to 0.5 to double size of canvas pixels on screen etc
	if ( ww * canvas.height > wh * canvas.width ) {
		var cw = wh * desiredAspect;
        canvas.style.height = "" + wh + "px";
        canvas.style.width = "" + cw + "px";
		canvas.height = wh*pixelRatio;
		canvas.width = cw*pixelRatio;
    } else {
		var ch = ww / desiredAspect;
        canvas.style.width = "" + ww + "px";
        canvas.style.height = "" + ch + "px";
		canvas.width = ww*pixelRatio;
		canvas.height = ch*pixelRatio;
    }
	canvas.scale = canvas.width / 1000;	//apply some scale factor to drawing which is 1 for width 1000px
    drawingScale = (SCALE/25)*15*canvas.scale;
}		  

var isPlaying=true;		  
function start(){	
	stats = new Stats();
	stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
	document.body.appendChild( stats.dom );
	
	debugCanvas = document.getElementById("b2dCanvas");
    debugCtx = debugCanvas.getContext("2d");
	debugCanvas.style.display="none";

	canvas = document.getElementById("canvas2d");
    ctx = canvas.getContext("2d");
	aspectFitCanvas();
	
	init();
	keyThing.setKeydownCallback(32,function(){			//32=space key
		playerBody.ApplyForce(new b2Vec2(0,-100*forceScale), playerBody.GetWorldCenter());	//upward force
	});
	keyThing.setKeydownCallback(82,function(){			//82=R
		init();
	});
	keyThing.setKeydownCallback(70,function(){			//70=F
		goFullscreen(canvas);
	});
	keyThing.setKeydownCallback(66,function(){			//66=B
		willFireGun=true;
	});
	keyThing.setKeydownCallback(80,function(){			//80=P
		isPlaying = !isPlaying;
		console.log("isPlaying : " + isPlaying);
	});
	
	assetManager.setOnloadFunc(function(){
		currentTime = (new Date()).getTime();
		requestAnimationFrame(update);
	});
	assetManager.setAssetsToPreload({
		EXPL: settings.EXPLOSION_IMAGE_SRC
	});
	
	
}


var SCALE = 100;
var relativeScale = 25/SCALE;	//previously tuned variables for scale=25
var forceScale = Math.pow(relativeScale,3);	//change world by scale - F=ma. mass goes as square of length. accn linear.
var torqueScale = Math.pow(relativeScale,4);	//not sure why - mass goes as square, avg distance from centre goes as linear,
												//so expected power 3. possibly this is what determines steady turn speed, and really
												//should be altering angular damping too.
var thrustForce=15*forceScale;

function init(){
	initscount++;
	console.log("init called. " + initscount);
	
       world = new b2World(
             new b2Vec2(0, 10*relativeScale)    //gravity
          ,  true                 //allow sleep
       );
       
     
	 //
	// Create a buoyancy controller
	//
	bC = new b2BuoyancyController();
	world.AddController(bC);
	
	// set the surface normal
	bC.normal.Set(0,-1);
	
	// set the offset from the top of the canvas
	//bC.offset = -1 * ( canvas_height_m / 2 );
	bC.offset = waterLevel;
	
	// set the water density
	bC.density = 2;
	
	// set linear drag
	bC.linearDrag = 5;
	 
	 
       var fixDef = new b2FixtureDef;
       fixDef.density = 1.0;
       fixDef.friction = 0.5;
       fixDef.restitution = 0.2;
     
	   fixDef.shape = new b2PolygonShape;
	   var bodyDef = new b2BodyDef;
       
	   var levelBoxes = [//[0,0,20,2000, b2Body.b2_staticBody],
						 [2000-20,0,20,2000, b2Body.b2_staticBody],
						 [0,2000,2000,20, b2Body.b2_staticBody],
						 
						 [1000,1000,800,100, b2Body.b2_dynamicBody, 1],
						 [-9900,500,800,100, b2Body.b2_dynamicBody, 1],
	   ];
	   var currentBox, halfwidth, halfheight, bodyType, thisBody;
	   
	   for (bb in levelBoxes){
		   currentBox = levelBoxes[bb];
		   halfwidth = currentBox[2]/2;
		   halfheight = currentBox[3]/2;
   		   bodyType= currentBox[4];
		   bodyDef.type = bodyType;
		   // positions the center of the object (not upper left!)
	       bodyDef.position.x = (currentBox[0]+halfwidth) / SCALE;
           bodyDef.position.y = (currentBox[1]+halfheight) / SCALE;
       
	       fixDef.shape.SetAsBox(halfwidth / SCALE, halfheight / SCALE);
           thisBody = world.CreateBody(bodyDef);
		   thisBody.CreateFixture(fixDef);
		   
		   if (currentBox[5]){floatingPlatform = thisBody;}
	   }
	   
	   //make a special polygon object for level. 
	   //box2d will have a series of line fixtures.
	   //will render using canvas (initially) as a polygon
	   //object will be destructible using clipper.js
	   
	   var landscapeBodyDef = new b2BodyDef;
	   landscapeBodyDef.type = b2Body.b2_staticBody;
	   landscapeBodyDef.position.x = 0;
       landscapeBodyDef.position.y =0;
	   //TODO create fixtures
	   //make some path object suitable for use with jsclipper. attach it to the landscapeBody object
	   var landscapeBodyClippablePath = [[{X:50,Y:50},{X:150,Y:50},{X:150,Y:150},{X:50,Y:150}],
                  [{X:60,Y:60},{X:60,Y:140},{X:140,Y:140},{X:140,Y:60}],
				  [{X:-2000,Y:-1000},{X:0,Y:-1000},{X:0,Y:1000},{X:-2000,Y:1000}],
				  [{X:-1020,Y:-50},{X:-1020,Y:50},{X:-980,Y:50},{X:-980,Y:-50}]
				  ];
		
		//add a grid of circular holes to see impact on framerate
		var circleCoords=[];
		for (var ii=0;ii<20;ii++){
			var ang = ii*Math.PI/10;
			circleCoords.push({X:Math.cos(ang),Y:Math.sin(ang)})
		}
		for (var aa=0;aa<40;aa++){
			for (var bb=0;bb<10;bb++){
				var thisCircle =[];
				for (var ii=0;ii<20;ii++){
					thisCircle.push({X:-1000+aa*25+10*circleCoords[ii].X,Y:75+bb*25-10*circleCoords[ii].Y});
				}
				landscapeBodyClippablePath.push(thisCircle);
			}
		}
		//chop out holes for the levelboxes. initially hard code just one
		//[-9900,500,800,100]
		var levBoxCoords=[];
		levBoxCoords.push({X:-9900/5,Y:500/5});
		levBoxCoords.push({X:-9900/5,Y:500/5+100/5});
		levBoxCoords.push({X:-9900/5+800/5,Y:500/5+100/5});
		levBoxCoords.push({X:-9900/5+800/5,Y:500/5});
		landscapeBodyClippablePath.push(levBoxCoords);
		
		
		
		//add an ellipse, to check the limit on vertices in a polygon shape. seems no real limit here - got up to 2048 ok!
		var num_ellipse_points = 64;
		var ellipse_points = [];
		for (var i = 0; i < num_ellipse_points; i++) {
			var vec = new b2Vec2();
			var ang = 2*Math.PI*i/num_ellipse_points;
			vec.Set(375*Math.cos(ang)/SCALE, 50*Math.sin(ang)/SCALE);
			ellipse_points[i] = vec;
		}
	    bodyDef.type = b2Body.b2_staticBody;
		//bodyDef.type = b2Body.b2_dynamicBody;
		fixDef.shape.SetAsArray(ellipse_points, ellipse_points.length);
		bodyDef.position.x = 1250/SCALE;
		bodyDef.position.y = 250/SCALE;
		world.CreateBody(bodyDef).CreateFixture(fixDef);
		
		//add a rock shape
		var rock_points = [];
		var num_rock_points = 8;
		for (var i = 0; i < num_rock_points; i++) {
			var vec = new b2Vec2();
			var ang = 2*Math.PI*i/num_rock_points;
			vec.Set(100*Math.cos(ang)/SCALE, 50*Math.sin(ang)/SCALE);
			rock_points[i] = vec;
		}
		fixDef.shape.SetAsArray(rock_points, rock_points.length);
		bodyDef.type = b2Body.b2_dynamicBody;
		bodyDef.position.x = -5750/SCALE;
		bodyDef.position.y = -5000/SCALE;
		var rockBody = world.CreateBody(bodyDef)
		rockBody.CreateFixture(fixDef);
		
		//chop the rock's shape out of the landscape.
		chopB2VecArrayFromPath(rockBody, rock_points, landscapeBodyClippablePath );

		function chopB2VecArrayFromPath(bod, b2arr, path){
			var pos= bod.GetPosition();
			var chopArr =[];
			var b2arrlen = b2arr.length;
			for (var ii=b2arrlen-1;ii>-1;ii--){	//for some reason has to backwards! (else the rock falls out of the hole!)
			//for (var ii=0;ii<b2arrlen;ii++){
				var thisb2 = b2arr[ii];
				chopArr.push({X:(pos.x+thisb2.x)*SCALE/5, Y:(pos.y+thisb2.y)*SCALE/5});
				console.log((pos.x+thisb2.x));
			}
			
			//path.push(chopArr);	//only works if entirely within level
			
			//this maybe inefficient - can cpr object be reused? is cutting the whole level (before grid chop) super slow?
			var cpr = new ClipperLib.Clipper();
	
			cpr.AddPaths(path, ClipperLib.PolyType.ptSubject, true);  //use the previous solution as input
			cpr.AddPath(chopArr, ClipperLib.PolyType.ptClip, true);
			
			var succeeded = cpr.Execute(ClipperLib.ClipType.ctDifference, path, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
		}
		
	   ClipperLib.JS.ScaleUpPaths(landscapeBodyClippablePath, 5);
		
	   //chop landscape into a grid
	   var gridOfPaths = chopIntoGrid(landscapeBodyClippablePath);
	   var numBlocks = gridOfPaths.length;
	   for (var ii=0;ii<numBlocks;ii++){
			//create a new body
			var thisGridInfo = gridOfPaths[ii];
			var thisBody = world.CreateBody(landscapeBodyDef);
			thisBody.clippablePath = thisGridInfo.paths;
			thisBody.bounds = thisGridInfo.bounds;
			updateLandscapeFixtures(thisBody);
			landscapeBlocks.push(thisBody);
	   }
	   	   
   	    
	   
       //create some objects
       bodyDef.type = b2Body.b2_dynamicBody;
       for(var i = 0; i < 50; ++i) {
          if(Math.random() > 0.5) {
             fixDef.shape = new b2PolygonShape;
             fixDef.shape.SetAsBox(
                   (Math.random() + 0.1)*(25/SCALE) //half width
                ,  (Math.random() + 0.1)*(25/SCALE) //half height
             );
          } else {
             fixDef.shape = new b2CircleShape(
					(Math.random() + 0.1)*(25/SCALE) //radius
             );
          }
          bodyDef.position.x = (-400 + Math.random() * 20)*(25/SCALE);
          bodyDef.position.y = (-400 + Math.random() * 20)*(25/SCALE);
          world.CreateBody(bodyDef).CreateFixture(fixDef);
       }
	   
	   //add a player triangle object
		var points = [ [-0.5,-0.35], [0.5, -0.35], [0, 0.7]];
		var vecpoints = [];

		for (var i = 0; i < points.length; i++) {
			var vec = new b2Vec2();
			vec.Set(points[i][0]*(25/SCALE), points[i][1]*(25/SCALE));
			vecpoints[i] = vec;
		}
		fixDef.shape = new b2PolygonShape;
		fixDef.shape.SetAsArray(vecpoints, vecpoints.length);
		fixDef.filter.categoryBits=2;
		fixDef.filter.maskBits=3;	//collide with 1,2
		bodyDef.position.x = -6250/SCALE;
		bodyDef.position.y = -5000/SCALE;
		playerBody = world.CreateBody(bodyDef);
		playerBody.CreateFixture(fixDef);
		playerBody.SetAngularDamping(10);
		playerBody.SetAngle(Math.PI);
		
		var collisionListener = new Box2D.Dynamics.b2ContactListener();
		collisionListener.BeginContact = function(contact){
			//console.log("a collision occured. contact: " + contact + ", impulse: " + impulse);
			var fixa = contact.GetFixtureA();
			var fixb = contact.GetFixtureB();
			destroyIfBomb(fixa.m_body,fixb.m_body);
			destroyIfBomb(fixb.m_body,fixa.m_body);
			
			function destroyIfBomb(body1,body2){
				if (body1.countdown){
					detonateBody(body1);
					//body2.color = '#f88';
				}
			}
		}
		collisionListener.EndContact = function(contact){
			var fixa = contact.GetFixtureA();
			var fixb = contact.GetFixtureB();
			deHighlightIfPlayer(fixa.m_body,fixb.m_body);
			deHighlightIfPlayer(fixb.m_body,fixa.m_body);
			function deHighlightIfPlayer(body1,body2){
				if (body1==playerBody){
					body2.color = null;
				}
			}
		}
		world.SetContactListener(collisionListener);

		//add all bodies to buoyancy controller
		for (var b = world.GetBodyList(); b; b = b.GetNext()) {
			bC.AddBody(b);
		}
		
       //setup debug draw
       var debugDraw = new b2DebugDraw();
       debugDraw.SetSprite(debugCtx);
       debugDraw.SetDrawScale(SCALE);
       debugDraw.SetFillAlpha(0.3);
       debugDraw.SetLineThickness(1.0);
       debugDraw.SetFlags(b2DebugDraw.e_shapeBit | b2DebugDraw.e_jointBit);
       world.SetDebugDraw(debugDraw);
	   
	   copyPositions();
}; // init()

function update(timeNow) {
   
   //var timeNow = (new Date()).getTime();
   var forceCatchup = false;
   var timeDiff = timeNow-currentTime;
   var updatesRequired = timeDiff/timeStep;
   var remainderFraction = updatesRequired - Math.floor(updatesRequired);
   updatesRequired = Math.floor(updatesRequired);
   if (updatesRequired>maxUpdatesPerFrame){
	   //console.log("capping num updates to maxUpdatesPerFrame");
	   updatesRequired = maxUpdatesPerFrame;
	   currentTime = timeNow;
	   remainderFraction=0;
	   //console.log("!");
   }else{
	   currentTime+=timeStep*updatesRequired;
   }
   if (updatesRequired>0 && isPlaying){
	   if (updatesRequired>1){
		   for (var ii=1;ii<updatesRequired;ii++){
			   processInput();
			   iterateMechanics();
		   }
	   }
	   processInput();
	   copyPositions();
	   iterateMechanics();
   }
   stats.begin();
   //debugCtx.setTransform(1, 0, 0, 1, 100, 0);  //can transform debug canvas anyway, but should then also manually clear it
   //world.DrawDebugData();
   calcInterpPositions(remainderFraction);
   draw_world(world, ctx, remainderFraction);
   stats.end();
   requestAnimationFrame(update);
   
   function processInput(){
	   if (willFireGun){
		   dropBomb();
		   willFireGun=false;
	   }
	   if (keyThing.bombKey()){dropBomb();}
	   
	   //possibly setting forces multiple repeatedly is unnecessary - what does ClearForces do?
	   var turn = keyThing.rightKey() - keyThing.leftKey();
	   if (turn!=0){
		   playerBody.ApplyTorque(6*turn*torqueScale);
	   }
	   var thrust = thrustForce*keyThing.upKey();
	   //console.log(thrust);
	   var fwd = playerBody.GetTransform().R.col2;
	   if (thrust!=0){
		   playerBody.ApplyForce(new b2Vec2(thrust*fwd.x,thrust*fwd.y), playerBody.GetWorldCenter());
	   }
	   //air resistance
	   var dragVec = playerBody.GetLinearVelocity().Copy();
	   //var randomDrag = new b2Vec2(Math.random()-0.5, Math.random()-0.5);
	   //randomDrag.Multiply(0.025*dragVec.LengthSquared());
	   dragVec.Multiply(-0.01*relativeScale*dragVec.Length());
	   playerBody.ApplyForce(dragVec, playerBody.GetWorldCenter());
	   //playerBody.ApplyForce(randomDrag, playerBody.GetWorldCenter());

	   
	   
	   //cam lookahead
	   /*
	   var scaledPVel = playerBody.GetLinearVelocity().Copy();
	   scaledPVel.Multiply(0.04*0.3);
	   camLookAhead.Multiply(0.96);
	   camLookAhead.Add(scaledPVel);
	   */
	   camPosTarget = playerBody.GetTransform().position.Copy();
	   camLookAhead = playerBody.GetLinearVelocity().Copy();
	   camLookAhead.Multiply(0.3);
	   
	   //as a hack to avoid wierd slide to stop behaviour, make lookahead have a dead zone
	   var camLookAheadTestHack = camLookAhead.Length();
	   
	   camLookAheadTestHack = camLookAheadTestHack/(camLookAheadTestHack+4);	//graduated "dead zone"
	   camLookAhead.Multiply(camLookAheadTestHack);
	   camPosTarget.Add(camLookAhead);
	   
	   //console.log(camLookAhead.Length().toFixed(2));
	   
	   //camPos should be drawn towards this point using with spring/damper critical damping
	   var camPosDifference = camPosTarget.Copy();
	   camPosDifference.Subtract(camPos);
	   //console.log(camPosDifference.Length());
	   
	   var camVelDifference = camVel.Copy();
	   
		var camVelTarget = playerBody.GetLinearVelocity().Copy();	//not strictly same as target but produces better behaviour.
	    camVelTarget.Multiply(timeStep*0.001);	//box2d works in seconds
		   
	   camVelDifference.Subtract(camVelTarget);
	   
	   //soft settings
	   camPosDifference.Multiply(0.01);	//this no longer the difference, but can't put into calculations otherwise (statement doesn't return itself...)
	   camVelDifference.Multiply(-0.2);	//this no longer the difference, but can't put into calculations otherwise (statement doesn't return itself...)
	   
	   //apply an acceleration to camera proportional to position difference (damper)
	   camVel.Add(camPosDifference);
	   
	   //apply an acceleration to camera proportional to velocity difference (damper)
	   camVel.Add(camVelDifference);
	   
	   camPos.Add(camVel);
	   
	   
	   floatingPlatform.ApplyTorque(5000*keyThing.downKey());
   }
   
   function iterateMechanics(){
	   
	   for (var e in explosions){
		  explosions[e].iterate();
	   }
	   
	   for (var b = world.GetBodyList(); b; b = b.GetNext()) {
	      if (b.countdown){
			 b.countdown--;
			 if (b.countdown==0){
				//console.log("destroying body");
				detonateBody(b);
			 }
		  }
	   }
	   
	   //generate an array containing elements in all scheduledBlocksToPurge[n] arrays.
	   //not the most efficient way to do things but shouldnt' really matter
	   var handledBlockList=[];
	   for (var listno=0;listno<2;listno++){
			var thisList = scheduledBlocksToPurge[listno];
		   for (var bb in thisList){
			 var thisBlock = thisList[bb];
			 if (handledBlockList.indexOf(thisBlock)==-1){
				handledBlockList.push(thisBlock);
				var result = purgeLandscapeFixtures(thisBlock);
				if (result==-1){
					landscapeBlocks.splice(landscapeBlocks.indexOf(thisBlock),1);	//remove from array of landscape blocks
				}
			 }else{
			//	 console.log("skipping...");
			 }
		   }
	   }
	   
	   for (var bb in scheduledBlocksToUpdate){
		 var thisBlock = scheduledBlocksToUpdate[bb];
		 updateLandscapeFixtures(thisBlock);
		 //for altered blocks, compare existing fixture list with new fixtures from new clip path
		 //where match, do nothing
		 //where in existing list, but not new, add to purge list (want to keep fixture around for a frame to avoid bugginess)
		 //where in new path, but not existing, add new fixture
	   }
	   
	   scheduledBlocksToPurge[1] = scheduledBlocksToPurge[0];
	   scheduledBlocksToPurge[0] = scheduledBlocksToUpdate;
	   scheduledBlocksToUpdate=[];
	   
	   //create destroy list here because don't try box2d not to mess around with references to bodies (or maybe i'm sticking things on destroy list twice...)
	   destroy_list = [];
	   for (var b = world.GetBodyList(); b; b = b.GetNext()) {
	    if (b.shouldDestroy){
			destroy_list.push(b);
		}
	   }
	   
	   //Destroy all bodies in destroy_list
	  for (var i in destroy_list) {
		world.DestroyBody(destroy_list[i]);
	  }
	  // Reset the array
	  //destroy_list.length = 0;
	   
	   world.Step(
			 0.001*timeStep   //seconds
		  ,  8       //velocity iterations
		  ,  3       //position iterations
	   );
	   world.ClearForces();
   }
}; // update()

function copyPositions(){
   for (var b = world.GetBodyList(); b; b = b.GetNext()) {
	    var currentPos = b.GetTransform().position;
		b.oldPos = b.oldPos || new b2Vec2();
		b.oldPos.Set(currentPos.x, currentPos.y);
	}
}
function calcInterpPositions(remainderFraction){
	var oneMinus = 1-remainderFraction;
	for (var b = world.GetBodyList(); b; b = b.GetNext()) {
		var oldPos = b.oldPos;
		if (oldPos){
			var currentPos = b.GetTransform().position;
			b.interpPos = new b2Vec2();
			b.interpPos.Set(currentPos.x*remainderFraction + oldPos.x*oneMinus,
							currentPos.y*remainderFraction + oldPos.y*oneMinus );
		}
	}
	
	camPosInterp = camVel.Copy();
	camPosInterp.Multiply(-oneMinus);
	camPosInterp.Add(camPos);
}

var drawingScale;
var skipLandsDraw=false;
var skipLandsClip=true;

function draw_world(world, context, remainderFraction) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);  //identity
//  context.fillStyle= "#AAFFFF";
  
  var grd=ctx.createLinearGradient(0,0,0,canvas.height);
grd.addColorStop(0,"magenta");
grd.addColorStop(1,"orange");

ctx.fillStyle=grd;
  
  context.fillRect(0, 0, canvas.width, canvas.height);	//so "lighter" globalCompositeOperation has something to start from
  
  //var camPos = {x:playerBody.interpPos.x + camLookAhead.x,
	//			y:playerBody.interpPos.y + camLookAhead.y, 			
  //};	//TODO also interpolate velocity
  
  ctx.setTransform(1, 0, 0, 1, canvas.width/2-drawingScale*camPosInterp.x, canvas.height/2-drawingScale*camPosInterp.y);
  context.fillStyle="#AAAAAA";
  context.strokeStyle="#000000";
  
  var screenBounds = {
	  left: (drawingScale*camPosInterp.x - canvas.width/2)/(drawingScale/SCALE),
	  right: (drawingScale*camPosInterp.x + canvas.width/2)/(drawingScale/SCALE),
	  top: (drawingScale*camPosInterp.y - canvas.height/2)/(drawingScale/SCALE),
	  bottom: (drawingScale*camPosInterp.y + canvas.height/2)/(drawingScale/SCALE)
  }
  
  
  //highlight/dehighlight bodies touched by player
  var playerContactCount =0;
  for (var c = playerBody.GetContactList(); c; c = c.next) {
	    var otherBody =c.other;
		if (c.contact.IsTouching()){
			playerContactCount++
			otherBody.color = '#fa4';
			if (checkContactUnderPlayer(c)){
				if (checkForFixedRelativePose(playerBody,otherBody)){
					otherBody.color = '#ff8';
				}
			}
		}
   }
   //console.log("num player contacts : " + playerContactCount);
  
  //Draw the bodies
  for (var b = world.GetBodyList(); b; b = b.GetNext()) {
	  
	context.fillStyle= b.color || "#AAAAAA";

	if (b.clippablePath){
		if (skipLandsDraw){continue;}
		//custom path, possibly convex with holes, which box2d sees as just a series of edges.
		//separately draw it using canvas.
		//code very similar to code that sets up fixtures.
		
		//try simply clipping the landscape to the screen rectangle. this may give performance,
		//depending on how canvas speed (and speed of clip shape -> canvas commands)compares with clipper.js speed. guess canvas is clipping internally anyway.
		
		var cPath = b.clippablePath;
 
		var numLoops = cPath.length;
		var numPoints;
		if (numLoops==0){
			console.log("no loops in clippable path. this is unexpected");
			continue;
		} else {
			
			//confirm is within bounds of screen.
			//could make faster check by convoluting bounds with screen size
			var bounds = b.bounds;
			if (screenBounds.left>bounds.right || screenBounds.top>bounds.bottom || screenBounds.right<bounds.left || screenBounds.bottom<bounds.top){
				continue;
			}
			
			var thisLoop;
			context.beginPath()
			for (var ii=0;ii<numLoops;ii++){
				thisLoop = cPath[ii];
				numPoints = thisLoop.length;
				context.moveTo( thisLoop[0].X * drawingScale/SCALE, thisLoop[0].Y * drawingScale/SCALE);
				for (var jj=1;jj<numPoints;jj++){
					context.lineTo( thisLoop[jj].X * drawingScale/SCALE, thisLoop[jj].Y * drawingScale/SCALE);
				}
				context.closePath();
			}
		}
		context.fillStyle="rgba(150, 150, 125, 0.85)";
		
		var grd=ctx.createLinearGradient( 0 ,b.bounds.top*drawingScale/SCALE, 0,b.bounds.bottom*drawingScale/SCALE);
		grd.addColorStop(0,"#eee");
		grd.addColorStop(0.1,"#bbb");
		grd.addColorStop(0.95,"#bbb");
		
		context.fillStyle=grd;
		
		context.fill();
		//context.stroke();
		
	}
	else{
		//A body has many fixtures
		for (var f = b.GetFixtureList(); f != null; f = f.GetNext()) {
		  var shape = f.GetShape();
		  var shapeType = shape.GetType();
		  if (isNaN(b.GetPosition().x)) {
			alert('Invalid Position : ' + b.GetPosition().x);
		  } else {
			drawShape(b, shape, context, remainderFraction);
		  }
		}
	}
  }
  
  ctx.globalCompositeOperation = "lighter";
  for (var e in explosions){
	explosions[e].draw();
  }
  ctx.globalCompositeOperation = "source-over"; //set back to default
  
  ctx.setTransform(1, 0, 0, 1, 0, 0);  //identity
  //var startWater = canvas.height/2; //Math.max(0,)
  var startWater = Math.max(0, canvas.height/2-drawingScale*(waterLevel+camPosInterp.y));
  var endWater = canvas.height;
  //context.fillStyle="rgba(0, 150, 75, 0.5)";
  context.fillStyle="rgba(0, 100, 150, 0.5)";

  context.fillRect(0, startWater, canvas.width, endWater-startWater);	
  
  
  function drawShape(body, shape, context, remainderFraction) {
  context.beginPath();

  switch (shape.GetType()) {

  case b2Shape.e_circleShape:
    {
      var circle = shape;
      var pos = body.interpPos || body.GetPosition();
	  
      var r = shape.GetRadius();
      var segments = 16.0;
      var theta = 0.0;
      var dtheta = 2.0 * Math.PI / segments;

	  
	  //make gradient to cover the shape
	  var grd=ctx.createLinearGradient( 0 ,(pos.y-r) * drawingScale,0,(pos.y+r)*drawingScale);
	  grd.addColorStop(0,"#e7c");
      grd.addColorStop(0.3,"#b5b");
	  grd.addColorStop(0.6,"#754");
	  grd.addColorStop(1,"#883");
	  context.fillStyle=grd;
	  
      // draw circle
      context.moveTo((pos.x + r) * drawingScale, pos.y * drawingScale);

      for (var i = 0; i < segments; i++) {
        var d = new b2Vec2(r * Math.cos(theta), r * Math.sin(theta));

        var v = pos.Copy();
        v.Add(d);
        context.lineTo(v.x * drawingScale, v.y * drawingScale);
        theta += dtheta;
      }

      context.lineTo((pos.x + r) * drawingScale, pos.y * drawingScale);

      // draw radius line
      context.moveTo(pos.x * drawingScale, pos.y * drawingScale);
      var ax = body.GetTransform().R.col1;

      var pos2 = new b2Vec2(pos.x + r * ax.x, pos.y + r * ax.y);
      context.lineTo(pos2.x * drawingScale, pos2.y * drawingScale);
    }
    break;

  case b2Shape.e_polygonShape:
    {
      var poly = shape;
      var vert = shape.GetVertices();

      var position = body.interpPos || body.GetPosition();
	  
      var tV = position.Copy();
      var a = vert[0].Copy();
	  
      a.MulM(body.GetTransform().R);
	  
	  var angAdjust = 0.001*timeStep*remainderFraction*body.GetAngularVelocity();
	  var cosAng = Math.cos(angAdjust);
	  var sinAng = Math.sin(angAdjust);
	  var interpMat = {col1:{x:cosAng,y:sinAng},col2:{x:-sinAng,y:cosAng}};
	  
	  a.MulM(interpMat); 
	  
      tV.Add(a);

      context.moveTo(tV.x * drawingScale, tV.y * drawingScale);

      for (var i = 0; i < vert.length; i++) {
        var v = vert[i].Copy();
        v.MulM(body.GetTransform().R);
		v.MulM(interpMat); 

        v.Add(position);
        context.lineTo(v.x * drawingScale, v.y * drawingScale);
      }

      context.lineTo(tV.x * drawingScale, tV.y * drawingScale);
    }

    break;
  }
  //this will fill a shape
  context.fill();

  //this will create the outline of a shape
  //context.stroke();
  } 
}

function goFullscreen(elem){
	if (elem.requestFullscreen) {
	i.requestFullscreen();
	} else if (elem.webkitRequestFullscreen) {
		elem.webkitRequestFullscreen();
	} else if (elem.mozRequestFullScreen) {
		elem.mozRequestFullScreen();
	} else if (elem.msRequestFullscreen) {
		elem.msRequestFullscreen();
	}
}

var bombDef = new b2BodyDef;
bombDef.type = b2Body.b2_dynamicBody;
  
var bombfixDef = new b2FixtureDef;
       bombfixDef.density = 1.0;
       bombfixDef.friction = 0.5;
       bombfixDef.restitution = 0.2;	   
	   
	   bombfixDef.filter.categoryBits=4;
	   bombfixDef.filter.maskBits=1;	//collide with 1 only
	   
bombfixDef.shape = new b2CircleShape(
			0.1*relativeScale //radius
		 );	  		 
   
function dropBomb(){
  //var speeds = [{fwd:0,left:0}];	//bomb
  var speeds = [{fwd:20*relativeScale + gaussRand()*2*relativeScale,left:gaussRand()*2*relativeScale}];
  //var speeds = [{fwd:35,left:0}, {fwd:30,left:5}, {fwd:30,left:-5}];	//triple shot
  //var speeds = [{fwd:25,left:0}, {fwd:20,left:5}, {fwd:20,left:-5}];	//triple shot
  //var speeds = [{fwd:15,left:0}, {fwd:10,left:5}, {fwd:10,left:-5}];	//triple shot
  
  var fwd = playerBody.GetTransform().R.col2;
  var left = playerBody.GetTransform().R.col1;
  
  var playerPosition = playerBody.GetTransform().position;
  var playerVelocity = playerBody.GetLinearVelocity();
  
  bombDef.position.x = playerPosition.x;
  bombDef.position.y = playerPosition.y;
  
  for (ss in speeds){
	  var speed = speeds[ss];
	  bombDef.linearVelocity.x=playerVelocity.x + speed.fwd*fwd.x + speed.left*left.x;
	  bombDef.linearVelocity.y=playerVelocity.y + speed.fwd*fwd.y + speed.left*left.y;
	  
	  var bombBody = world.CreateBody(bombDef);  
	  bombBody.CreateFixture(bombfixDef);
	  bC.AddBody(bombBody);
	  bombBody.countdown=100; 
	  
	  //bombBody.SetBullet(true);
  }
}

function detonateBody(b){
	var bodyPos = b.GetTransform().position;
	new Explosion(bodyPos.x, bodyPos.y , 0,0, 2*relativeScale,0.5*relativeTimescale );
	createBlast(bodyPos);
	//destroy_list.push(b);
	b.shouldDestroy=true;
	editLandscapeFixtureBlocks(bodyPos.x *SCALE,bodyPos.y *SCALE,40);
	//console.log("destroying bomb at " + bodyPos.x + ", " + bodyPos.y);
}

function createBlast(position){
	//if creating multiple blasts at the same time (likely to happen if made basts continuous instead of instantaneous),
	//iterating over all bodies for each blast probably inefficient
	var bodyPos, relativePos, distSq, multiplier;
	for (var b = world.GetBodyList(); b; b = b.GetNext()) {
		if (b.clippablePath){continue;}
		bodyPos = b.GetTransform().position;
		relativePos = {x:bodyPos.x-position.x,
							y:bodyPos.y-position.y};
		distSq = relativePos.x*relativePos.x + relativePos.y*relativePos.y;
		multiplier = 10*forceScale/(0.5+distSq);
		if (!b.countdown && b!=playerBody){	//not a bomb or player (for development convenience)
			b.ApplyImpulse(new b2Vec2(relativePos.x*multiplier,relativePos.y*multiplier), b.GetWorldCenter());	//upward force
		}
		//TODO impulse dependent on object size
	}
	
}

function checkForFixedRelativePose(body1, body2){
	//get linear and angular velocity of one body in frame of another.
	var rotationalVelocityThreshold = body1.GetAngularVelocity() - body2.GetAngularVelocity();
	if (Math.abs(rotationalVelocityThreshold) > 0.1){return false;}
	
	var body1Transform = body1.GetTransform;
	var body2Transform = body2.GetTransform;
	var relativeVel = new b2Vec2;
	relativeVel.Add(body1.GetLinearVelocity());
	relativeVel.Subtract(body2.GetLinearVelocity());
	
	var relativePos = new b2Vec2;
	relativePos.Add(body1.GetTransform().position);
	relativePos.Subtract(body2.GetTransform().position);
	
	var angVel = body2.GetAngularVelocity();
	var myMat = b2Mat22.FromVV(new b2Vec2(0,-angVel), new b2Vec2(angVel,0) );
	relativePos.MulM(myMat);
	relativeVel.Add(relativePos);
	
	if (relativeVel.Length()>0.1){return false;} 
	
	return true;
}

function checkContactUnderPlayer(c){
	//check that the contact is on the base of the player
	var myWorldManifold = new b2WorldManifold()
	c.contact.GetWorldManifold(myWorldManifold);
	var contactNormal = myWorldManifold.m_normal;
	contactNormal.MulTM(playerBody.GetTransform().R);
	if (contactNormal.y>-0.99){return false;}
	return true;
}

function purgeLandscapeFixtures(body){	
	if (body.shouldBeDestroyed){
		console.log("this body should have been destroyed");	//possibly should ensure don't call function for "destroyed" bodies
		return -2;												//maybe box2d doesn't actually destroy the object, just removes it from the world
	}	
	var newPurgeList =[];
	for (var f = body.GetFixtureList(); f != null; f = f.GetNext()) {
		if (f.purgePls){
			f.purgePls--;
			if (f.purgePls<=0){
				if (f.wasPurged){
					alert("double delete attempt!!");
				}else{
					newPurgeList.push(f);
					f.wasPurged = true;
				}
			}
		}
	}
	for (var ii in newPurgeList){
		var f = newPurgeList[ii];
		body.DestroyFixture(f);
	}
	//destroy the body if all fixtures are gone
	if (body.GetFixtureList()==null){
		console.log("all fixtures gone. destroying body.");
		body.shouldBeDestroyed=true;
		world.DestroyBody(body);
		return -1;
	}
}

function updateLandscapeFixtures(body){
	
	var fixDef = new b2FixtureDef;
    fixDef.density = 1.0;
    fixDef.friction = 0.5;
    fixDef.restitution = 0.2; 
	fixDef.shape = new b2PolygonShape;
	
	var oldFixtures= body.existingFixtures || {};	//TODO remove || {} by creating this elsewhere
	
	//console.log("old fixtures: " + Object.keys(oldFixtures).length);
	
	var newFixtureList={};	//all output features not on purge list
	
	var cPath = body.clippablePath;
	var numLoops = cPath.length;
	var numPoints;
	if (numLoops==0){
		console.log("no loops in clippable path. this is unexpected 111");
	//	return;
	}
	var thisLoop, currentPos, nextPos;
	for (var ii=0;ii<numLoops;ii++){
		thisLoop = cPath[ii];
		numPoints = thisLoop.length;
		//console.log("a loop with num points =" + numPoints);
		currentPos = thisLoop[numPoints-1];
		for (var jj=0;jj<numPoints;jj++){
			nextPos = thisLoop[jj];
			var stringKey = JSON.stringify([currentPos.X, currentPos.Y, nextPos.X, nextPos.Y]);
			if (newFixtureList[stringKey]){alert("assumption false!!!!");}
			newFixtureList[stringKey] = true;
			currentPos = nextPos;
		}
	}
	
	for (var fix in oldFixtures){
		if (!newFixtureList[fix]){
			oldFixtures[fix].purgePls=2;
		}
	}

	var toMakeList=[];
	for (var fix in newFixtureList){
		if (oldFixtures[fix]){
			newFixtureList[fix]=oldFixtures[fix];
			//console.log("already exists. reusing...");
		}else{
			toMakeList.push(fix);
		}
	}
	
	//var createdCount=0;
	var parsedFix;
	var fix;
	for (var ii in toMakeList){
		fix=toMakeList[ii];
		parsedFix = JSON.parse(fix);
		fixDef.shape.SetAsEdge(new b2Vec2(parsedFix[0] / SCALE, parsedFix[1] / SCALE), new b2Vec2(parsedFix[2] / SCALE, parsedFix[3] / SCALE));
		newFixtureList[fix]=body.CreateFixture(fixDef);
	//	createdCount++;
	}
	//if (createdCount!=0){console.log("created " + createdCount + " fixtures");}
	
	body.existingFixtures = newFixtureList;
}

var cpr;
var shouldClean=false;

function editLandscapeFixtureBlocks(x,y,r){
	//naively just do all of them
	for (bb in landscapeBlocks){
		var thisBlock = landscapeBlocks[bb];
		editLandscapeFixture(thisBlock,x,y,r);
	}
}

function editLandscapeFixture(body,x,y,r){
	
	//confirm is within bounds of block
	//TODO use the grid systme directly
	var bounds = body.bounds;
	if (x-r>bounds.right || y-r>bounds.bottom || x+r<bounds.left || y+r<bounds.top){
		return;
	}
	
	
	//temporary test - make a fixed edit to landscape
	cpr = new ClipperLib.Clipper();
	
	cpr.AddPaths(body.clippablePath, ClipperLib.PolyType.ptSubject, true);  //use the previous solution as input

	//var cutPath = [{X:x-r,Y:y-r},{X:x-r,Y:y+r},{X:x+r,Y:y+r},{X:x+r,Y:y-r}]; //square
	var cutPath=[];	//circle. todo precalculate
	for(var aa=0;aa<10;aa++){
		var ang = aa*Math.PI/5;
		cutPath.push({X:x+r*Math.cos(ang), Y:y+r*Math.sin(ang)});
	}
	
	cpr.AddPath(cutPath, ClipperLib.PolyType.ptClip, true);

	var succeeded = cpr.Execute(ClipperLib.ClipType.ctDifference, body.clippablePath, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);

	//custom clean function - only remove a point if both the previous and next points are within a range limit
	//currently inefficient
	
	var resultPath=[]; //possibly faster to edit existing path
	rangeLimitSq = 120;
	var paths = body.clippablePath;
	for (pp in paths){
		var thisResultPath=[];
		var thisPath = paths[pp];
		var numPoints = thisPath.length;
		
		for (var ii=0;ii<numPoints;ii++){
			var prevPoint = thisPath[(ii+numPoints-1)%numPoints];
			var thisPoint = thisPath[(ii+numPoints)%numPoints];
			var nextPoint = thisPath[(ii+numPoints+1)%numPoints];
			var prevDSq = Math.pow(prevPoint.X-thisPoint.X,2) + Math.pow(prevPoint.Y-thisPoint.Y,2);
			var thisDSq = Math.pow(thisPoint.X-nextPoint.X,2) + Math.pow(thisPoint.Y-nextPoint.Y,2);
			if (prevDSq>rangeLimitSq || thisDSq>rangeLimitSq){
				thisResultPath.push(thisPoint);
			}else{
				//console.log("removing a point");
			}
		}
		if (thisResultPath.length>2){
			resultPath.push(thisResultPath);
		}else{
			console.log("***************************** too short path (" + thisResultPath.length + ")*********************");
		}
	}
	body.clippablePath = resultPath;
	
	
	if (scheduledBlocksToUpdate.indexOf(body)==-1){
		scheduledBlocksToUpdate.push(body);
	//}else{
	//	console.log("tried to push array to update twice. index : " + scheduledBlocksToUpdate.indexOf(body) );
	}
}

function chopIntoGrid(landsPath){
	//input is a set of paths - eg a shape with a hole is 2 paths
	//want to chop it up sensibly. 
	
	//TODO some way to look up blocks via co-ords.
	//initial implementation -can just store bounding box for each block, do trivial check or overlap with each (and if so clip that block), every time cut an explosion circle, or display the screen. expect this (at least for initial 16x16=256 blocks) to be inexpensive. 
	
	//intially - just chop it into 8x8 = 64 blocks
	
	console.log("chopping up landscape into a grid...");
	var outputArray=[];

	//print out information about initial landscape (loops, points)
	
	printPathsInfo(landsPath);
	
	var gridDivs = 8;
	
	//get bounding box of landscape.
	var bounds = ClipperLib.Clipper.GetBounds(landsPath);
	var xstep = (bounds.right-bounds.left)/gridDivs;
	var ystep = (bounds.bottom-bounds.top)/gridDivs;
	var gap=5;	//for illustration. TODO remove
	//chop each block out. TODO make this faster by recursive binary chopping
	cpr = new ClipperLib.Clipper();
	
	for (var ii=0;ii<gridDivs;ii++){
		for (var jj=0;jj<gridDivs;jj++){
			var left = bounds.left + ii*xstep + gap;
			var right = left+xstep - gap;
			var top = bounds.top + jj*ystep + gap;
			var bottom = top + ystep - gap;
			var clipPath = [{X:left, Y:top}, {X:left, Y:bottom}, {X:right, Y:bottom}, {X:right, Y:top}];
			var resultPath=[];
			
			cpr.Clear();	
			cpr.AddPaths(landsPath, ClipperLib.PolyType.ptSubject, true);
			cpr.AddPath(clipPath, ClipperLib.PolyType.ptClip, true);

			var succeeded = cpr.Execute(ClipperLib.ClipType.ctIntersection, resultPath, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
			if (resultPath.length>0){
				printPathsInfo(resultPath);
				outputArray.push({
					paths:resultPath,
					bounds:ClipperLib.Clipper.GetBounds(resultPath)	//keep bounding box info on block object.
				});
			}else{
				console.log("no paths in result!");
			}
		}
	}
	return outputArray;
}
		
function printPathsInfo(paths){
	var numLoops = paths.length;
	var numPoints;
	if (numLoops==0){
		console.log("no loops to chop up!");
		return;
	}else{
		//console.log("number of loops: " + numLoops);
	}
	var thisLoop;
	var totalPoints=0;
	for (var ii=0;ii<numLoops;ii++){
		thisLoop = paths[ii];
		numPoints = thisLoop.length;
		totalPoints+=numPoints;
		//console.log("a loop with num points =" + numPoints);
	}
	console.log("total points: " + totalPoints);
}