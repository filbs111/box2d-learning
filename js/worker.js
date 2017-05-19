importScripts('../lib/Box2d.min.js',
			'../lib/clipper.js',
			'../js-utils/gaussrand.js');

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
		  
		  
self.onmessage = function(e) {
	postMessage("received message from main : " + e.data);
};