importScripts('../lib/clipper.js',
			'../lib/Box2d.min.js',
			'../js-utils/gaussrand.js',
			'../js/mechanics.js',
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
			var objTransforms=[];
			//list all objects.
			//this will result in stringifying, sending and parsing a lot of JSON.
			//possible improvements: sending only things that have changed position, or things that are on screen
			//using byte arrays rather than strings
			//using transferable objects (expect should just do this)
			
			//todo let renderer know what each object looks like.
			for (var b = world.GetBodyList(); b; b = b.GetNext()) {
				if (!b.clippablePath){	//not a landscape thing
					objTransforms.push(b.GetTransform());	//might optimise by only sending x,y for bombs, else x,y,rotation
															// (rotation matrix can be reconstructed)
				}
			}
			
			postMessage(["transforms",JSON.stringify(
			{objTransforms:objTransforms,
			camera:camPos
			})]);
			break;
		case "guiParams":
			applyGuiParamsUpdate(JSON.parse(e.data[1]));
			break;
	}
};

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


