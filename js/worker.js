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
			postMessage(["transforms",JSON.stringify(
			{player:playerBody.GetTransform(),	//note that x,y angle is sufficient
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


