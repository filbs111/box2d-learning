var debugCanvas;
var debugCtx;
var canvas;
var ctx;
var stats;

var initscount=0;
var currentTime;
var mechanicsFps = 30;
var timeStep = 1000/mechanicsFps;
var relativeTimescale = 60/mechanicsFps;	//originally tuned for 60fps mechanics
var maxUpdatesPerFrame = 3;
var playerBody;
var playerFixture;
var willFireGun=false;
var autofireCountdown=0;


var floatingPlatform;

var landscapeBlocks=[];
var scheduledBlocksToUpdate=[];
var scheduledBlocksToPurge=[[],[]];

var camTargetPos = new b2Vec2(0,0);
var camPos = new b2Vec2(0,0);
var camVel = new b2Vec2(0,0);
var camPosInterp = new b2Vec2(0,0);
var camLookAhead = new b2Vec2(0,0);
		
window.onresize = aspectFitCanvas;		

function aspectFitCanvas(evt) {
    var ww = window.innerWidth;
    var wh = window.innerHeight;
	var desiredAspect=1.6;
	var pixelRatio=1;		//set to 0.5 to double size of canvas pixels on screen etc
	if ( ww  > wh * desiredAspect ) {
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

var guiParams={
	tunneling:false,
	drill:true
}

//var worker = new Worker('js/worker.js');
var isPlaying=true;		  
function start(){	
	stats = new Stats();
	stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
	document.body.appendChild( stats.dom );
	
	var gui = new dat.GUI();
	gui.add(guiParams, 'tunneling').onChange(function(val){
		console.log("switched tunneling : " + val);
		switchTunneling(val);
		});
	gui.add(guiParams, 'drill')
	
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
	/*
	worker.onmessage=function(e){
		console.log("received message from worker : " + e.data);
	}
	*/
	assetManager.setOnloadFunc(function(){
		currentTime = (new Date()).getTime();
		requestAnimationFrame(update);
		//worker.postMessage("please start!");
	});
	assetManager.setAssetsToPreload({
		EXPL: settings.EXPLOSION_IMAGE_SRC
	});
	
}


var velIts=8;
var posIts=3;

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
   tagLandscapeBlocksNearPlayer();
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
		   
		   if (guiParams.drill){
			   //eat landscape in front of player.
				var bodyPos = playerBody.GetTransform().position;
				var fwd = playerBody.GetTransform().R.col2;
				var noseDisplacement = 0.2;
				var nosePos = {x:bodyPos.x + noseDisplacement*fwd.x ,
						y:bodyPos.y + noseDisplacement*fwd.y };
			editLandscapeFixtureBlocks(nosePos.x *SCALE,nosePos.y *SCALE,25);
		   }
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
		  ,  velIts       //velocity iterations
		  ,  posIts       //position iterations
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
		
		var grd=ctx.createLinearGradient( 0 ,b.bounds.top*drawingScale/SCALE, 0,b.bounds.bottom*drawingScale/SCALE);

		if (b.mightCollide){
			grd.addColorStop(0,"rgba(255, 0, 200, 1)");
			grd.addColorStop(0.1,"rgba(150, 5, 125, 1)");
			grd.addColorStop(0.95,"rgba(150, 5, 125, 1)");
		}else{
			grd.addColorStop(0,"rgba(200, 200, 200, 0.8)");
			grd.addColorStop(0.1,"rgba(125, 125, 125, 0.8)");
			grd.addColorStop(0.95,"rgba(125, 125, 125, 0.8)");
		}
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
	   bombfixDef.filter.maskBits=9;	//collide with 0,3 (9=1+8)
	   
bombfixDef.shape = new b2CircleShape(
			0.1*relativeScale //radius
		 );	  		 
   
function dropBomb(){
  //var speeds = [{fwd:0,left:0}];	//bomb
  var speeds = [{fwd:20*relativeScale + gaussRand()*2*relativeScale,left:gaussRand()*2*relativeScale}];
  //var speeds = [{fwd:35,left:0}, {fwd:30,left:5}, {fwd:30,left:-5}];	//triple shot
  //var speeds = [{fwd:25,left:0}, {fwd:20,left:5}, {fwd:20,left:-5}];	//triple shot
  //var speeds = [{fwd:15,left:0}, {fwd:10,left:5}, {fwd:10,left:-5}];	//triple shot
  
  //random spray for stress test
  //for (var ii=0;ii<5;ii++){
//	  speeds.push({fwd:gaussRand()*10*relativeScale,left:gaussRand()*10*relativeScale});
 // }
  
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
		multiplier = 10*forceScale/(0.5+distSq/distsqScale);
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

function switchTunneling(tunneling){
	var filter = playerFixture.GetFilterData();
	filter.maskBits = tunneling?3:11;
    playerFixture.SetFilterData(filter);
	playerBody.SetAwake();
}


