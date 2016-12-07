
var canvas;
var ctx;
var drawScale=100;
var drawOffs= {x:0,y:0};

function start(){
	
	canvas = document.getElementById("canvas2d");
    ctx = canvas.getContext("2d");
	ctx.fillStyle= "#AAFFFF";
    ctx.strokeStyle="#000000";

	// Create a concave polygon
	var concavePolygon = [
	  [ -1,   1],
	  [ -1,   0],
	  [  1,   0],
	  [  1,   1],
	  [0.5, 0.5]
	];

	drawOffs= {x:200,y:200};
	drawPolys([concavePolygon]);
	
	// Decompose into convex polygons, using the faster algorithm
	var convexPolygons = decomp.quickDecomp(concavePolygon);

	drawOffs= {x:450,y:200};
	drawPolys(convexPolygons);
	console.log(convexPolygons);
	
	// ==> [  [[1,0],[1,1],[0.5,0.5]],  [[0.5,0.5],[-1,1],[-1,0],[1,0]]  ]
	
	// Decompose using the slow (but optimal) algorithm
	var convexPolygons = decomp.decomp(concavePolygon);

	// ==> [  [[-1,1],[-1,0],[1,0],[0.5,0.5]],  [[1,0],[1,1],[0.5,0.5]]  ]
	drawOffs= {x:700,y:200};
	drawPolys(convexPolygons);
	console.log(convexPolygons);
	
}

function drawPolys(polys){
	//input is an array of polygons. draw each
	for (pp in polys){
		var thisPoly = polys[pp];
		var numVerts = thisPoly.length;
		var thisVert = thisPoly[numVerts-1];
		ctx.moveTo(drawOffs.x+ thisVert[0]*drawScale, drawOffs.y+ thisVert[1]*drawScale);
		for (var vv=0;vv<numVerts;vv++){
			thisVert = thisPoly[vv];
			ctx.lineTo(drawOffs.x+ thisVert[0]*drawScale, drawOffs.y+ thisVert[1]*drawScale);
		}
	    //this will fill a shape
		ctx.fill();
		//this will create the outline of a shape
		ctx.stroke();
	}
}