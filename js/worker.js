importScripts('../lib/clipper.js',
			'../lib/Box2d.min.js',
			'../js-utils/gaussrand.js',
			'../js/mechanics.js');


self.onmessage = function(e) {
	postMessage("received message from main : " + e.data);
	
	applyGuiParamsUpdate(e.data); //TODO recognise different messages.
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


