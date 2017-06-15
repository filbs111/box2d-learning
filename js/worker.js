importScripts('../lib/seedrandom.min.js',
			'../lib/clipper.js',
			'../lib/Box2d.min.js',
			'../js/mechanics.js',
			'../js-utils/gaussrand.js',
			'../js-utils/explosions.js',
			'../js-utils/settings.js');


var existingDrawInfoStringified=[];
var existingPoseInfoStringified=[];
var messageNumber = 0;		

self.onmessage = function(e) {
	//postMessage("received message from main : " + e.data[0]);
	//console.log("received message from main : " + e.data[0]);
	switch (e.data[0]){
		case "init":
			console.log("init called in worker");
			init();
			break;
		case "iterate":
			iterateMechanics(JSON.parse(e.data[1]));
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
								
				var stringifiedTransform = JSON.stringify(b.GetTransform());
				if ( !existingPoseInfoStringified[b.uniqueId] || existingPoseInfoStringified[b.uniqueId] != stringifiedTransform ) {
					objTransforms[b.uniqueId]=b.GetTransform();	//might optimise by only sending x,y for bombs, else x,y,rotation
														// (rotation matrix can be reconstructed)
					existingPoseInfoStringified[b.uniqueId]=stringifiedTransform;
				}
				
						
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
					shapes = b.clippablePath;	//different units to non landscape, but for now just handle differently when drawing.
				}
				
				var currentDrawInfo = existingDrawInfoStringified[b.uniqueId];	// || "";
				if (!currentDrawInfo || b.shouldSend){	//to test that stringifying (for comparision) isn't cause of slowness, turn off.  
				b.shouldSend = false;
				var jsonshapes = JSON.stringify(shapes);	//TODO flag objects for re-send when edit landscape
				//if (currentDrawInfo != jsonshapes ){
					objBoundsInfo[b.uniqueId]=b.bounds;
					objDrawInfo[b.uniqueId]=shapes;
					existingDrawInfoStringified[b.uniqueId] = jsonshapes;
				}
								
				//remove uniqueId
				delete existingObjects[b.uniqueId];
				
			}
						
			for (var ii in existingObjects){	//now things that don't exist
				delete existingDrawInfoStringified[ii];
				delete existingPoseInfoStringified[ii];
			}
			
			
			postMessage(["transforms",
			{objTransforms:objTransforms,
			objDrawInfo:objDrawInfo,
			objBoundsInfo:objBoundsInfo,
			toDelete:Object.keys(existingObjects),
			camera:camPos,
			messageNumber:messageNumber++
			}]);
			
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

init();


