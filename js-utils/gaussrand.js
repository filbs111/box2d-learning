var gaussRand = (function(){
	var sqrtNumTimes = 2;
	var numTimes = sqrtNumTimes*sqrtNumTimes;
	var randoms = new Array();
	var nextIdx =0;
	for (var jj=0;jj<256;jj++){
		var total = -numTimes/2;
		for (var ii=0;ii<numTimes;ii++){
			total+=Math.random();
		}
		randoms.push(total/sqrtNumTimes);
	}	
	return function(){
			nextIdx = (nextIdx+1)&0xff;
			return randoms[nextIdx];
		};
}());