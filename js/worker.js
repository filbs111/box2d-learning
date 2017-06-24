importScripts('../lib/seedrandom.min.js',
			'../lib/clipper.js',
			'../lib/Box2d.min.js',
			'../js/mechanics.js',
			'../js-utils/gaussrand.js',
			'../js-utils/explosions.js',
			'../js-utils/settings.js');


var existingDrawInfoAvailable=[];
var existingPoseInfoStringified=[];
var messageNumber = 0;		

var lastEndTime;

var spamString = "";
for (var ss = 0; ss<100;ss++){
	spamString+=Math.random()*1000;
}

self.onmessage = function(e) {
	//postMessage("received message from main : " + e.data[0]);
	//console.log("received message from main : " + e.data[0]);
	switch (e.data[0]){
		case "init":
			console.log("init called in worker");
			init();
			break;
		case "iterate":
			var startTime = performance.now();	//ms
			var downTime=0;
			if (lastEndTime){
				downTime = startTime-lastEndTime;
			}

			var inputObj=JSON.parse(e.data[1]);
			iterateMechanics(inputObj);
			
			var timeNow = performance.now();	//ms
			var iterProcessTime = timeNow - startTime;
			
			var objTransforms={};
			var objDrawInfo={};
			var objBoundsInfo={};
			
			//list all objects.
			//this will result in stringifying, sending and parsing a lot of JSON.
			//possible improvements: sending only things that have changed position, or things that are on screen
			//using byte arrays rather than strings
			//using transferable objects (expect should just do this)
			
			//list all ids so can pull out things that still exist, send delete command for the rest.
			var existingObjects={};
			for (ii in existingPoseInfoStringified){
				existingObjects[ii]=true;
			}
			
			//todo let renderer know what each object looks like.
			for (var b = world.GetBodyList(); b; b = b.GetNext()) {
				
				//assign a unique id if doesn't already have one
				if (!b.uniqueId){b.uniqueId=nextId();}
				
				var thisPos = b.GetTransform().position;
				var thisR = b.GetTransform().R;
				var thisAng = Math.atan2(thisR.col1.y , thisR.col1.x);
				var thisTransformShortFormat = [ +thisPos.x.toFixed(2), +thisPos.y.toFixed(2), ~~((1800/Math.PI)*thisAng) ]; //angle in degrees
				if (!b.clippablePath){
					var stringifiedTransform = JSON.stringify(thisTransformShortFormat);
					if ( !existingPoseInfoStringified[b.uniqueId] || existingPoseInfoStringified[b.uniqueId] != stringifiedTransform ) {
							objTransforms[b.uniqueId]=thisTransformShortFormat;	//might optimise by only sending x,y for bombs, else x,y,rotation
																			// (rotation matrix can be reconstructed)
							existingPoseInfoStringified[b.uniqueId]=stringifiedTransform;
					}
				}else{
					if (!existingPoseInfoStringified[b.uniqueId]){
						objTransforms[b.uniqueId]=thisTransformShortFormat;
						existingPoseInfoStringified[b.uniqueId]=true;
					}
				}
						
				if (!existingDrawInfoAvailable[b.uniqueId] || b.shouldSend){	//to test that stringifying (for comparision) isn't cause of slowness, turn off. 
				b.shouldSend = false;
				
				var shapes = [];	//normally only 1 shape in array
				
				if (!b.clippablePath){		
					for (var f = b.GetFixtureList(); f != null; f = f.GetNext()) {
					  var shape = f.GetShape();
					  var shapeOut = {};
					  var shapeType = shape.GetType();
					  shapeOut.type = shapeType;
					  switch (shapeType){
						  case b2Shape.e_circleShape:
							shapeOut.radius = shape.GetRadius();
							break;
						  case b2Shape.e_polygonShape:
							shapeOut.verts = shape.GetVertices();
							break;
					  }
					  shapes.push(shapeOut);
					};
				}else{	//landscape
					//shapes = b.clippablePath;	//different units to non landscape, but for now just handle differently when drawing.
					
					//try shrinking string by rounding paths
					for (var pp in b.clippablePath){
						var thisP = b.clippablePath[pp];
						var newP = [];
						for (var ii in thisP){
							var thisPoint = thisP[ii];
								//newP.push({X:thisPoint.X, Y:thisPoint.Y});
								newP.push([~~thisPoint.X, ~~thisPoint.Y]);
						}
						shapes.push(newP);
					}
					//console.log(shapes);
				}
				
				//if (currentDrawInfo != jsonshapes ){
					objBoundsInfo[b.uniqueId]=b.bounds;
					objDrawInfo[b.uniqueId]=shapes;
					existingDrawInfoAvailable[b.uniqueId] = true;
				}
								
				//remove uniqueId
				delete existingObjects[b.uniqueId];
				
			}
						
			for (var ii in existingObjects){	//now things that don't exist
				delete existingDrawInfoAvailable[ii];
				delete existingPoseInfoStringified[ii];
			}
			
			var transformMessageProcessTime = performance.now() - timeNow;
			
			var objToSend = {transforms:objTransforms,
			camera:[+camPos.x.toFixed(2),+camPos.y.toFixed(2)],
			mssgProcessTime:+transformMessageProcessTime.toFixed(2),
			iterTime:+iterProcessTime.toFixed(2),
			downTime:+downTime.toFixed(2),
			mssgNum:messageNumber++
			}
			if (Object.keys(objDrawInfo).length>0){
				objToSend.drawInfo=objDrawInfo;
			}
			if (explosionMessageList.length >0){
				objToSend.explosions=explosionMessageList;
			}
			if (Object.keys(existingObjects).length>0){
				objToSend.toDelete=Object.keys(existingObjects);
			}
			if (Object.keys(objBoundsInfo).length>0){
				objToSend.boundsInfo=objBoundsInfo;
			}
				
			if (inputObj.sendSpam){
				objToSend.spam=spamString;
			}
			
			postMessage(["transforms",
			JSON.stringify(objToSend)
			]);
			
			explosionMessageList=[];
			
			lastEndTime = startTime = performance.now();;
			
			break;
		case "guiParams":
			applyGuiParamsUpdate(JSON.parse(e.data[1]));
			break;
	}
};

var nextId=(function(){
	id=0;
	return function(){
		return id++;
	}
})();

var guiParams={};	//worker does not have direct access to variables in main scope.
var guiParamsPrevious;	
	
function applyGuiParamsUpdate(data){
	guiParamsPrevious = guiParams;
	guiParams = data;
	
	if (guiParamsPrevious.tunneling != guiParams.tunneling){
		var filter = playerFixture.GetFilterData();
		filter.maskBits = guiParams.tunneling?3:11;
		playerFixture.SetFilterData(filter);
		playerBody.SetAwake();
	}
	
	console.log("set guiParams in worker:");
	console.log(guiParams);
}

var explosionMessageList = [];
function queueExplosionMessage(x, y){
	explosionMessageList.push({x:x,y:y});
}

init();


