var world;
var bC;
var waterLevel = -35;


var   b2Vec2 = Box2D.Common.Math.b2Vec2
		, b2Mat22 = Box2D.Common.Math.b2Mat22
        , b2BodyDef = Box2D.Dynamics.b2BodyDef
        , b2Body = Box2D.Dynamics.b2Body
        , b2FixtureDef = Box2D.Dynamics.b2FixtureDef
        , b2Fixture = Box2D.Dynamics.b2Fixture
        , b2World = Box2D.Dynamics.b2World
		, b2WorldManifold = Box2D.Collision.b2WorldManifold
        , b2MassData = Box2D.Collision.Shapes.b2MassData
        , b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape
        , b2CircleShape = Box2D.Collision.Shapes.b2CircleShape
		, b2Shape = Box2D.Collision.Shapes.b2Shape
        , b2DebugDraw = Box2D.Dynamics.b2DebugDraw
	    , b2BuoyancyController = Box2D.Dynamics.Controllers.b2BuoyancyController
          ;


var cpr = new ClipperLib.Clipper();

var SCALE = 100;
var relativeScale = 25/SCALE;	//previously tuned variables for scale=25
var distsqScale=relativeScale*relativeScale;
var forceScale = relativeScale*distsqScale;	//change world by scale - F=ma. mass goes as square of length. accn linear.
var torqueScale = relativeScale*forceScale;	//not sure why - mass goes as square, avg distance from centre goes as linear,
												//so expected power 3. possibly this is what determines steady turn speed, and really
												//should be altering angular damping too.
var thrustForce=15*forceScale;



var initscount=0;

function init(){
	initscount++;
	console.log("init called. " + initscount);
	
    world = new b2World(
            new b2Vec2(0, 10*relativeScale)    //gravity
          , true                 //allow sleep
       );
       
	// Create a buoyancy controller
	bC = new b2BuoyancyController();
	world.AddController(bC);
	bC.normal.Set(0,-1);	// set the surface normal
	bC.offset = waterLevel;	// set the offset from the top of the canvas
	bC.density = 2;			// set the water density
	bC.linearDrag = 5;		// set linear drag
		
	 
    var fixDef = new b2FixtureDef;
    fixDef.density = 1.0;
    fixDef.friction = 0.5;
    fixDef.restitution = 0.2;
     
	fixDef.shape = new b2PolygonShape;
	var bodyDef = new b2BodyDef;
       
	var levelBoxes = [//[0,0,20,2000, b2Body.b2_staticBody],
						 [2000-20,0,20,2000, b2Body.b2_staticBody],
						 [0,2000,2000,20, b2Body.b2_staticBody],
						 
						 [1000,1000,800,100, b2Body.b2_dynamicBody, 1],
						 [-9900,500,800,100, b2Body.b2_dynamicBody, 1],
	   ];
	var currentBox, halfwidth, halfheight, bodyType, thisBody;
	   
	for (bb in levelBoxes){
		currentBox = levelBoxes[bb];
		halfwidth = currentBox[2]/2;
		halfheight = currentBox[3]/2;
   		bodyType= currentBox[4];
		bodyDef.type = bodyType;
		// positions the center of the object (not upper left!)
	    bodyDef.position.x = (currentBox[0]+halfwidth) / SCALE;
        bodyDef.position.y = (currentBox[1]+halfheight) / SCALE;
       
	    fixDef.shape.SetAsBox(halfwidth / SCALE, halfheight / SCALE);
        thisBody = world.CreateBody(bodyDef);
		thisBody.CreateFixture(fixDef);
		   
		if (currentBox[5]){floatingPlatform = thisBody;}
	}
	   
	//make a special polygon object for level. 
	//box2d will have a series of line fixtures.
	//will render using canvas (initially) as a polygon
	//object will be destructible using clipper.js
	   
	var landscapeBodyDef = new b2BodyDef;
	landscapeBodyDef.type = b2Body.b2_staticBody;
	landscapeBodyDef.position.x = 0;
    landscapeBodyDef.position.y =0;
	//TODO create fixtures
	//make some path object suitable for use with jsclipper. attach it to the landscapeBody object
	var landscapeBodyClippablePath = [[{X:50,Y:50},{X:150,Y:50},{X:150,Y:150},{X:50,Y:150}],
                  [{X:60,Y:60},{X:60,Y:140},{X:140,Y:140},{X:140,Y:60}],
				  [{X:-2000,Y:-1000},{X:0,Y:-1000},{X:0,Y:1000},{X:-2000,Y:1000}],
				  [{X:-1020,Y:-50},{X:-1020,Y:50},{X:-980,Y:50},{X:-980,Y:-50}]
				  ];
		
	//add a grid of circular holes to see impact on framerate
	var circleCoords=[];
	for (var ii=0;ii<20;ii++){
		var ang = ii*Math.PI/10;
		circleCoords.push({X:Math.cos(ang),Y:Math.sin(ang)})
	}
	for (var aa=0;aa<40;aa++){
		for (var bb=0;bb<10;bb++){
			var thisCircle =[];
			for (var ii=0;ii<20;ii++){
				thisCircle.push({X:-1000+aa*25+10*circleCoords[ii].X,Y:75+bb*25-10*circleCoords[ii].Y});
			}
			landscapeBodyClippablePath.push(thisCircle);
		}
	}
	//chop out holes for the levelboxes. initially hard code just one
	//[-9900,500,800,100]
	var levBoxCoords=[];
	levBoxCoords.push({X:-9900/5,Y:500/5});
	levBoxCoords.push({X:-9900/5,Y:500/5+100/5});
	levBoxCoords.push({X:-9900/5+800/5,Y:500/5+100/5});
	levBoxCoords.push({X:-9900/5+800/5,Y:500/5});
	landscapeBodyClippablePath.push(levBoxCoords);
		
		
	//add an ellipse, to check the limit on vertices in a polygon shape. seems no real limit here - got up to 2048 ok!
	var num_ellipse_points = 64;
	var ellipse_points = [];
	for (var i = 0; i < num_ellipse_points; i++) {
		var vec = new b2Vec2();
		var ang = 2*Math.PI*i/num_ellipse_points;
		vec.Set(375*Math.cos(ang)/SCALE, 50*Math.sin(ang)/SCALE);
		ellipse_points[i] = vec;
	}
	bodyDef.type = b2Body.b2_staticBody;
	//bodyDef.type = b2Body.b2_dynamicBody;
	fixDef.shape.SetAsArray(ellipse_points, ellipse_points.length);
	bodyDef.position.x = 1250/SCALE;
	bodyDef.position.y = 250/SCALE;
	world.CreateBody(bodyDef).CreateFixture(fixDef);
		
	//add a rock shape
	var rock_points = [];
	var num_rock_points = 8;
	for (var i = 0; i < num_rock_points; i++) {
		var vec = new b2Vec2();
		var ang = 2*Math.PI*i/num_rock_points;
		vec.Set(100*Math.cos(ang)/SCALE, 50*Math.sin(ang)/SCALE);
		rock_points[i] = vec;
	}
	fixDef.shape.SetAsArray(rock_points, rock_points.length);
	bodyDef.type = b2Body.b2_dynamicBody;
	bodyDef.position.x = -5750/SCALE;
	bodyDef.position.y = -5000/SCALE;
	var rockBody = world.CreateBody(bodyDef)
	rockBody.CreateFixture(fixDef);
		
	//chop the rock's shape out of the landscape.
	chopB2VecArrayFromPath(rockBody, rock_points, landscapeBodyClippablePath );
	
	function chopB2VecArrayFromPath(bod, b2arr, path){
		var pos= bod.GetPosition();
		var chopArr =[];
		var b2arrlen = b2arr.length;
		for (var ii=b2arrlen-1;ii>-1;ii--){	//for some reason has to backwards! (else the rock falls out of the hole!)
			//for (var ii=0;ii<b2arrlen;ii++){
			var thisb2 = b2arr[ii];
			chopArr.push({X:(pos.x+thisb2.x)*SCALE/5, Y:(pos.y+thisb2.y)*SCALE/5});
			console.log((pos.x+thisb2.x));
		}
			
		//path.push(chopArr);	//only works if entirely within level
			
		//the below seems to not work in a worker!! possibly some issue with library - apparently some change was made
		//to add ability to use within workers, which suggests that support may be partial.
			
		//this maybe inefficient - can cpr object be reused? is cutting the whole level (before grid chop) super slow?
		cpr.Clear();
		cpr.AddPaths(path, ClipperLib.PolyType.ptSubject, true);  //use the previous solution as input
		cpr.AddPath(chopArr, ClipperLib.PolyType.ptClip, true);
			
		var succeeded = cpr.Execute(ClipperLib.ClipType.ctDifference, path, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
		
		}
		
		ClipperLib.JS.ScaleUpPaths(landscapeBodyClippablePath, 5);
		
		//chop landscape into a grid
		var gridOfPaths = chopIntoGrid(landscapeBodyClippablePath);
		var numBlocks = gridOfPaths.length;
		for (var ii=0;ii<numBlocks;ii++){
			//create a new body
			var thisGridInfo = gridOfPaths[ii];
			var thisBody = world.CreateBody(landscapeBodyDef);
			thisBody.clippablePath = thisGridInfo.paths;
			thisBody.bounds = thisGridInfo.bounds;
			updateLandscapeFixtures(thisBody);
			landscapeBlocks.push(thisBody);
		}
	   	   
	   
		//create some objects
		bodyDef.type = b2Body.b2_dynamicBody;
		for(var i = 0; i < 10; ++i) {
			if(Math.random() > 0.5) {
			fixDef.shape = new b2PolygonShape;
            fixDef.shape.SetAsBox(
                   (Math.random() + 0.1)*(25/SCALE) //half width
                ,  (Math.random() + 0.1)*(25/SCALE) //half height
             );
			} else {
             fixDef.shape = new b2CircleShape(
					(Math.random() + 0.1)*(25/SCALE) //radius
             );
          }
          bodyDef.position.x = (-240 + Math.random() * 20)*(25/SCALE);
          bodyDef.position.y = (-240 + Math.random() * 20)*(25/SCALE);
          world.CreateBody(bodyDef).CreateFixture(fixDef);
        }
	   
	    //add a player triangle object
		var points = [ [-0.5,-0.35], [0.5, -0.35], [0, 0.7]];
		var vecpoints = [];

		for (var i = 0; i < points.length; i++) {
			var vec = new b2Vec2();
			vec.Set(points[i][0]*(25/SCALE), points[i][1]*(25/SCALE));
			vecpoints[i] = vec;
		}
		fixDef.shape = new b2PolygonShape;
		fixDef.shape.SetAsArray(vecpoints, vecpoints.length);
		fixDef.filter.categoryBits=2;
		fixDef.filter.maskBits=11;	//collide with categorys 0,1,3 (11= 1+2+8)
		bodyDef.position.x = -6250/SCALE;
		bodyDef.position.y = -5000/SCALE;
		playerBody = world.CreateBody(bodyDef);
		playerFixture=playerBody.CreateFixture(fixDef);
		playerBody.SetAngularDamping(10);
		playerBody.SetAngle(Math.PI);
		
		var collisionListener = new Box2D.Dynamics.b2ContactListener();
		collisionListener.BeginContact = function(contact){
			//console.log("a collision occured. contact: " + contact + ", impulse: " + impulse);
			var fixa = contact.GetFixtureA();
			var fixb = contact.GetFixtureB();
			destroyIfBomb(fixa.m_body,fixb.m_body);
			destroyIfBomb(fixb.m_body,fixa.m_body);
			
			function destroyIfBomb(body1,body2){
				if (body1.countdown){
					detonateBody(body1);
				}
			}
		}
		collisionListener.EndContact = function(contact){
			var fixa = contact.GetFixtureA();
			var fixb = contact.GetFixtureB();
			deHighlightIfPlayer(fixa.m_body,fixb.m_body);
			deHighlightIfPlayer(fixb.m_body,fixa.m_body);
			function deHighlightIfPlayer(body1,body2){
				if (body1==playerBody){
					body2.color = null;
				}
			}
		}
		world.SetContactListener(collisionListener);

		//add all bodies to buoyancy controller
		for (var b = world.GetBodyList(); b; b = b.GetNext()) {
			bC.AddBody(b);
		}
	   
	   //copyPositions();	//this may not make sense in worker.
}; // init()





function chopIntoGrid(landsPath){
	//input is a set of paths - eg a shape with a hole is 2 paths
	//want to chop it up sensibly. 
	
	//TODO some way to look up blocks via co-ords.
	//initial implementation -can just store bounding box for each block, do trivial check or overlap with each (and if so clip that block), every time cut an explosion circle, or display the screen. expect this (at least for initial 16x16=256 blocks) to be inexpensive. 
	
	//intially - just chop it into 8x8 = 64 blocks
	
	console.log("chopping up landscape into a grid...");
	var outputArray=[];

	//print out information about initial landscape (loops, points)
	
	printPathsInfo(landsPath);
	
	var gridDivs = 8;
	
	//get bounding box of landscape.
	var bounds = ClipperLib.Clipper.GetBounds(landsPath);
	var xstep = (bounds.right-bounds.left)/gridDivs;
	var ystep = (bounds.bottom-bounds.top)/gridDivs;
	var gap=5;	//for illustration. TODO remove
	//chop each block out. 
	//chop into lines first - probably not quite as fast as binary chopping, but unimportant
	
	for (var ii=0;ii<gridDivs;ii++){
		var left = bounds.left + ii*xstep + gap;
		var right = left+xstep - gap;
		var clipPath = [{X:left, Y:bounds.top}, {X:left, Y:bounds.bottom}, {X:right, Y:bounds.bottom}, {X:right, Y:bounds.top}];
		var resultPathStrip=[];

		cpr.Clear();	
		cpr.AddPaths(landsPath, ClipperLib.PolyType.ptSubject, true);
		cpr.AddPath(clipPath, ClipperLib.PolyType.ptClip, true);
		
		var succeeded = cpr.Execute(ClipperLib.ClipType.ctIntersection, resultPathStrip, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
		
		if (resultPathStrip.length>0){
			for (var jj=0;jj<gridDivs;jj++){
				var top = bounds.top + jj*ystep + gap;
				var bottom = top + ystep - gap;
				var clipPath = [{X:left, Y:top}, {X:left, Y:bottom}, {X:right, Y:bottom}, {X:right, Y:top}];
				var resultPath=[];
				
				cpr.Clear();	
				cpr.AddPaths(resultPathStrip, ClipperLib.PolyType.ptSubject, true);
				cpr.AddPath(clipPath, ClipperLib.PolyType.ptClip, true);

				var succeeded = cpr.Execute(ClipperLib.ClipType.ctIntersection, resultPath, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
				if (resultPath.length>0){
					//printPathsInfo(resultPath);
					outputArray.push({
						paths:resultPath,
						bounds:ClipperLib.Clipper.GetBounds(resultPath)	//keep bounding box info on block object.
					});
				}else{
					//console.log("no paths in result!");
				}
			}
		}
		
		
	}
	return outputArray;
}

	
function printPathsInfo(paths){
	var numLoops = paths.length;
	var numPoints;
	if (numLoops==0){
		console.log("no loops to chop up!");
		return;
	}else{
		//console.log("number of loops: " + numLoops);
	}
	var thisLoop;
	var totalPoints=0;
	for (var ii=0;ii<numLoops;ii++){
		thisLoop = paths[ii];
		numPoints = thisLoop.length;
		totalPoints+=numPoints;
		//console.log("a loop with num points =" + numPoints);
	}
	console.log("total points: " + totalPoints);
}