importScripts('../lib/clipper.js',
			'../lib/Box2d.min.js',
			'../js-utils/gaussrand.js',
			'../js/mechanics.js');

self.onmessage = function(e) {
	postMessage("received message from main : " + e.data);
};

init();


