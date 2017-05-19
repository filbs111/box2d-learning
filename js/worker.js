importScripts('../lib/Box2d.min.js',
			'../lib/clipper.js',
			'../js-utils/gaussrand.js',
			'../js/mechanics.js');



		  
self.onmessage = function(e) {
	postMessage("received message from main : " + e.data);
};



init();


