let myShader;
let t = 0;
let w = 150;

function preload() {
	myShader = new p5.Shader(this.renderer, vertSrc, fragSrc);
}

function setup() {
	createCanvas(750, 500, WEBGL);
	pixelDensity(1);
	background(0);
	noStroke();
}

function draw() {
	t += 0.01;
	if (myShader) {
		shader(myShader);
		myShader.setUniform("iResolution", [width, height]);
		myShader.setUniform("uTime", t);
		myShader.setUniform("uGridSize", w);
		myShader.setUniform("uScale", 0.5);
		beginShape(TRIANGLES);
		vertex(-1, -1, 0);
		vertex(1, -1, 0);
		vertex(1, 1, 0);
		vertex(-1, -1, 0);
		vertex(1, 1, 0);
		vertex(-1, 1, 0);
		endShape();
	}
}

const vertSrc = `
#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif
attribute vec3 aPosition;
varying vec2 vTexCoord;
void main() {
  vTexCoord = (aPosition.xy + 1.0) * 0.5;
  gl_Position = vec4(aPosition, 1.0);
}
`;

const fragSrc = `
#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif
uniform vec2 iResolution;
uniform float uTime;
uniform float uGridSize;
uniform float uScale;
varying vec2 vTexCoord;
float Bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
#define Bayer4(a)   (Bayer2(0.5*(a)) * 0.25 + Bayer2(a))
#define Bayer8(a)   (Bayer4(0.5*(a)) * 0.25 + Bayer2(a))
#define Bayer16(a)  (Bayer8(0.5*(a)) * 0.25 + Bayer2(a))
#define Bayer32(a)  (Bayer16(0.5*(a)) * 0.25 + Bayer2(a))
#define Bayer64(a)  (Bayer32(0.5*(a)) * 0.25 + Bayer2(a))
float f(float n) {
  return pow(sin(n), 2.0) * uGridSize;
}

void main() {
  vec2 uv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);
  vec2 fragCoord = uv * iResolution;
  vec2 pos = uv * uGridSize;
  float x = pos.y; // Match original i / w (y-coordinate)
  float y = pos.x; // Match original i % w (x-coordinate)
  float a = 3.0;
  float timeFactor0 = f(0.0 + sin(uTime / 4.0));
  float timeFactor1 = f(1.0 + sin(uTime / 4.0));
  float timeFactor2 = f(2.0 + sin(uTime / 4.0));
  a += sin(2.0 * atan((x - 0.0 * 9.0 - 62.0) / (y - 0.0 * 9.0 - timeFactor0 + 0.0001)));
  a += sin(2.0 * atan((y - 1.0 * 9.0 - 62.0) / (y - 1.0 * 9.0 - timeFactor1 + 0.0001)));
  a += sin(2.0 * atan((x - 2.0 * 9.0 - 62.0) / (x - 2.0 * 9.0 - timeFactor2 + 0.0001)));
  float p = f(a - uTime) / 3.0;
  vec3 col = vec3(p * 3.0 / uGridSize); 
  float m = Bayer32(fragCoord * uScale);
  vec3 d = step(vec3(m), col);
  gl_FragColor = vec4(d, 1.0);
}
`;