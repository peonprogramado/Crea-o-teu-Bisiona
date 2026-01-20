// by SamuelYAN
// more works //
// https://twitter.com/SamuelAnn0924
// https://www.instagram.com/samuel_yan_1990/

let mySize;

// a shader variable
let theShader;

function preload() {
	theShader = new p5.Shader(this.renderer, vert, frag)
}

function setup() {
	mySize = min(windowWidth, windowHeight) * 1.0;
	// shaders require WEBGL mode to work
	createCanvas(mySize/16*11, mySize, WEBGL);
	// createCanvas(windowWidth, windowHeight, WEBGL);
	noStroke();
}

function draw() {
	// shader() sets the active shader with our shader
	shader(theShader);

	theShader.setUniform("u_resolution", [width, height]);
	theShader.setUniform("u_time", millis() / 1000.0);
	theShader.setUniform("u_frame", frameCount / 1.0);
	theShader.setUniform("u_mouse", [mouseX / 100.0, map(mouseY, 0, height, height, 0) / 100.0]);

	// rect gives us some geometry on the screen
	rect(0, 0, width, height);
}

function windowResized() {
	resizeCanvas(windowWidth, windowHeight);
}

// function keyPressed() {
// 	//noLoop();
// 	saveCanvas("Shaders_0417_2024", "png");
// }

// by SamuelYAN
// more works //
// https://twitter.com/SamuelAnn0924
// https://www.instagram.com/samuel_yan_1990/