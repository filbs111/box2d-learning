var debugCanvas;
var debugCtx;
var canvas;
var ctx;
var stats;

var currentTime;
var mechanicsFps = 30;
var timeStep = 1000/mechanicsFps;
var relativeTimescale = 60/mechanicsFps;	//originally tuned for 60fps mechanics
var maxUpdatesPerFrame = 3;

var willFireGun=false;
var autofireCountdown=0;


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
	drill:true,
	torqueAllSegs:false
}

var worker = new Worker('js/worker.js');
var isPlaying=true;		  
function start(){	
	stats = new Stats();
	stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
	document.body.appendChild( stats.dom );
	
	var gui = new dat.GUI();
	gui.add(guiParams, 'tunneling').onChange(switchTunneling);
	gui.add(guiParams, 'drill');
	gui.add(guiParams, 'torqueAllSegs');
	
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
	keyThing.setKeydownCallback(80,function(){			//80=P
		isPlaying = !isPlaying;
		console.log("isPlaying : " + isPlaying);
	});
	
	worker.onmessage=function(e){
		console.log("received message from worker : " + e.data);
	}
	
	assetManager.setOnloadFunc(function(){
		currentTime = (new Date()).getTime();
		requestAnimationFrame(update);
		worker.postMessage(JSON.stringify(guiParams));
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
		   if (guiParams.torqueAllSegs){
		   for (var bb in playerBodies){
			   var thisBody = playerBodies[bb];
			   thisBody.ApplyTorque(6*turn*torqueScale);	//TODO apply torque to joints?
		   }
		   }else{
			   playerBody.ApplyTorque(6*turn*torqueScale);	//TODO apply torque to joints?
		   }
	   }
	   var thrust = thrustForce*keyThing.upKey();
	   //console.log(thrust);
	   var fwd = playerBody.GetTransform().R.col2;
	   if (thrust!=0){
		   //apply thrust to all parts of worm
		   for (var bb in playerBodies){
			   var thisBody = playerBodies[bb];
			   var thisFwd = thisBody.GetTransform().R.col2;
			   thisBody.ApplyForce(new b2Vec2(thrust*thisFwd.x,thrust*thisFwd.y), thisBody.GetWorldCenter());
		   }
		   
		   if (guiParams.drill){
			   //eat landscape in front of player.
				var bodyPos = playerBody.GetTransform().position;
				var fwd = playerBody.GetTransform().R.col2;
				var noseDisplacement = 0.2;
				var nosePos = {x:bodyPos.x + noseDisplacement*fwd.x ,
						y:bodyPos.y + noseDisplacement*fwd.y };
			editLandscapeFixtureBlocks(nosePos.x *SCALE,nosePos.y *SCALE,20);
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

function draw_world(world, context, remainderFraction) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);  //identity
  
  var grd=ctx.createLinearGradient(0,0,0,canvas.height);
  grd.addColorStop(0,"magenta");
  grd.addColorStop(1,"orange");
  ctx.fillStyle=grd;
  context.fillRect(0, 0, canvas.width, canvas.height);	//so "lighter" globalCompositeOperation has something to start from
  
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

//this stuff will be removed when switched to web worker mechanics.
function switchTunneling(tunneling){
	var filter = playerFixture.GetFilterData();
	filter.maskBits = tunneling?3:11;
	playerFixture.SetFilterData(filter);
	playerBody.SetAwake();
}

