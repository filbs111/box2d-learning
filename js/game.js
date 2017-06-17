var debugCanvas;
var debugCtx;
var canvas;
var ctx;
var stats;

var currentTime;

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
	torqueAllSegs:false,
	paused:false,
	drawFromWorker:true,
	drawNormal:false,
}

var worker = new Worker('js/worker.js');
var transformsFromWorker={objTransforms:{},camera:{x:0,y:0}};

function start(){	
	stats = new Stats();
	stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
	document.body.appendChild( stats.dom );
	
	var gui = new dat.GUI();
	gui.add(guiParams, 'tunneling').onChange(switchTunneling);
	gui.add(guiParams, 'drill');
	gui.add(guiParams, 'torqueAllSegs');
	gui.add(guiParams, 'paused');
	gui.add(guiParams, 'drawFromWorker');
	gui.add(guiParams, 'drawNormal');
	
	debugCanvas = document.getElementById("b2dCanvas");
    debugCtx = debugCanvas.getContext("2d");
	debugCanvas.style.display="none";

	canvas = document.getElementById("canvas2d");
    ctx = canvas.getContext("2d");
	aspectFitCanvas();
	
	init();
	keyThing.setKeydownCallback(82,function(){			//82=R
		init();
		worker.postMessage(["init"]);
	});
	keyThing.setKeydownCallback(70,function(){			//70=F
		goFullscreen(canvas);
	});
	
	worker.onmessage=function(evt){
		//console.log("received message from worker : " + e.data);
		
		if (evt.data[0]=="transforms"){
			
			//make a copy of existing positions. this is inefficient - better to not do for nonmoving obejcts,
			//but since may change way do this anyway (transferable objects), keep simple for now
			for (var id in existingPoseInfo){
				existingPoseInfoLast[id] = existingPoseInfo[id];
			}
			
			awaitedUpdatesFromWorker--;
			
   		    camPosWorkerLast = camPosWorkerNew;
			camPosWorkerNew = transformsFromWorker.camera;
			
			transformsFromWorker = evt.data[1];
			
			//cosmetic explosion iteration
			for (var e in explosions){
				explosions[e].iterate();
			}
			
			var toDelete = transformsFromWorker.toDelete;
			for (var ii in toDelete){
				var id = toDelete[ii];
				delete existingPoseInfo[id];
				delete existingDrawInfo[id];
				//possibly TODO delete existingBoundsInfo[id]
			}
			
			var objTransforms = transformsFromWorker.objTransforms;
			var objDrawInfo = transformsFromWorker.objDrawInfo;
			var objBoundsInfo = transformsFromWorker.objBoundsInfo;

			if (transformsFromWorker.messageNumber<lastMessageNumber++){alert("messages out of order!!!");};
			
			for (id in objTransforms){
			  var thisTransform = objTransforms[id];
			  if (thisTransform){
				  existingPoseInfo[id] = thisTransform;
			  }
			}
			for (id in objDrawInfo){
			  var shapes = objDrawInfo[id];
			  if (!shapes){alert("shapes is false!")}
			  existingDrawInfo[id] = shapes;
			  //console.log("pos : " + Object.keys(objTransforms).length + " , draw : " + Object.keys(objDrawInfo).length + " , delete : " + toDelete.length );
			}
			for (id in objBoundsInfo){
			  var shapes = objDrawInfo[id];
			  existingBoundsInfo[id] = objBoundsInfo[id];
			}
			
			var newExplosions=transformsFromWorker.explosions;
			for (id in newExplosions){
				console.log("new explosion!");
				var thisExplosion = newExplosions[id];
				new Explosion(thisExplosion.x, thisExplosion.y , 0,0, 2*relativeScale,0.5*relativeTimescale );
			}
		
		}
	}
	
	assetManager.setOnloadFunc(function(){
		currentTime = (new Date()).getTime();
		requestAnimationFrame(update);
		worker.postMessage(["guiParams", JSON.stringify(guiParams)]);
	});
	assetManager.setAssetsToPreload({
		EXPL: settings.EXPLOSION_IMAGE_SRC
	});
	
}

function update(timeNow) {
   
   //var timeNow = (new Date()).getTime();
   var forceCatchup = false;
   var timeDiff = timeNow-currentTime;
   timeDiff*= guiParams.paused? 0:1;
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
   if (updatesRequired>0){
	   var inputObj={
			turn:keyThing.rightKey() - keyThing.leftKey(),
			thrust:keyThing.upKey(),
			bomb:keyThing.bombKey(),
			turnPlatform:keyThing.downKey(),
			space:keyThing.keystate(32)
		}
		
	   if (updatesRequired>1){
		   for (var ii=1;ii<updatesRequired;ii++){
			   //iterateMechanics(inputObj);  //for normal mechanics
			   worker.postMessage(["iterate", JSON.stringify(inputObj)]);
			   awaitedUpdatesFromWorker++;
		   }
	   }
	   //copyPositions(); //for normal mechanics
	   //iterateMechanics(inputObj); //for normal mechanics
	   worker.postMessage(["iterate", JSON.stringify(inputObj)]);
	   awaitedUpdatesFromWorker++;
   }
   stats.begin();
   //calcInterpPositions(remainderFraction);	//for normal mechanics
   tagLandscapeBlocksNearPlayer();
   draw_world(world, ctx, remainderFraction);
   stats.end();
   requestAnimationFrame(update);
   
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

var existingDrawInfo=[];
var existingBoundsInfo=[];
var existingPoseInfo=[];
var existingPoseInfoLast=[];
var lastMessageNumber =-1;
var camPosWorkerLast = {x:0,y:0}
var camPosWorkerNew = {x:0,y:0}
var awaitedUpdatesFromWorker=0;

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
  
  if (guiParams.drawNormal){
	  //Draw the bodies
	  for (var b = world.GetBodyList(); b; b = b.GetNext()) {
		  
		context.fillStyle= b.color || "#AAA";

		if (b.clippablePath){
			if (!guiParams.drawNormal){continue;}
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
			//if (b.mightCollide){
				grd.addColorStop(0,"rgba(255, 0, 200, 1)");
				grd.addColorStop(0.1,"rgba(150, 5, 125, 1)");
				grd.addColorStop(0.95,"rgba(150, 5, 125, 1)");
			//}else{
			//    grd.addColorStop(0,"rgba(200, 200, 200, 0.8)");
			//	grd.addColorStop(0.1,"rgba(125, 125, 125, 0.8)");
			//	grd.addColorStop(0.95,"rgba(125, 125, 125, 0.8)");	
			//}
			context.fillStyle=grd;
			
			context.fill();
			//context.stroke();
			
		}
		else{
			//A body has many fixtures
			for (var f = b.GetFixtureList(); f != null; f = f.GetNext()) {
			  var shape = f.GetShape();
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
	  
  } //endif drawNormal
 
  
  
  if (guiParams.drawFromWorker){
	  
	  
  
  //draw the player position from the worker. (test mechanics same in both instances)
  
   //adjust remainderFraction to account for awaitedUpdatesFromWorker (default value is true if updates are returned instantaneously)
  var adjRemainder = remainderFraction + awaitedUpdatesFromWorker - 0.5;	//0.5 guess- remainderFraction is from 0 to 1, awaitedUpdatesFromWorker is typically 0 or 1.
  
  //cap from 0 to 1 to avoid drawing bullets in walls etc. actually doesn't seem to help. TODO better scheduling. 
  //adjRemainder = Math.max(0,Math.min(1,adjRemainder));
  
  //interpolate
  var oneMinus = 1-adjRemainder;
  
  
  
  var camPosWorker = { x: camPosWorkerNew.x*adjRemainder + camPosWorkerLast.x*oneMinus,
					y: camPosWorkerNew.y*adjRemainder + camPosWorkerLast.y*oneMinus};
  
  //TODO expect should use some different remainderFraction. existing doesn't work here because sending iterate message and receiving result is separate.
  
  
  var screenBoundsWorker = {
	  left: (drawingScale*camPosWorker.x - canvas.width/2)/(drawingScale/SCALE),
	  right: (drawingScale*camPosWorker.x + canvas.width/2)/(drawingScale/SCALE),
	  top: (drawingScale*camPosWorker.y - canvas.height/2)/(drawingScale/SCALE),
	  bottom: (drawingScale*camPosWorker.y + canvas.height/2)/(drawingScale/SCALE)
  }
  
  ctx.setTransform(1, 0, 0, 1, canvas.width/2-drawingScale*camPosWorker.x, canvas.height/2-drawingScale*camPosWorker.y);
  
  var stdFill="#aaa";

  for (id in existingPoseInfo){
	  var thisTransform = existingPoseInfo[id];
	  var thisPos = thisTransform.position;
	  var interpPos;
      var lastTransform = existingPoseInfoLast[id];
	  if (lastTransform){
		var lastPos = lastTransform.position;
		interpPos= {x: thisPos.x*adjRemainder + lastPos.x*oneMinus,
					y: thisPos.y*adjRemainder + lastPos.y*oneMinus};
	  }
	  
	  var thisRMat = thisTransform.R;	//TODO interpolate
	  
	  var shapes = existingDrawInfo[id];
	  	  
		 
	if (interpPos){
 
	  var bounds = existingBoundsInfo[id];
	  if (bounds){
		  
		//draw landscape
		var cPath = shapes;
 
		var numLoops = cPath.length;
		var numPoints;
		if (numLoops==0){
			console.log("no loops in clippable path. this is unexpected");
			continue;
		} else {
			
			//confirm is within bounds of screen.
			//could make faster check by convoluting bounds with screen size
			if (screenBoundsWorker.left>bounds.right || screenBoundsWorker.top>bounds.bottom || screenBoundsWorker.right<bounds.left || screenBoundsWorker.bottom<bounds.top){
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
		
		var grd=ctx.createLinearGradient( 0 ,bounds.top*drawingScale/SCALE, 0,bounds.bottom*drawingScale/SCALE);
		grd.addColorStop(0,"rgba(255, 0, 200, 1)");
		grd.addColorStop(0.1,"rgba(150, 5, 125, 1)");
		grd.addColorStop(0.95,"rgba(150, 5, 125, 1)");	
		context.fillStyle=grd;
		context.fill();
		
	  }else{
		  for (sss in shapes){
			thisShape = shapes[sss];
			switch(thisShape.type){
				case b2Shape.e_circleShape:
					ctx.beginPath();
					ctx.arc(interpPos.x*drawingScale,interpPos.y*drawingScale,thisShape.radius*drawingScale,0,2*Math.PI);
					//ctx.stroke();
					
					var r = thisShape.radius;
					  //make gradient to cover the shape
					  var grd=ctx.createLinearGradient( 0 ,(interpPos.y-r) * drawingScale,0,(interpPos.y+r)*drawingScale);
					  grd.addColorStop(0,"#e7c");
					  grd.addColorStop(0.3,"#b5b");
					  grd.addColorStop(0.6,"#754");
					  grd.addColorStop(1,"#883");
					  context.fillStyle=grd;
					
					ctx.fill();
					break;
				case b2Shape.e_polygonShape:
					ctx.beginPath();
					var verts = thisShape.verts;
					var transformedverts=[];
					
					for (var ii=0;ii<verts.length;ii++){
						var thisVert = verts[ii];
						transformedverts.push({
							x:interpPos.x + thisVert.x*thisRMat.col1.x + thisVert.y*thisRMat.col2.x ,
							y:interpPos.y + thisVert.x*thisRMat.col1.y + thisVert.y*thisRMat.col2.y 
						});
					}
					
					context.moveTo(transformedverts[verts.length-1].x * drawingScale, 
									transformedverts[verts.length-1].y * drawingScale);
					for (var i = 0; i < verts.length; i++) {
						context.lineTo(transformedverts[i].x * drawingScale, 
									transformedverts[i].y * drawingScale);
					}
					
				    context.fillStyle=stdFill;
					ctx.fill();

					//ctx.stroke();
					break;
			}
		  }
	  }
	  
		//ctx.fillText(id, 10+interpPos.x*drawingScale,interpPos.y*drawingScale );
	  } 
	  
  }
  
  
   ctx.globalCompositeOperation = "lighter";
	  for (var e in explosions){
		explosions[e].draw();
	  }
	  ctx.globalCompositeOperation = "source-over"; //set back to default
  
  
  ctx.setTransform(1, 0, 0, 1, 0, 0);  //identity
  
  var startWater = Math.max(0, canvas.height/2-drawingScale*(waterLevel+camPosWorker.y));
  var endWater = canvas.height;
  //context.fillStyle="rgba(0, 150, 75, 0.5)";
  context.fillStyle="rgba(0, 100, 150, 0.5)";

  context.fillRect(0, startWater, canvas.width, endWater-startWater);	
  
  
	context.fillStyle="#000";
	ctx.fillText(awaitedUpdatesFromWorker, 10,10 );
  
  	  context.fillRect(20, 100, 20, 1);	
	  context.fillRect(20, 100+100*adjRemainder, 40, 1);	

	  
	  context.fillRect(20, 200, 20, 1);	

  
  
  }	//end if draw from worker
  
  
  
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

//do nothing (only used by worker mechanics) TODO delete
function queueExplosionMessage(x, y){}
