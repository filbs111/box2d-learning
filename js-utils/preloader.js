//similar to
//http://www.html5rocks.com/en/tutorials/games/assetmanager/

var assetManager = ( function makeAssetManager(){
	var images = {};
	var assetKeys;
	var numImagesToLoad; 
	var onloadFunc;
	var assetsToPreload;
	return {
		setOnloadFunc: function(func){
			onloadFunc = func;
		},
		setAssetsToPreload: function(assets){
			assetsToPreload = assets;
			assetKeys = Object.keys(assetsToPreload);
			numImagesToLoad = assetKeys.length;
			assetKeys.forEach(function(key){
				images[key] = new Image();
				images[key].onload = function(){
					console.log("predownloaded image with key: " + key);
					numImagesToLoad--;
					if (numImagesToLoad==0){
						console.log("all images were downloaded. will call onloadFunc");
						onloadFunc();
					}
				};
				images[key].src = assets[key];
			});
		},
		asset: images
	};
}());