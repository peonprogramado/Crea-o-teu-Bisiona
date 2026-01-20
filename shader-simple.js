// Shader Whirls - Versión simplificada y robusta
(function(){
  let p5Instance = null;
  let shaderCanvas = null;
  let isReady = false;

  const whirlCount = 12;

  // Vertex shader original
  const vertShader = `
    precision highp float;
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aTexCoord;
    varying vec3 var_vertPos;
    varying vec3 var_vertNormal;
    varying vec2 var_vertTexCoord;
    varying vec4 var_centerGlPosition;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform mat3 uNormalMatrix;
    uniform float u_time;
    void main() {
      vec3 pos = aPosition;
      vec4 posOut = uProjectionMatrix * uModelViewMatrix * vec4(pos, 1.0);
      gl_Position = posOut;
      var_vertPos = pos;
      var_vertNormal = aNormal;
      var_vertTexCoord = aTexCoord;
      var_centerGlPosition = uProjectionMatrix * uModelViewMatrix * vec4(0., 0., 0., 1.0);
    }
  `;

  // Fragment functions originales
  const fragFunctions = `
    float rand(vec2 c){
      return fract(sin(dot(c.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }
    mat2 rotate2d(float _angle){
      return mat2(cos(_angle),-sin(_angle), sin(_angle),cos(_angle));
    }
    mat2 scale2d(vec2 _scale){
      return mat2(_scale.x,0.0, 0.0,_scale.y);
    }
    vec2 tile (vec2 _st, float _zoom) {
      _st *= _zoom;
      return fract(_st);
    }
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
    vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}
    float cnoise(vec3 P){
      vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0);
      Pi0 = mod(Pi0, 289.0); Pi1 = mod(Pi1, 289.0);
      vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
      vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
      vec4 iy = vec4(Pi0.yy, Pi1.yy);
      vec4 iz0 = Pi0.zzzz; vec4 iz1 = Pi1.zzzz;
      vec4 ixy = permute(permute(ix) + iy);
      vec4 ixy0 = permute(ixy + iz0); vec4 ixy1 = permute(ixy + iz1);
      vec4 gx0 = ixy0 / 7.0; vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
      gx0 = fract(gx0); vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
      vec4 sz0 = step(gz0, vec4(0.0));
      gx0 -= sz0 * (step(0.0, gx0) - 0.5); gy0 -= sz0 * (step(0.0, gy0) - 0.5);
      vec4 gx1 = ixy1 / 7.0; vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
      gx1 = fract(gx1); vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
      vec4 sz1 = step(gz1, vec4(0.0));
      gx1 -= sz1 * (step(0.0, gx1) - 0.5); gy1 -= sz1 * (step(0.0, gy1) - 0.5);
      vec3 g000 = vec3(gx0.x,gy0.x,gz0.x); vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
      vec3 g010 = vec3(gx0.z,gy0.z,gz0.z); vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
      vec3 g001 = vec3(gx1.x,gy1.x,gz1.x); vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
      vec3 g011 = vec3(gx1.z,gy1.z,gz1.z); vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
      vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
      g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
      vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
      g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
      float n000 = dot(g000, Pf0); float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
      float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z)); float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
      float n001 = dot(g001, vec3(Pf0.xy, Pf1.z)); float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
      float n011 = dot(g011, vec3(Pf0.x, Pf1.yz)); float n111 = dot(g111, Pf1);
      vec3 fade_xyz = fade(Pf0);
      vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
      vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
      float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
      return 2.2 * n_xyz;
    }
    vec2 random2( vec2 p ) {
      return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
    }
  `;

  // Fragment shader original
  const fragShader = `
    #ifdef GL_ES
    precision highp float;
    #endif
    #define PI 3.141592653589793
    #define TAU 6.283185307179586
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform float u_time;
    uniform sampler2D tex0;
    uniform vec4 whirls[${whirlCount}];
    int whirlCount = ${whirlCount};
    uniform mat3 uNormalMatrix;
    varying vec4 var_centerGlPosition;
    varying vec3 var_vertNormal;
    varying vec2 var_vertTexCoord;
    ${fragFunctions}
    void main(){
      vec2 st = var_vertTexCoord;
      // Distorsiones más suaves (reducidas a la mitad)
      st+=cnoise(vec3(st*1.,u_time/50.))/200.;
      st+=cnoise(vec3(st*2.,u_time/10.))/200.;
      st+=cnoise(vec3(st*5.,u_time/10.))/200.;
      for(float k=0.;k<5.;k+=1.){
        st+= sin(st*k)/2000.;
      }
      st+=cnoise(vec3(st*3.,0.))/200.;
      st.x *=u_resolution.x/u_resolution.y;
      st.y= 1.-st.y;
      for(int i=0;i<${whirlCount};i++){
        vec2 delta = st-whirls[i].xy;
        float d = length(delta);
        float ang = atan(delta.y,delta.x);
        // Distorsiones de whirls originales (más metálicas)
        float dr = (1.-smoothstep(0.,whirls[i].w,d))*(-1.+sin(d*5.+u_time+float(i)))*(0.5+cos(d*40.+u_time+float(i)))/2.;
        d+=sin(dr/2.)/2.;
        ang+=sin(d*5.+ang*(u_mouse.y*10.)*sin(ang))/(u_mouse.x*10.+4.);
        float dAng = (1.-smoothstep(0.,whirls[i].w,d))*( (10.) *whirls[i].z)/2. ;
        ang += sin(dAng/2.)/20.;
        vec2 np = whirls[i].xy + d*vec2(cos(ang),sin(ang));
        st = np;
      }
      st+=cnoise(vec3(st*1.,0.))/2.;
      vec2 f_st = fract(st*1.);
      vec2 i_st = floor(st*1.);
      vec3 color1 = vec3(sin(st.x),sin(st.x*1.1),sin(st.x*1.2));
      vec3 color2 = vec3(st.x/4.+st.y*2.,st.y/2.+sin(st.x/2.),st.x*st.y*3.);
      vec3 color3 = vec3(0.2+1.*cnoise(vec3(st*5.*1.00+0.0,u_time/8.)),
                         0.2+1.*cnoise(vec3(st*5.*1.02+0.02,u_time/8.)),
                         0.25+1.*cnoise(vec3(st*5.*1.04+0.04,u_time/8.)));
      vec3 color4 = vec3(st.x*1.2+sin(st.y)/2.,st.y/2.+sin(st.x)/2.,st.x*st.y/6.);
      vec3 color = mix(color3,color4,0.01) ;
      gl_FragColor= vec4(color,1.0);
    }
  `;

  // Crear instancia p5
  function createShader() {
    const sketch = (p) => {
      let shader, whirls = [], userControl = false;
      
      p.setup = () => {
        const canvas = p.createCanvas(800, 600, p.WEBGL);
        shaderCanvas = canvas.elt;
        shader = p.createShader(vertShader, fragShader);
        p.noStroke();
        p.pixelDensity(1);
        
        // Inicializar whirls como en el original
        let lastP = p.createVector(-5,-5);
        for(var i=0;i<whirlCount;i++){
          let point = p.createVector(p.random(),p.random());
          while(point.dist(lastP)<0.3){
            point = p.createVector(p.random(),p.random());
          }
          whirls.push({
            id: p.random(100000),
            p: point,
            r: p.random(0.1,0.5),
            distortForce: p.random()*p.random(0.,0.2),
          });
          lastP = point;
        }
        
        isReady = true;
      };
      
      p.mouseMoved = () => {
        userControl = true;
      };
      
      p.draw = () => {
        if (!shader) return;
        
        p.shader(shader);
        
        // Control automático del mouse como en el original
        let rr = (0.8+p.sin(p.frameCount/100)*0.3)*p.width/4+p.width/5;
        if (!userControl){
          p.mouseX = p.width/2+p.cos(p.frameCount/400)*rr;
          p.mouseY = p.width/2+p.sin(p.frameCount/200)*rr;
        }
        
        // Preparar datos de whirls
        let arr = whirls.map(b=>([b.p.x,b.p.y,b.distortForce,b.r]));
        let passData = [];
        arr.forEach(a=>passData=passData.concat(a));
        
        // Setear uniformes como en el original
        shader.setUniform('u_resolution',[p.width/1000,p.height/1000]);
        shader.setUniform('u_time',p.millis()/1000);
        shader.setUniform('u_mouse',[p.mouseX/p.width,p.mouseY/p.height]);
        shader.setUniform('whirls',passData);
        
        p.background(0);
        p.rect(-p.width/2, -p.height/2, p.width, p.height);
      };
    };

    // Crear contenedor oculto
    let container = document.getElementById('shader-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shader-container';
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.visibility = 'hidden';
      document.body.appendChild(container);
    }

    p5Instance = new p5(sketch, container);
  }

  // Inicializar cuando p5 esté disponible
  function init() {
    if (typeof p5 !== 'undefined') {
      createShader();
    } else {
      setTimeout(init, 100);
    }
  }

  // Exponer API
  window.shaderWhirls = {
    getCanvas() {
      if (!p5Instance) init();
      return isReady ? shaderCanvas : null;
    },
    isReady() {
      return isReady;
    }
  };

  // Auto-inicializar
  init();
})();
