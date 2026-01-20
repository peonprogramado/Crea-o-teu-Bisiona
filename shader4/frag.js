//By me
// noprotect

const frag = `
	#ifdef GL_ES
	precision mediump float;
	#endif
	
	uniform vec2 u_resolution;
	uniform float u_mouseX;
	uniform float u_mouseY;
	uniform float u_time;
	uniform sampler2D u_tex;
	varying vec2 var_vertTexCoord;
	
	float random (in vec2 st) {
    return fract(sin(dot(st.xy,
                         vec2(12.9898,78.233)))
                 * 43758.5453123);
	}

	
	float noise (in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    // Smooth Interpolation

    // Cubic Hermine Curve.  Same as SmoothStep()
    vec2 u = f*f*(3.0-2.0*f);
    // u = smoothstep(0.,1.,f);

    // Mix 4 coorners percentages
    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
	}

	void main(){
		vec2 coord = var_vertTexCoord.xy / u_resolution.xy;		
		vec2 center = 0.5 - vec2(coord);
		
		float col = noise(center * 5.0 + 
								sin(center.x * 10.0 + u_time * 0.5 + sin(center.y * u_time)) + 
								cos(center.y * 4.0 + u_time * 0.3 + sin(center.x * 2.0 * u_time)) + 
								u_time) * 0.5;
		
		col += noise(center * 10.0 + 
								cos(center.x * 5.0 + u_time * 0.5) + 
								cos(center.y * 3.0 + u_time) + 
								u_time) * 0.7;
								
		col -= random(center - col) * 0.3;
		vec3 color = vec3(col, col, col);

		gl_FragColor = vec4(color.x, color.y, color.z, 1.0);
	}
`



