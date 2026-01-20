let t = 0;

function setup() {
  createCanvas(800, 800);
  noStroke();
  colorMode(HSB, 360, 100, 100, 100);
  background(0);
}

function draw() {
  let xoff = 0;
  for (let x = 0; x < width; x += 10) {
    let yoff = 0;
    for (let y = 0; y < height; y += 10) {
      let r = map(noise(xoff, yoff, t), 0, 1, 0, 360);
      let g = map(noise(xoff + 1000, yoff + 2000, t), 0, 1, 0, 100);
      let b = map(noise(xoff + 3000, yoff + 5000, t), 0, 1, 0, 100);
      let a = map(noise(xoff + 5000, yoff + 7000, t), 0, 1, 0, 100);
      
      fill(r, g, b, a);
      ellipse(x, y, 10, 10);
      
      yoff += 0.1;
    }
    xoff += 0.1;
  }
  
  t += 0.01;
  
  if (frameCount % 200 == 0) {
    saveCanvas('generative_artwork', 'png');
  }
}
