self.onmessage = function(e) {
	postMessage("received message from main : " + e.data);
};