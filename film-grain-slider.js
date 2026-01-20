/**
 * Film Grain Slider Component
 * Generates animated film grain effect as SVG patterns for use as fills
 */
class FilmGrainSlider {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      width: options.width || 800,
      height: options.height || 600,
      grainIntensity: options.grainIntensity || 50,
      animationSpeed: options.animationSpeed || 1,
      baseColor: options.baseColor || '#ffffff',
      grainColor: options.grainColor || '#000000',
      patternSize: options.patternSize || 100,
      ...options
    };
    
    this.animationId = null;
    this.startTime = Date.now();
    this.svg = null;
    this.defs = null;
    this.pattern = null;
    this.noiseData = [];
    
    this.init();
  }
  
  init() {
    this.createSVG();
    this.createControls();
    this.generateNoiseData();
    this.createPattern();
    this.startAnimation();
  }
  
  createSVG() {
    // Create main SVG container
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', this.options.width);
    this.svg.setAttribute('height', this.options.height);
    this.svg.setAttribute('viewBox', `0 0 ${this.options.width} ${this.options.height}`);
    this.svg.style.border = '1px solid #333';
    this.svg.style.borderRadius = '8px';
    
    // Create defs for patterns
    this.defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    this.svg.appendChild(this.defs);
    
    // Create background rectangle that will use the pattern
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('fill', 'url(#filmGrainPattern)');
    this.svg.appendChild(bgRect);
    
    this.container.appendChild(this.svg);
  }
  
  createControls() {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'film-grain-controls';
    controlsDiv.style.cssText = `
      margin-top: 20px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      padding: 20px;
      background: #1a1a1a;
      border-radius: 8px;
      color: white;
    `;
    
    // Grain Intensity Control
    const intensityControl = this.createSliderControl(
      'Intensidad del Grano',
      'grainIntensity',
      0, 100, this.options.grainIntensity,
      (value) => {
        this.options.grainIntensity = value;
        this.updatePattern();
      }
    );
    
    // Animation Speed Control
    const speedControl = this.createSliderControl(
      'Velocidad de Animación',
      'animationSpeed',
      0, 5, this.options.animationSpeed,
      (value) => {
        this.options.animationSpeed = value;
      }
    );
    
    // Pattern Size Control
    const sizeControl = this.createSliderControl(
      'Tamaño del Patrón',
      'patternSize',
      20, 200, this.options.patternSize,
      (value) => {
        this.options.patternSize = value;
        this.updatePattern();
      }
    );
    
    // Grain Density Control
    const densityControl = this.createSliderControl(
      'Densidad del Grano',
      'grainDensity',
      1, 10, 3,
      (value) => {
        this.options.grainDensity = value;
        this.generateNoiseData();
        this.updatePattern();
      }
    );
    
    controlsDiv.appendChild(intensityControl);
    controlsDiv.appendChild(speedControl);
    controlsDiv.appendChild(sizeControl);
    controlsDiv.appendChild(densityControl);
    
    this.container.appendChild(controlsDiv);
  }
  
  createSliderControl(label, id, min, max, value, onChange) {
    const controlDiv = document.createElement('div');
    controlDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-weight: bold; font-size: 14px;';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = id;
    slider.min = min;
    slider.max = max;
    slider.value = value;
    slider.style.cssText = `
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: #333;
      outline: none;
      -webkit-appearance: none;
    `;
    
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = value;
    valueDisplay.style.cssText = 'font-size: 12px; color: #ccc; text-align: center;';
    
    slider.addEventListener('input', (e) => {
      const newValue = parseFloat(e.target.value);
      valueDisplay.textContent = newValue;
      onChange(newValue);
    });
    
    controlDiv.appendChild(labelEl);
    controlDiv.appendChild(slider);
    controlDiv.appendChild(valueDisplay);
    
    return controlDiv;
  }
  
  // Generate noise data for film grain effect
  generateNoiseData() {
    const density = this.options.grainDensity || 3;
    const gridSize = Math.ceil(this.options.patternSize / (10 / density));
    this.noiseData = [];
    
    for (let i = 0; i < gridSize * gridSize; i++) {
      this.noiseData.push({
        x: Math.random(),
        y: Math.random(),
        intensity: Math.random(),
        size: Math.random() * 2 + 0.5,
        phase: Math.random() * Math.PI * 2
      });
    }
  }
  
  // Create SVG pattern with film grain effect
  createPattern() {
    // Remove existing pattern if any
    const existingPattern = this.defs.querySelector('#filmGrainPattern');
    if (existingPattern) {
      existingPattern.remove();
    }
    
    // Create new pattern
    this.pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    this.pattern.setAttribute('id', 'filmGrainPattern');
    this.pattern.setAttribute('x', '0');
    this.pattern.setAttribute('y', '0');
    this.pattern.setAttribute('width', this.options.patternSize);
    this.pattern.setAttribute('height', this.options.patternSize);
    this.pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    
    // Base background
    const baseRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    baseRect.setAttribute('width', this.options.patternSize);
    baseRect.setAttribute('height', this.options.patternSize);
    baseRect.setAttribute('fill', this.options.baseColor);
    this.pattern.appendChild(baseRect);
    
    // Add film grain noise
    this.updateGrainElements();
    
    this.defs.appendChild(this.pattern);
  }
  
  updateGrainElements() {
    // Clear existing grain elements
    const grainElements = this.pattern.querySelectorAll('.grain-element');
    grainElements.forEach(el => el.remove());
    
    const time = (Date.now() - this.startTime) * 0.001 * this.options.animationSpeed;
    const intensity = this.options.grainIntensity / 100;
    
    this.noiseData.forEach((grain, index) => {
      // Animated position with time offset
      const animatedX = (grain.x + Math.sin(time + grain.phase) * 0.1) * this.options.patternSize;
      const animatedY = (grain.y + Math.cos(time * 0.7 + grain.phase) * 0.1) * this.options.patternSize;
      
      // Animated intensity
      const animatedIntensity = grain.intensity * intensity * 
        (0.5 + 0.5 * Math.sin(time * 2 + grain.phase));
      
      // Create grain element (circle for organic look)
      const grainEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      grainEl.setAttribute('class', 'grain-element');
      grainEl.setAttribute('cx', animatedX);
      grainEl.setAttribute('cy', animatedY);
      grainEl.setAttribute('r', grain.size);
      grainEl.setAttribute('fill', this.options.grainColor);
      grainEl.setAttribute('opacity', animatedIntensity);
      
      this.pattern.appendChild(grainEl);
    });
    
    // Add some larger, slower moving elements for depth
    for (let i = 0; i < 5; i++) {
      const largeGrain = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      largeGrain.setAttribute('class', 'grain-element');
      largeGrain.setAttribute('cx', Math.sin(time * 0.3 + i) * this.options.patternSize * 0.3 + this.options.patternSize * 0.5);
      largeGrain.setAttribute('cy', Math.cos(time * 0.2 + i) * this.options.patternSize * 0.3 + this.options.patternSize * 0.5);
      largeGrain.setAttribute('rx', 3 + Math.sin(time + i) * 2);
      largeGrain.setAttribute('ry', 2 + Math.cos(time * 1.1 + i) * 1.5);
      largeGrain.setAttribute('fill', this.options.grainColor);
      largeGrain.setAttribute('opacity', intensity * 0.3);
      
      this.pattern.appendChild(largeGrain);
    }
  }
  
  updatePattern() {
    this.generateNoiseData();
    this.createPattern();
  }
  
  startAnimation() {
    const animate = () => {
      this.updateGrainElements();
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }
  
  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  // Method to get the pattern URL for use in other SVG elements
  getPatternUrl() {
    return 'url(#filmGrainPattern)';
  }
  
  // Method to apply the pattern to any SVG element
  applyToElement(element) {
    element.setAttribute('fill', this.getPatternUrl());
  }
  
  destroy() {
    this.stopAnimation();
    if (this.container && this.svg) {
      this.container.removeChild(this.svg);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FilmGrainSlider;
}
