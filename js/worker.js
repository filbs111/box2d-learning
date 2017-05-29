importScripts('../lib/seedrandom.min.js',
			'../lib/clipper.js',
			'../lib/Box2d.min.js',
			'../js/mechanics.js',
			'../js-utils/gaussrand.js',
			'../js-utils/explosions.js',
			'../js-utils/settings.js');


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
			
			//list all objects.
			//this will result in stringifying, sending and parsing a lot of JSON.
			//possible improvements: sending only things that have changed position, or things that are on screen
			//using byte arrays rather than strings
			//using transferable objects (expect should just do this)
			
			//todo let renderer know what each object looks like.
			for (var b = world.GetBodyList(); b; b = b.GetNext()) {
				
				//assign a unique id if doesn't already have one
				if (!b.uniqueId){b.uniqueId=nextId();}
				
				if (!b.clippablePath){	//not a landscape thing
					//send some id. might optimise by just sending ordered array
				
					objTransforms[b.uniqueId]=b.GetTransform();	//might optimise by only sending x,y for bombs, else x,y,rotation
															// (rotation matrix can be reconstructed)
															
															
					var shapes = [];	//normally only 1 shape in array
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
					}
					objDrawInfo[b.uniqueId]=shapes;	//naively send every shape every frame
					
				}
			}
			
			postMessage(["transforms",JSON.stringify(
			{objTransforms:objTransforms,
			objDrawInfo:objDrawInfo,
			camera:camPos
			})]);
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


