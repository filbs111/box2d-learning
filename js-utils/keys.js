
var keyThing = (function myKeysStatesThing(){
	var keyStates=[];
	var keydownCallbackFunctions=[];
	
	document.addEventListener("keydown", function(evt){	
		//console.log(evt);
		//console.log("keydown!!!" + evt.keyCode + " " + evt.key + " " + k);
		evt.preventDefault();
		//var k = evt.keyCode;
		var k = (evt.keyCode==0)?evt.key:evt.keyCode;	//to handle edge wierdness with dispatched events
		//console.log(k);
		keyStates[k]=true;
		if (keydownCallbackFunctions[k]){keydownCallbackFunctions[k]();}
	});
	document.addEventListener("keyup", function(evt){
		//var k = evt.keyCode;
		var k = (evt.keyCode==0)?evt.key:evt.keyCode;
		evt.preventDefault();
		keyStates[k]=false;
	});

	//all keys switch off when lose focus - effectively this is releasing keys
	document.onblur = function(){
		console.log("detected lost focus. setting all keystates to false");
		Object.keys(keyStates).forEach(function(ii){
			console.log("setting key off : " + ii);
			keyStates[ii]=false;
		})
	}
	window.oncontextmenu = window.onblur;
	
	return {
		keystate: function(e){ return keyStates[e]?1:0;},
		spaceKey: function(){ return keyStates[32]?1:0;},
		returnKey: function(){ return keyStates[13]?1:0;},
		leftKey: function(){ return keyStates[37]?1:0;},
		rightKey: function(){ return keyStates[39]?1:0;},
		upKey: function(){ return keyStates[38]?1:0;},
		downKey: function(){ return keyStates[40]?1:0;},
		//bombKey: function(){ return this.downKey();}, 
		bombKey: function(){ return keyStates[17]?1:0;}, 	//controlkey
		setKeydownCallback: function(e,f) {keydownCallbackFunctions[e] = f;}
	};
})();

//setInterval(function(){triggerKeyboardEvent(document, 32)}, 500); //send fake events. this fails to remedy key stuck on problem in ms edge

//https://stackoverflow.com/questions/961532/firing-a-keyboard-event-in-javascript
function triggerKeyboardEvent(el, keyCode){
	var event = new KeyboardEvent("keydown", { key: keyCode });
	el.dispatchEvent(event); 
}