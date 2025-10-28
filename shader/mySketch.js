//p5.js shader basic structure ref from https://www.openprocessing.org/sketch/920144
let theShader;
let whirls = []
let whirlCount = 12

function preload(){
	theShader = new p5.Shader(this.renderer,vert,frag)
}

let canvas;

function setup() {
	canvas = createCanvas(1112,834,WEBGL);
	noStroke()
	pixelDensity(4)
	background(100);
	fill(0)
	rect(0,0,width,height)
	let lastP = createVector(-5,-5)
	for(var i=0;i<whirlCount;i++){
		let p = createVector(random(),random());
		
		
		//update random position if it's too close to the previous ball
		while(p.dist(lastP)<0.3){
			p = createVector(random(),random())
		}
		whirls.push({
			id: random(100000),
			p: p,
			r: random(0.1,0.5),
			distortForce: random()*random(0.,0.2),
		})
		lastP = p
	}
}
let userControl =false
function mouseMoved(){
userControl=true
}
function draw() {
	shader(theShader)
	let rr = (0.8+sin(frameCount/100)*0.3)*width/4+width/5
	if (!userControl){
		mouseX = width/2+cos(frameCount/400)*rr
		mouseY = width/2+sin(frameCount/200)*rr
	} 
	let arr = whirls.map(b=>([b.p.x,b.p.y,b.distortForce,b.r]))
	let passData = []
	arr.forEach(a=>passData=passData.concat(a))
	
	// whirls.forEach( w=>{
	// 	w.p.x = noise(frameCount/5000,1000,w.id)
	// 	w.p.y = noise(frameCount/5000,w.id,1000)
	// })
	
	// control first whirl with mouse position
	// whirls[1].p.x = mouseX/width
	// whirls[1].p.y = 1-mouseY/height

	theShader.setUniform('u_resolution',[width/1000,height/1000])
	theShader.setUniform('u_time',millis()/1000)
	theShader.setUniform('u_mouse',[mouseX/width,mouseY/height])
	theShader.setUniform('whirls',passData)
	
	background(0)
	// fill(255,0,0)
	rect(-width/2,-height/2,width,height)
	// rotateY(frameCount/500+mouseX/50)
	// sphere(400,50)
	// orbitControl()
	// box(500)
	// rotate(frameCount)
	// box(500)
	// theShader.setUniform('tex0',canvas);
	// ellipse(mouseX, mouseY, 20, 20);
}

function keyPressed(){
	if (key==" "){
		save()
	}
}