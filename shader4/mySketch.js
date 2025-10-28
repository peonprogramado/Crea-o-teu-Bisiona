//Fork basic sjadder structure from https://openprocessing.org/sketch/923286
//p5.js shader basic structure ref from https://www.openprocessing.org/sketch/920144
//Learn tutorial from https://www.youtube.com/watch?v=EO2ax570wKo&list=PL4neAtv21WOmIrTrkNO3xCyrxg4LKkrF7&index=24

let theShader;
let sourceGraphics,shaderGraphics;
var sizeMin;
var boolTrigger;

function preload(){
	theShader = new p5.Shader(this.renderer,vert,frag)
}

function setup() {
	sizeMin = min(innerHeight, innerWidth)
	createCanvas(sizeMin,sizeMin);
	sourceGraphics= createGraphics(width,height)
	shaderGraphics = createGraphics(width,height,WEBGL)
	sourceGraphics.background(0) 
}

function draw() {
	sourceGraphics.background(0, 255)
	
	shaderGraphics.shader(theShader)
	theShader.setUniform('u_resolution',[width/sizeMin,height/sizeMin])
	theShader.setUniform('u_time',millis()*0.001)
	theShader.setUniform('u_tex',sourceGraphics)
	theShader.setUniform('u_mouseX',mouseX)
	theShader.setUniform('u_mouseY',mouseY)
	
	shaderGraphics.rect(-width/2,-height/2,width,height)
	image(sourceGraphics,0,0)
	image(shaderGraphics,0,0)
	}