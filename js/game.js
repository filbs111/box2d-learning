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
	var pixelRatio=guiParams.pixelScale;		//set to 0.5 to double size of canvas pixels on screen etc
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
	draw:true,
	fill:true,
	logMssgs:false,
	capInterp:false,
	pixelScale:1
}

var worker = new Worker('js/worker.js');
var transformsFromWorker={objTransforms:{},camera:{x:0,y:0}};
var mssgProcessTimeAvg=0;
var mssgSendProcessTimeAvg=0;
var iterProcessTimeAvg=0;
var downTimeAvg=0;

function printStats(){
	console.log("awaitedUpdatesFromWorker:" + awaitedUpdatesFromWorker);
	console.log("mssgProcessTimeAvg: " + mssgProcessTimeAvg.toFixed(4));
	console.log("iterProcessTimeAvg:" + iterProcessTimeAvg.toFixed(4));		//iterating mechanics in worker
	console.log("mssgSendProcessTimeAvg:" + mssgSendProcessTimeAvg.toFixed(4));	//creating a message to send from the worker
	console.log("downTimeAvg: " + downTimeAvg.toFixed(4));	
}

function start(){	
	stats = new Stats();
	stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
	document.body.appendChild( stats.dom );
	
	var gui = new dat.GUI();
	gui.add(guiParams, 'tunneling').onChange(switchTunneling);
	gui.add(guiParams, 'drill');
	gui.add(guiParams, 'torqueAllSegs');
	gui.add(guiParams, 'paused');
	gui.add(guiParams, 'draw');
	gui.add(guiParams, 'fill');
	gui.add(guiParams, 'logMssgs');
	gui.add(guiParams, 'capInterp');
	gui.add(guiParams, 'pixelScale', 0.2,2,0.1).onChange(aspectFitCanvas);
	
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
			
			var startTime = window.performance.now();	//ms
			
			//make a copy of existing positions. this is inefficient - better to not do for nonmoving obejcts,
			//but since may change way do this anyway (transferable objects), keep simple for now
			for (var id in existingPoseInfo){
				existingPoseInfoLast[id] = existingPoseInfo[id];
			}
			
			awaitedUpdatesFromWorker--;
			
   		    camPosWorkerLast = camPosWorkerNew;
			camPosWorkerNew = transformsFromWorker.camera;
			
			var jsonString = evt.data[1];
			if (guiParams.logMssgs){
				console.log(jsonString);
				console.log(jsonString.length);
			}
			if (typeof jsonString == "string"){
				transformsFromWorker = JSON.parse(jsonString);
			}else{
				transformsFromWorker=jsonString;
			}
			//console.log(jsonString.length);
			
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
				var thisExplosion = newExplosions[id];
				new Explosion(thisExplosion.x, thisExplosion.y , 0,0, 2*relativeScale,0.5*relativeTimescale );
			}
		
			var transformMessageProcessTime = window.performance.now() - startTime;
			mssgProcessTimeAvg = mssgProcessTimeAvg*0.9 + 0.1*transformMessageProcessTime;	//starts too low but unimportant
			mssgSendProcessTimeAvg = mssgSendProcessTimeAvg*0.9 + 0.1*transformsFromWorker.mssgProcessTime;	//starts too low but unimportant
			iterProcessTimeAvg = iterProcessTimeAvg*0.9 + 0.1*transformsFromWorker.iterTime;	//starts too low but unimportant
			downTimeAvg = downTimeAvg*0.9 + 0.1*transformsFromWorker.downTime;	//starts too low but unimportant
			
			
		}
	}
	
	assetManager.setOnloadFunc(function(){
		currentTime = window.performance.now(); //(new Date()).getTime();
		requestAnimationFrame(update);
		checkInput();
		worker.postMessage(["guiParams", JSON.stringify(guiParams)]);
	});
	assetManager.setAssetsToPreload({
		EXPL: settings.EXPLOSION_IMAGE_SRC
	});
	
}

function checkInput(){
	//TODO handle case that tab not in use (ie requestAnimationFrame isn't getting called)
	
	//do this as often as pos - request a mechanics update from the worker at regular intervals.
	//var timeNow = (new Date()).getTime();	//todo use higher performance timer
	var timeNow = window.performance.now();
	
	var timeDiff = timeNow-currentTime;
	timeDiff*= guiParams.paused? 0:1;
    var updatesRequired = timeDiff/timeStep;
	updatesRequired = Math.floor(updatesRequired);	//necessary?
	
	if (updatesRequired>0){
		
		if (updatesRequired>1){	//accept some slowdown
			updatesRequired=1;
			console.log("updatesRequired>1 !");
			currentTime = timeNow;
		}
		if (awaitedUpdatesFromWorker>2){
			updatesRequired=0;
			console.log("awaiting too many mechanics responses!");
			currentTime = timeNow;
		}
		
		//just request the one update.
		var inputObj={
			turn:keyThing.rightKey() - keyThing.leftKey(),
			thrust:keyThing.upKey(),
			bomb:keyThing.bombKey(),
			turnPlatform:keyThing.downKey(),
			space:keyThing.keystate(32)
		}

		for (var ii=0;ii<updatesRequired;ii++){
			worker.postMessage(["iterate", JSON.stringify(inputObj)]);
			currentTime+=timeStep;
			awaitedUpdatesFromWorker++;
		}
		
	}
	setTimeout(checkInput,15);	//shouldn't spam this - TODO check timer to see when would actually result in taking input and use that val for timeout
}

function update(timeNow) {
   
   var timeDiff = timeNow-currentTime;
   timeDiff*= guiParams.paused? 0:1;
   var stepsAhead = timeDiff/timeStep;
  
   stats.begin();
   if (guiParams.draw){
	   tagLandscapeBlocksNearPlayer();
	   draw_world(world, ctx, stepsAhead);
   }
   stats.end();
   
    requestAnimationFrame(update);

}; // update()


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
    
  
  
  //draw the player position from the worker. (test mechanics same in both instances)
  
   //adjust remainderFraction to account for awaitedUpdatesFromWorker (default value is true if updates are returned instantaneously)
  var adjRemainder = remainderFraction + awaitedUpdatesFromWorker - 0.5;	//0.5 guess- remainderFraction is from 0 to 1, awaitedUpdatesFromWorker is typically 0 or 1.
  
  //cap from 0 to 1 to avoid drawing bullets in walls etc. actually doesn't seem to help. TODO better scheduling. 
  
  if (guiParams.capInterp){
	adjRemainder = Math.max(0,Math.min(1,adjRemainder));
  }
  
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
	  var thisPos = {x:thisTransform[0], y: thisTransform[1]};
	  var interpPos;
      var lastTransform = existingPoseInfoLast[id];
	  if (lastTransform){
		var lastPos = {x:lastTransform[0], y: lastTransform[1]};	//todo save this result instead of calculating separately for this, last.
		interpPos= {x: thisPos.x*adjRemainder + lastPos.x*oneMinus,
					y: thisPos.y*adjRemainder + lastPos.y*oneMinus};
	  }
	  
	  var r = thisTransform[2] * (Math.PI / 180);
	  var ct = Math.cos(r);
	  var st = Math.sin(r);	  
	  var thisRMat = {col1:{x: ct , y:st }, col2:{x: -st , y:ct}};
	  
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
		
		if (guiParams.fill){
			var grd=ctx.createLinearGradient( 0 ,bounds.top*drawingScale/SCALE, 0,bounds.bottom*drawingScale/SCALE);
			grd.addColorStop(0,"rgba(200, 200, 200, 0.8)");
			grd.addColorStop(0.1,"rgba(125, 125, 125, 0.8)");
			grd.addColorStop(0.95,"rgba(125, 125, 125, 0.8)");		
			context.fillStyle=grd;
			context.fill();
		}else{
			context.stroke();
		}
		
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
					
					if (guiParams.fill){
						ctx.fill();
					}else{
						context.stroke();
					}
					
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
					if (guiParams.fill){
						ctx.fill();
					}else{
						context.stroke();
					}

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
	ctx.fillText(awaitedUpdatesFromWorker, 10,220 );
	ctx.fillText(mssgProcessTimeAvg.toFixed(4), 10,230 );		//processing the received message here
	ctx.fillText(iterProcessTimeAvg.toFixed(4), 10,240 );		//iterating mechanics in worker
	ctx.fillText(mssgSendProcessTimeAvg.toFixed(4), 10,250 );	//creating a message to send from the worker
	ctx.fillText(downTimeAvg.toFixed(4), 10,260 );				//between end worker iteration and start next iteration

	context.fillRect(20, 100, 20, 1);	
	  context.fillRect(20, 100+100*adjRemainder, 40, 1);	
	  context.fillRect(20, 200, 20, 1);	

  
  
  
  
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
