var debugCanvas;
var debugCtx;
var canvas;
var ctx;
var world;
var stats;

var initscount=0;
var currentTime;
var timeStep = 1000/60;	//milliseconds. 60fps (mechanics)
var maxUpdatesPerFrame = 5;
var playerBody;
var thrustForce=15;
var willFireGun=false;

var destroy_list = [];

var   b2Vec2 = Box2D.Common.Math.b2Vec2
        , b2BodyDef = Box2D.Dynamics.b2BodyDef
        , b2Body = Box2D.Dynamics.b2Body
        , b2FixtureDef = Box2D.Dynamics.b2FixtureDef
        , b2Fixture = Box2D.Dynamics.b2Fixture
        , b2World = Box2D.Dynamics.b2World
        , b2MassData = Box2D.Collision.Shapes.b2MassData
        , b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape
        , b2CircleShape = Box2D.Collision.Shapes.b2CircleShape
		, b2Shape = Box2D.Collision.Shapes.b2Shape
        , b2DebugDraw = Box2D.Dynamics.b2DebugDraw
          ;

window.onresize = aspectFitCanvas;		

function aspectFitCanvas(evt) {
    var ww = window.innerWidth;
    var wh = window.innerHeight;
	var desiredAspect=2;
	var pixelRatio=0.5;		//set to 0.5 to double size of canvas pixels on screen etc
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
     
       var fixDef = new b2FixtureDef;
       fixDef.density = 1.0;
       fixDef.friction = 0.5;
       fixDef.restitution = 0.2;
     
	   fixDef.shape = new b2PolygonShape;
	   var bodyDef = new b2BodyDef;
       //create ground
       bodyDef.type = b2Body.b2_staticBody;
       
	   var levelBoxes = [[20,debugCanvas.height-10,debugCanvas.width,20],
	   
						 [0,0,20,2000],
						 [2000-20,0,20,2000],
						 [0,2000,2000,20],
						 
						 [100,100,100,100],
						 [1000,1000,800,100],
	   ];
	   var currentBox, halfwidth, halfheight;
	   for (bb in levelBoxes){
		   currentBox = levelBoxes[bb];
		   halfwidth = currentBox[2]/2;
		   halfheight = currentBox[3]/2;
		   // positions the center of the object (not upper left!)
	       bodyDef.position.x = (currentBox[0]+halfwidth) / SCALE;
           bodyDef.position.y = (currentBox[1]+halfheight) / SCALE;
       
	       fixDef.shape.SetAsBox(halfwidth / SCALE, halfheight / SCALE);
           world.CreateBody(bodyDef).CreateFixture(fixDef);
	   }
	   
       //create some objects
       bodyDef.type = b2Body.b2_dynamicBody;
       for(var i = 0; i < 500; ++i) {
          if(Math.random() > 0.5) {
             fixDef.shape = new b2PolygonShape;
             fixDef.shape.SetAsBox(
                   Math.random()/3 + 0.1 //half width
                ,  Math.random()/3 + 0.1 //half height
             );
          } else {
             fixDef.shape = new b2CircleShape(
                Math.random()/2 + 0.1 //radius
             );
          }
          bodyDef.position.x = 10 + Math.random() * 20;
          bodyDef.position.y = Math.random() * 20;
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
		bodyDef.position.x = 40;
		bodyDef.position.y = 5;
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
					body2.color = '#f00';
				}
			}
		}
		world.SetContactListener(collisionListener);

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
		   playerBody.ApplyTorque(4*turn);
	   }
	   var thrust = thrustForce*keyThing.upKey();
	   //console.log(thrust);
	   var fwd = playerBody.GetTransform().R.col2;
	   if (thrust!=0){
		   playerBody.ApplyForce(new b2Vec2(thrust*fwd.x,thrust*fwd.y), playerBody.GetWorldCenter());
	   }
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
  context.fillStyle= "#AAFFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);	//so "lighter" globalCompositeOperation has something to start from
  
  ctx.setTransform(1, 0, 0, 1, canvas.width/2-drawingScale*playerBody.interpPos.x, 
								canvas.height/2-drawingScale*playerBody.interpPos.y);  //centred player
  context.fillStyle="#AAAAAA";
  context.strokeStyle="#000000";
  
  //Draw the bodies
  for (var b = world.GetBodyList(); b; b = b.GetNext()) {
	  
	context.fillStyle= b.color || "#AAAAAA";

	  
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
  
  ctx.globalCompositeOperation = "lighter";
  for (var e in explosions){
	explosions[e].draw();
  }
  ctx.globalCompositeOperation = "source-over"; //set back to default
  
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
  context.stroke();
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
  var fireSpeed=50;	//0 for freefall bomb, +ve for forward firing
  var fwd = playerBody.GetTransform().R.col2;
  
  var playerPosition = playerBody.GetTransform().position;
  var playerVelocity = playerBody.GetLinearVelocity();
  bombDef.position.x = playerPosition.x;
  bombDef.position.y = playerPosition.y;
  bombDef.linearVelocity.x=playerVelocity.x + fireSpeed*fwd.x;
  bombDef.linearVelocity.y=playerVelocity.y + fireSpeed*fwd.y;
  
  var bombBody = world.CreateBody(bombDef);  
  bombBody.CreateFixture(bombfixDef);
  bombBody.countdown=100;
}

function detonateBody(b){
	var bodyPos = b.GetTransform().position;
	new Explosion(~~bodyPos.x, ~~bodyPos.y , 0,0, 4,1 );
	createBlast(bodyPos);
	destroy_list.push(b);
}

function createBlast(position){
	//if creating multiple blasts at the same time (likely to happen if made basts continuous instead of instantaneous),
	//iterating over all bodies for each blast probably inefficient
	var bodyPos, relativePos, distSq, multiplier;
	for (var b = world.GetBodyList(); b; b = b.GetNext()) {
		bodyPos = b.GetTransform().position;
		relativePos = {x:bodyPos.x-position.x,
							y:bodyPos.y-position.y};
		distSq = relativePos.x*relativePos.x + relativePos.y*relativePos.y;
		multiplier = 10/(0.5+distSq);
		b.ApplyImpulse(new b2Vec2(relativePos.x*multiplier,relativePos.y*multiplier), b.GetWorldCenter());	//upward force
		//TODO impulse dependent on object size
	}
	
}

