var debugCanvas;
var debugCtx;
var canvas;
var ctx;
var world;
var stats;

var initscount=0;
var currentTime;
var timeStep = 1000/60;	//milliseconds. 60fps
var maxUpdatesPerFrame = 5;
var playerBody;
var thrustForce=15;

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

function start(){
	stats = new Stats();
	stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
	document.body.appendChild( stats.dom );
	
	init();
	keyThing.setKeydownCallback(32,function(){			//32=space key
		playerBody.ApplyForce(new b2Vec2(0,-100), playerBody.GetWorldCenter());	//upward force
	});
	keyThing.setKeydownCallback(82,function(){			//82=R
		init();
	});
	
	currentTime = (new Date()).getTime();
	requestAnimationFrame(update);
}

function init(){
	initscount++;
	console.log("init called. " + initscount);
	
	debugCanvas = document.getElementById("b2dCanvas");
    debugCtx = debugCanvas.getContext("2d");
	
	canvas = document.getElementById("canvas2d");
    ctx = debugCanvas.getContext("2d");
	
       world = new b2World(
             new b2Vec2(0, 10)    //gravity
          ,  true                 //allow sleep
       );
       
       var SCALE = 30;
     
       var fixDef = new b2FixtureDef;
       fixDef.density = 1.0;
       fixDef.friction = 0.5;
       fixDef.restitution = 0.2;
     
       var bodyDef = new b2BodyDef;
     
       //create ground
       bodyDef.type = b2Body.b2_staticBody;
       
       // positions the center of the object (not upper left!)
       bodyDef.position.x = debugCanvas.width / 2 / SCALE;
       bodyDef.position.y = debugCanvas.height / SCALE;
       
       fixDef.shape = new b2PolygonShape;
       
       // half width, half height. eg actual height here is 1 unit
       fixDef.shape.SetAsBox((debugCanvas.width / SCALE) / 2, (10/SCALE) / 2);
       var levelBody = world.CreateBody(bodyDef).CreateFixture(fixDef);

       //create some objects
       bodyDef.type = b2Body.b2_dynamicBody;
       for(var i = 0; i < 8; ++i) {
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
          bodyDef.position.x = Math.random() * 20;
          bodyDef.position.y = Math.random() * 10;
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
		bodyDef.position.x = 30;
		bodyDef.position.y = 5;
		playerBody = world.CreateBody(bodyDef);
		playerBody.CreateFixture(fixDef);
		playerBody.SetAngularDamping(10);
		playerBody.SetAngle(Math.PI);
		
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
			   iterateMechanics();
		   }
	   }
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
   
   function iterateMechanics(){
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
	   
	   world.Step(
			 0.001*timeStep   //seconds
		  ,  10       //velocity iterations
		  ,  10       //position iterations
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
	playerBody.interpPos = new b2Vec2();
    playerBody.interpPos.Set(playerBody.GetTransform().position.x * (remainderFraction)  +  oneMinus*playerBody.oldPos.x ,
						playerBody.GetTransform().position.y * (remainderFraction)  +  oneMinus*playerBody.oldPos.y );
}

function draw_world(world, context) {
  var scale=30;
  ctx.setTransform(1, 0, 0, 1, 0, 0);  //identity
  context.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.setTransform(1, 0, 0, 1, canvas.width/2-scale*playerBody.interpPos.x, 
								canvas.height/2-scale*playerBody.interpPos.y);  //centred player
  context.fillStyle="#AAAAAA";
  context.strokeStyle="#000000";
  
  //Draw the bodies
  for (var b = world.GetBodyList(); b; b = b.GetNext()) {
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
  
  function drawShape(body, shape, context) {
  context.beginPath();

  switch (shape.GetType()) {

  case b2Shape.e_circleShape:
    {
      var circle = shape;
      var pos = body.GetPosition();
      var r = shape.GetRadius();
      var segments = 16.0;
      var theta = 0.0;
      var dtheta = 2.0 * Math.PI / segments;

      // draw circle
      context.moveTo((pos.x + r) * scale, pos.y * scale);

      for (var i = 0; i < segments; i++) {
        var d = new b2Vec2(r * Math.cos(theta), r * Math.sin(theta));

        var v = pos.Copy();
        v.Add(d);
        context.lineTo(v.x * scale, v.y * scale);
        theta += dtheta;
      }

      context.lineTo((pos.x + r) * scale, pos.y * scale);

      // draw radius line
      context.moveTo(pos.x * scale, pos.y * scale);
      var ax = body.GetTransform().R.col1;

      var pos2 = new b2Vec2(pos.x + r * ax.x, pos.y + r * ax.y);
      context.lineTo(pos2.x * scale, pos2.y * scale);
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

      context.moveTo(tV.x * scale, tV.y * scale);

      for (var i = 0; i < vert.length; i++) {
        var v = vert[i].Copy();
        v.MulM(body.GetTransform().R);
        v.Add(position);
        context.lineTo(v.x * scale, v.y * scale);
      }

      context.lineTo(tV.x * scale, tV.y * scale);
    }

    break;
  }
  //this will fill a shape
  context.fill();

  //this will create the outline of a shape
  context.stroke();
  } 
}


