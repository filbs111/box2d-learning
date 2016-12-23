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
var timeStep = 1000/60;	//milliseconds. 60fps (mechanics)
var maxUpdatesPerFrame = 5;
var playerBody;
var thrustForce=15;
var willFireGun=false;

var destroy_list = [];

var floatingPlatform;
var landscapeBody;
var landscapeUpdateScheduled=false;

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
    drawingScale = 15*canvas.scale;
}		  
		  
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
		playerBody.ApplyForce(new b2Vec2(0,-100), playerBody.GetWorldCenter());	//upward force
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

	});
	
	assetManager.setOnloadFunc(function(){
		currentTime = (new Date()).getTime();
		requestAnimationFrame(update);
	});
	assetManager.setAssetsToPreload({
		EXPL: settings.EXPLOSION_IMAGE_SRC
	});
	
	
}

function init(){
	initscount++;
	console.log("init called. " + initscount);
	
       world = new b2World(
             new b2Vec2(0, 10)    //gravity
          ,  true                 //allow sleep
       );
       
       var SCALE = 30;
     
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
	   landscapeBody = world.CreateBody(landscapeBodyDef);
	   //TODO create fixtures
	   //make some path object suitable for use with jsclipper. attach it to the landscapeBody object
	   landscapeBody.clippablePath = [[{X:50,Y:50},{X:150,Y:50},{X:150,Y:150},{X:50,Y:150}],
                  [{X:60,Y:60},{X:60,Y:140},{X:140,Y:140},{X:140,Y:60}],
				  [{X:-2000,Y:-1000},{X:0,Y:-1000},{X:0,Y:1000},{X:-2000,Y:1000}],
				  [{X:-1020,Y:-50},{X:-1020,Y:50},{X:-980,Y:50},{X:-980,Y:-50}]
				  ];
	   ClipperLib.JS.ScaleUpPaths(landscapeBody.clippablePath, 5);


	   updateLandscapeFixtures();		  
		
	   
   	   //add an ellipse, to check the limit on vertices in a polygon shape. seems no real limit here - got up to 2048 ok!
		var num_ellipse_points = 64;
		var ellipse_points = [];
		for (var i = 0; i < num_ellipse_points; i++) {
			var vec = new b2Vec2();
			var ang = 2*Math.PI*i/num_ellipse_points;
			vec.Set(15*Math.cos(ang), 2*Math.sin(ang));
			ellipse_points[i] = vec;
		}
	    bodyDef.type = b2Body.b2_staticBody;
		//bodyDef.type = b2Body.b2_dynamicBody;
		fixDef.shape.SetAsArray(ellipse_points, ellipse_points.length);
		bodyDef.position.x = 50;
		bodyDef.position.y = 10;
		world.CreateBody(bodyDef).CreateFixture(fixDef);
		
		//add an edge shape (doesn't work for dynamic bodies AFAIK, should work for static.)
		//apparently later versions of box2d have support for a "chain" edge too
		fixDef.shape = new b2PolygonShape();
		bodyDef.position.x = 0;
		bodyDef.position.y = 0;
		//fixDef.shape.SetAsEdge(new b2Vec2(0, 0), new b2Vec2(20, 0));
		//world.CreateBody(bodyDef).CreateFixture(fixDef);
		
		/*
		//can make a custom method to make a series of these into an extended curve. check whether this snags
		var currentPos = new b2Vec2(0,0);
		var lastPos;
		var waveBody = world.CreateBody(bodyDef);
		for (var ii=1;ii<50;ii++){
			lastPos = currentPos;
			currentPos = new b2Vec2(ii,10*Math.sin(ii/10));
			fixDef.shape.SetAsEdge(currentPos, lastPos);
			waveBody.CreateFixture(fixDef);
		}
		*/
		
	   
       //create some objects
       bodyDef.type = b2Body.b2_dynamicBody;
       for(var i = 0; i < 50; ++i) {
          if(Math.random() > 0.5) {
             fixDef.shape = new b2PolygonShape;
             fixDef.shape.SetAsBox(
                   Math.random() + 0.1 //half width
                ,  Math.random() + 0.1 //half height
             );
          } else {
             fixDef.shape = new b2CircleShape(
                Math.random() + 0.1 //radius
             );
          }
          bodyDef.position.x = 10 + Math.random() * 20;
          bodyDef.position.y = -20+Math.random() * 20;
          world.CreateBody(bodyDef).CreateFixture(fixDef);
       }
	   
	   //add a player triangle object
		var points = [ [-0.5,-0.35], [0.5, -0.35], [0, 0.7]];
		var vecpoints = [];

		for (var i = 0; i < points.length; i++) {
			var vec = new b2Vec2();
			vec.Set(points[i][0], points[i][1]);
			vecpoints[i] = vec;
		}
		fixDef.shape = new b2PolygonShape;
		fixDef.shape.SetAsArray(vecpoints, vecpoints.length);
		fixDef.filter.categoryBits=2;
		fixDef.filter.maskBits=3;	//collide with 1,2
		bodyDef.position.x = -200;
		bodyDef.position.y = 0;
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
					body2.color = '#f88';
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
	   console.log("!");
   }else{
	   currentTime+=timeStep*updatesRequired;
   }
   if (updatesRequired>0){
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
   draw_world(world, ctx);
   stats.end();
   requestAnimationFrame(update);
   
   function processInput(){
	   if (willFireGun){
		   dropBomb();
		   willFireGun=false;
	   }
	   
	   //possibly setting forces multiple repeatedly is unnecessary - what does ClearForces do?
	   var turn = keyThing.rightKey() - keyThing.leftKey();
	   if (turn!=0){
		   playerBody.ApplyTorque(6*turn);
	   }
	   var thrust = thrustForce*keyThing.upKey();
	   //console.log(thrust);
	   var fwd = playerBody.GetTransform().R.col2;
	   if (thrust!=0){
		   playerBody.ApplyForce(new b2Vec2(thrust*fwd.x,thrust*fwd.y), playerBody.GetWorldCenter());
	   }
	   
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
				console.log("destroying body");
				detonateBody(b);
			 }
		  }
	   }
	   
	   if (landscapeUpdateScheduled){
		  landscapeUpdateScheduled=false;
		  updateLandscapeFixtures();
	   }
	   
	   // Destroy all bodies in destroy_list
	  for (var i in destroy_list) {
		world.DestroyBody(destroy_list[i]);
	  }
	  // Reset the array
	  destroy_list.length = 0;
	   
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
}

var drawingScale;

function draw_world(world, context) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);  //identity
  //context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle= "#AAFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);	//so "lighter" globalCompositeOperation has something to start from
  
  ctx.setTransform(1, 0, 0, 1, canvas.width/2-drawingScale*playerBody.interpPos.x, 
								canvas.height/2-drawingScale*playerBody.interpPos.y);  //centred player
  context.fillStyle="#AAAAAA";
  context.strokeStyle="#000000";
  
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
		//custom path, possibly convex with holes, which box2d sees as just a series of edges.
		//separately draw it using canvas.
		//code very similar to code that sets up fixtures.
		
		var cPath = b.clippablePath;
		var numLoops = cPath.length;
		var numPoints;
		if (numLoops==0){
			console.log("no loops in clippable path. this is unexpected");
		} else {
			var thisLoop;
			for (var ii=0;ii<numLoops;ii++){
				thisLoop = cPath[ii];
				numPoints = thisLoop.length;
				context.moveTo( thisLoop[0].X * drawingScale/25, thisLoop[0].Y * drawingScale/25);
				for (var jj=1;jj<numPoints;jj++){
					context.lineTo( thisLoop[jj].X * drawingScale/25, thisLoop[jj].Y * drawingScale/25);
				}
				context.closePath();
			}
		}
		context.fillStyle="rgba(0, 150, 75, 0.5)";
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
			drawShape(b, shape, context);
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
  var startWater = Math.max(0, canvas.height/2-drawingScale*(waterLevel+playerBody.interpPos.y));
  var endWater = canvas.height;
  context.fillStyle="rgba(0, 150, 75, 0.5)";

  context.fillRect(0, startWater, canvas.width, endWater-startWater);	
  
  function drawShape(body, shape, context) {
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
      tV.Add(a);

      context.moveTo(tV.x * drawingScale, tV.y * drawingScale);

      for (var i = 0; i < vert.length; i++) {
        var v = vert[i].Copy();
        v.MulM(body.GetTransform().R);
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
			0.1 //radius
		 );	  		 
   
function dropBomb(){
  var fireSpeed=25;	//0 for freefall bomb, +ve for forward firing
  var fwd = playerBody.GetTransform().R.col2;
  
  var playerPosition = playerBody.GetTransform().position;
  var playerVelocity = playerBody.GetLinearVelocity();
  bombDef.position.x = playerPosition.x;
  bombDef.position.y = playerPosition.y;
  bombDef.linearVelocity.x=playerVelocity.x + fireSpeed*fwd.x;
  bombDef.linearVelocity.y=playerVelocity.y + fireSpeed*fwd.y;
  
  var bombBody = world.CreateBody(bombDef);  
  bombBody.CreateFixture(bombfixDef);
  bC.AddBody(bombBody);
  bombBody.countdown=100;
}

function detonateBody(b){
	var bodyPos = b.GetTransform().position;
	new Explosion(bodyPos.x, bodyPos.y , 0,0, 1,0.5 );
	createBlast(bodyPos);
	destroy_list.push(b);
	editLandscapeFixture(bodyPos.x *25,bodyPos.y *25,20);
	console.log("destorying bomb at " + bodyPos.x + ", " + bodyPos.y);
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
		multiplier = 10/(0.5+distSq);
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

function updateLandscapeFixtures(){
	
	//clean. ideally should check that delta small enough to not clean up a freshly made lone circle
	//clean unfortunately does things like presumably merging points at average position, therefore if 2 points from a beveled corner merge, then the
	//resulting corner moves "in". TODO write own clean method that works better
	//landscapeBody.clippablePath = ClipperLib.JS.Clean(landscapeBody.clippablePath , 4);
	
	
	//delete existing fixtures. 
	//this will mean deleting and recreating many fixtures. TODO avoid this
	var nextf;
	for (var f = landscapeBody.GetFixtureList(); f != null; f=nextf) {
		nextf = f.GetNext();
		landscapeBody.DestroyFixture(f);
	}
	
	/*
	//delete and remake the whole object - maybe less crashy?
	var landscapeBodyDef = new b2BodyDef;
	   landscapeBodyDef.type = b2Body.b2_staticBody;
	   landscapeBodyDef.position.x = 0;
       landscapeBodyDef.position.y =0;
	var newlandscapeBody = world.CreateBody(landscapeBodyDef);
		newlandscapeBody.clippablePath = landscapeBody.clippablePath;
		world.DestroyBody(landscapeBody);
		
		//console.log("check the path still exists " + newlandscapeBody.clippablePath );
		landscapeBody = newlandscapeBody;
		*/
	
	var SCALE = 25;

	var fixDef = new b2FixtureDef;
    fixDef.density = 1.0;
    fixDef.friction = 0.5;
    fixDef.restitution = 0.2; 
	fixDef.shape = new b2PolygonShape;
	
	var cPath = landscapeBody.clippablePath;
	var numLoops = cPath.length;
	var numPoints;
	if (numLoops==0){
		console.log("no loops in clippable path. this is unexpected");
		return;
	}
	var thisLoop, currentPos, nextPos;
	for (var ii=0;ii<numLoops;ii++){
		thisLoop = cPath[ii];
		numPoints = thisLoop.length;
		//console.log("a loop with num points =" + numPoints);
		currentPos = new b2Vec2(thisLoop[numPoints-1].X / SCALE, thisLoop[numPoints-1].Y / SCALE);
		for (var jj=0;jj<numPoints;jj++){
			nextPos = new b2Vec2(thisLoop[jj].X / SCALE, thisLoop[jj].Y / SCALE);
			fixDef.shape.SetAsEdge(currentPos, nextPos);
			//console.log("making an edge from (" + currentPos.x + ", " + currentPos.y + ") to (" + nextPos.x + ", " + nextPos.y + ")" );
			landscapeBody.CreateFixture(fixDef);
			currentPos = nextPos;
		}
	}
	
	
	
}

var cpr;
var shouldClean=false;
function editLandscapeFixture(x,y,r){
	//temporary test - make a fixed edit to landscape
	cpr = new ClipperLib.Clipper();
	
	cpr.AddPaths(landscapeBody.clippablePath, ClipperLib.PolyType.ptSubject, true);  //use the previous solution as input

	//var cutPath = [{X:x-r,Y:y-r},{X:x-r,Y:y+r},{X:x+r,Y:y+r},{X:x+r,Y:y-r}]; //square
	var cutPath=[];	//circle. todo precalculate
	for(var aa=0;aa<12;aa++){
		var ang = aa*Math.PI/6;
		cutPath.push({X:x+r*Math.cos(ang), Y:y+r*Math.sin(ang)});
	}
	
	cpr.AddPath(cutPath, ClipperLib.PolyType.ptClip, true);

	var succeeded = cpr.Execute(ClipperLib.ClipType.ctDifference, landscapeBody.clippablePath, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);

	landscapeUpdateScheduled=true;

	/*
	//print info about the landscape
	console.log("size of landscape array: " + landscapeBody.clippablePath.length);
	var totalEdges=0;
	for (var ii in landscapeBody.clippablePath){
		totalEdges += landscapeBody.clippablePath[ii].length;
	}
	console.log("num edges: " + totalEdges);
	*/
}