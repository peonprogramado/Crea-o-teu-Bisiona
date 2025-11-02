const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const densityInput = document.getElementById('density');
const metallicInput = document.getElementById('metallic');
const linesInput = document.getElementById('lines');
const outlineInput = document.getElementById('outline');
const watercolorInput = document.getElementById('watercolor');
const filmgrainInput = document.getElementById('filmgrain');

let svgPath = null;
let viewBox = { x: 0, y: 0, w: 831.77, h: 1096.26 };
let lastDesired = 1;
const anim = { active: false, start: 0, dur: 90 };
let mouse = { x: 0, y: 0 };
let isAnimating = false;
let pointCache = new Map(); // Cache para valores estables de puntos
let animationTime = 0; // Tiempo para animación del chrome
let currentColor = '#000000'; // Color actual del SVG (negro por defecto)

// Variables para los logos PNG
let logoBlack = null; // Para fondo blanco
let logoWhite = null; // Para fondo negro

// Sistema de acuarela con acumulación
let watercolorCanvas = null;
let watercolorCtx = null;
let watercolorBrushes = [];
let lastWatercolorIntensity = 0;

// Sistema de grano de película
let filmGrainCanvas = null;
let filmGrainCtx = null;
let filmGrainPattern = null;
let filmGrainSlider = null;
let lastFilmGrainIntensity = 0;

// Sistema de shader especial (shader4)
let specialShader = null;
let shaderCanvas = null;
let shaderGraphics = null;
let isShaderReady = false;


function getEdgeProximity(x, y, ctx, scale, tx, ty) {
  // Detectar proximidad al borde con mayor precisión para curvas
  const sampleRadius = 3; // Aumentar radio de muestreo
  const samples = 16; // Más muestras para mejor precisión en curvas
  let insideCount = 0;
  let edgeDistance = 0;

  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const sampleX = ((x + Math.cos(angle) * sampleRadius) - tx) / scale;
    const sampleY = ((y + Math.sin(angle) * sampleRadius) - ty) / scale;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const inside = ctx.isPointInPath(svgPath, sampleX, sampleY);
    ctx.restore();

    if (inside) {
      insideCount++;
    } else {
      // Calcular distancia aproximada al borde
      edgeDistance += sampleRadius;
    }
  }

  const proximityRatio = insideCount / samples;

  // Ajuste más agresivo para bordes y curvas
  if (proximityRatio < 0.8) {
    return Math.max(0.2, proximityRatio * 0.6); // Reducir más los puntos cerca del borde
  }

  return proximityRatio;
} // 0 = cerca del borde, 1 = centro

function getDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function getStablePointData(x, y, ctx, scale, tx, ty, dotRadius) {
  const key = `${x}_${y}_${dotRadius}`;

  if (!pointCache.has(key)) {
    // Calcular valores una sola vez y cachearlos
    const edgeProximity = getEdgeProximity(x, y, ctx, scale, tx, ty);
    const edgeFactor = Math.max(0.4, edgeProximity);
    const adjustedRadius = dotRadius * edgeFactor;
    const variation = 0.9 + Math.random() * 0.2;

    pointCache.set(key, {
      adjustedRadius,
      variation
    });
  }

  return pointCache.get(key);
}

function getHoverScale(pointX, pointY) {
  const distance = getDistance(pointX, pointY, mouse.x, mouse.y);
  const maxDistance = 120; // Radio de influencia del hover aumentado

  if (distance > maxDistance) return 1;

  // Escala de 1 a 2.5 basada en proximidad
  const scale = distance / maxDistance;
  return 1 + (1.5 * (1 - scale));
}

function createMetallicGradient(ctx, x, y, radius, intensity, time = 0) {
  if (intensity === 0) return '#000'; // Sin efecto metálico

  // Gradiente diagonal simple pero efectivo
  const angle = Math.PI / 4; // 45 grados
  const gradient = ctx.createLinearGradient(
    x - radius * Math.cos(angle), y - radius * Math.sin(angle),
    x + radius * Math.cos(angle), y + radius * Math.sin(angle)
  );

  // Intensidad del efecto metálico (0-100)
  const alpha = intensity / 100;

  // Animación suave del desplazamiento
  const offset = (time * 0.0008) % 1; // Muy lento

  // Colores chrome simples pero efectivos
  const chromeColors = [
    { pos: 0, chrome: '#ffffff', black: '#000000' },
    { pos: 0.2, chrome: '#e0e0e0', black: '#1a1a1a' },
    { pos: 0.4, chrome: '#c0c0c0', black: '#333333' },
    { pos: 0.6, chrome: '#f0f0f0', black: '#000000' },
    { pos: 0.8, chrome: '#d0d0d0', black: '#2a2a2a' },
    { pos: 1, chrome: '#b0b0b0', black: '#000000' }
  ];

  chromeColors.forEach(color => {
    // Interpolar entre color chrome y negro basado en intensidad
    const r1 = parseInt(color.chrome.slice(1, 3), 16);
    const g1 = parseInt(color.chrome.slice(3, 5), 16);
    const b1 = parseInt(color.chrome.slice(5, 7), 16);
    const r2 = parseInt(color.black.slice(1, 3), 16);
    const g2 = parseInt(color.black.slice(3, 5), 16);
    const b2 = parseInt(color.black.slice(5, 7), 16);

    const r = Math.round(r2 + (r1 - r2) * alpha);
    const g = Math.round(g2 + (g1 - g2) * alpha);
    const b = Math.round(b2 + (b1 - b2) * alpha);

    // Posición animada
    const animatedPos = (color.pos + offset) % 1;
    gradient.addColorStop(animatedPos, `rgb(${r}, ${g}, ${b})`);
  });

  return gradient;
}

// Clase Brush exacta del código original
class WatercolorBrush {
  constructor() {
    this.angle = Math.random() * Math.PI * 2;
    // Generar posiciones en coordenadas del SVG (sin transformar)
    this.x = Math.random() * viewBox.w + viewBox.x;
    this.y = Math.random() * viewBox.h + viewBox.y;

    // Guardar límites del SVG para rebotes
    this.minX = viewBox.x;
    this.maxX = viewBox.x + viewBox.w;
    this.minY = viewBox.y;
    this.maxY = viewBox.y + viewBox.h;

    // Colores según el color actual del SVG
    let r, g, b;
    if (currentColor === '#2B43FF') {
      // Para SVG azul: negro y algunos tonos de gris
      const grayValue = Math.random() * 80 + 5; // 5-85 (negro profundo a gris medio)
      r = grayValue;
      g = grayValue;
      b = grayValue;
    } else {
      // Tonos azules para otros colores (original)
      r = Math.random() * 90 + 10;    // 10-100
      g = Math.random() * 120 + 30;   // 30-150  
      b = Math.random() * 75 + 180;   // 180-255
    }
    this.clr = { r: Math.floor(r), g: Math.floor(g), b: Math.floor(b), a: 5 };

    this.components = [];
    for (let i = 0; i < 2; i++) {
      this.components[i] = Math.floor(Math.random() * 4) + 1; // 1-5
    }
  }

  paint() {
    let a = 0;
    let r = 0;
    let x1 = this.x;
    let y1 = this.y;
    let u = Math.random() * 0.5 + 0.5; // 0.5-1

    watercolorCtx.save();
    watercolorCtx.globalAlpha = this.clr.a / 255;
    watercolorCtx.fillStyle = `rgb(${this.clr.r}, ${this.clr.g}, ${this.clr.b})`;

    watercolorCtx.beginPath();
    let isFirst = true;

    while (a < Math.PI * 2) {
      if (isFirst) {
        watercolorCtx.moveTo(x1, y1);
        isFirst = false;
      } else {
        watercolorCtx.lineTo(x1, y1);
      }

      let v = Math.random() * 0.15 + 0.85; // 0.85-1
      x1 = this.x + r * Math.cos(this.angle + a) * u * v;
      y1 = this.y + r * Math.sin(this.angle + a) * u * v;
      a += Math.PI / 180;

      for (let i = 0; i < 2; i++) {
        r += Math.sin(a * this.components[i]);
      }
    }

    watercolorCtx.closePath();
    watercolorCtx.fill();
    watercolorCtx.restore();

    // Movimiento exacto del original con límites transformados
    if (this.x < this.minX || this.x > this.maxX ||
      this.y < this.minY || this.y > this.maxY) {
      this.angle += Math.PI / 2;
    }

    this.x += 2 * Math.cos(this.angle);
    this.y += 2 * Math.sin(this.angle);
    this.angle += (Math.random() - 0.5) * 0.3; // -0.15 a +0.15
  }
}

// Inicializar sistema de acuarela
function initWatercolor() {
  if (!watercolorCanvas) {
    watercolorCanvas = document.createElement('canvas');
    watercolorCtx = watercolorCanvas.getContext('2d');
  }

  // Ajustar tamaño al canvas principal
  const dpr = window.devicePixelRatio || 1;
  watercolorCanvas.width = canvas.width;
  watercolorCanvas.height = canvas.height;

  // Fondo transparente
  watercolorCtx.clearRect(0, 0, watercolorCanvas.width, watercolorCanvas.height);
}

// Función principal de watercolor con acumulación
function drawWatercolor(ctx, intensity, time, scale, tx, ty) {
  if (intensity <= 0) {
    // Limpiar si se desactiva
    if (lastWatercolorIntensity > 0) {
      watercolorBrushes = [];
      if (watercolorCtx) {
        watercolorCtx.clearRect(0, 0, watercolorCanvas.width, watercolorCanvas.height);
      }
    }
    lastWatercolorIntensity = intensity;
    return;
  }

  // Inicializar si es necesario
  if (!watercolorCanvas) {
    initWatercolor();
  }

  // Crear pinceles si cambia la intensidad o no hay suficientes
  const targetBrushCount = Math.floor((intensity / 100) * 40) + 10; // 10-50

  if (watercolorBrushes.length !== targetBrushCount || lastWatercolorIntensity !== intensity) {
    watercolorBrushes = [];
    for (let i = 0; i < targetBrushCount; i++) {
      watercolorBrushes.push(new WatercolorBrush());
    }
    // Limpiar canvas para empezar fresh
    watercolorCtx.clearRect(0, 0, watercolorCanvas.width, watercolorCanvas.height);
  }

  // Configurar transformaciones en el canvas watercolor
  watercolorCtx.save();
  watercolorCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
  const dpr = window.devicePixelRatio || 1;
  watercolorCtx.scale(dpr, dpr);
  watercolorCtx.translate(tx, ty);
  watercolorCtx.scale(scale, scale);

  // Pintar con todos los pinceles (acumulación)
  for (let brush of watercolorBrushes) {
    brush.paint();
  }

  watercolorCtx.restore();

  // Dibujar el canvas acumulado en el contexto principal (sin transformaciones adicionales)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform para dibujar directo
  ctx.globalAlpha = Math.min(intensity / 100, 1);
  ctx.drawImage(watercolorCanvas, 0, 0);
  ctx.restore();

  lastWatercolorIntensity = intensity;
}

// Función para crear efecto de grano de película
function drawFilmGrain(ctx, intensity, time, scale, tx, ty) {
  if (intensity <= 0) return;

  const dpr = window.devicePixelRatio || 1;

  // Parámetros del grano
  const grainIntensity = intensity / 100;
  const animTime = time * 0.001;

  // Número de partículas ultra-optimizado
  const particleCount = Math.floor(intensity * 6);
  const largeParticleCount = Math.floor(intensity * 1.5);
  const mediumParticleCount = Math.floor(intensity * 2);
  const dustParticleCount = Math.floor(intensity * 2); // Mínimo necesario

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  // Clip al área del SVG
  ctx.clip(svgPath);

  // Determinar colores del grano basados en la gama cromática del SVG
  let baseGrainColor, blendMode;

  // Función para convertir hex a RGB
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  const svgRgb = hexToRgb(currentColor);

  if (currentColor === '#ffffff') {
    // SVG blanco -> grano en tonos grises oscuros
    baseGrainColor = { r: 40, g: 40, b: 40 };
    blendMode = 'multiply';
  } else if (currentColor === '#000000') {
    // SVG negro -> grano en tonos grises claros
    baseGrainColor = { r: 200, g: 200, b: 200 };
    blendMode = 'screen';
  } else if (currentColor === '#2B43FF') {
    // SVG azul -> grano muy contrastante en tonos claros y cálidos
    baseGrainColor = { r: 255, g: 240, b: 180 }; // Tonos cálidos que contrastan con azul
    blendMode = 'screen';
  } else {
    // Otros colores -> detectar si es azulado para mayor contraste
    const isBlueish = svgRgb.b > svgRgb.r && svgRgb.b > svgRgb.g;
    const brightness = (svgRgb.r + svgRgb.g + svgRgb.b) / 3;

    if (isBlueish) {
      // Colores azulados -> grano cálido muy contrastante
      baseGrainColor = {
        r: 255,
        g: Math.min(255, 200 + (255 - svgRgb.b) * 0.5),
        b: Math.max(100, 255 - svgRgb.b)
      };
      blendMode = 'screen';
    } else if (brightness > 128) {
      // Color claro -> grano más oscuro de la misma gama
      baseGrainColor = {
        r: Math.max(0, svgRgb.r - 100),
        g: Math.max(0, svgRgb.g - 100),
        b: Math.max(0, svgRgb.b - 100)
      };
      blendMode = 'multiply';
    } else {
      // Color oscuro -> grano más claro de la misma gama
      baseGrainColor = {
        r: Math.min(255, svgRgb.r + 120),
        g: Math.min(255, svgRgb.g + 120),
        b: Math.min(255, svgRgb.b + 120)
      };
      blendMode = 'screen';
    }
  }

  ctx.globalCompositeOperation = blendMode;

  // Efectos de película antigua ultra-simplificados
  const sinTime = Math.sin(animTime * 4);
  const cosTime = Math.cos(animTime * 3);

  const filmFlicker = 0.8 + 0.2 * sinTime; // Parpadeo simplificado
  const frameJitter = cosTime * 0.3; // Vibración mínima

  // Precalcular valores básicos
  const baseTime = animTime * 4;
  const baseTime2 = animTime * 3;

  // Generar partículas pequeñas con batching ultra-optimizado
  ctx.globalCompositeOperation = blendMode;

  // Precalcular colores base para evitar cálculos repetidos
  const baseR = baseGrainColor.r;
  const baseG = baseGrainColor.g;
  const baseB = baseGrainColor.b;
  const isColoredSVG = currentColor !== '#ffffff' && currentColor !== '#000000';
  const isBlueSVG = currentColor === '#2B43FF' || (svgRgb && svgRgb.b > svgRgb.r && svgRgb.b > svgRgb.g);

  // Multiplicador de intensidad para SVG azul
  const blueIntensityBoost = isBlueSVG ? 1.8 : 1.0;

  for (let i = 0; i < particleCount; i++) {
    // Posición y animación ultra-simplificada
    const iOffset = i * 0.1;
    const x = viewBox.x + Math.random() * viewBox.w + Math.sin(baseTime + iOffset) * 2;
    const y = viewBox.y + Math.random() * viewBox.h + Math.cos(baseTime2 + iOffset) * 2;

    // Propiedades con boost para azul
    const baseSize = 0.5 + Math.random() * (isBlueSVG ? 1.5 : 1);
    const size = getMobileGrainSize(baseSize); // Aplicar ajuste móvil
    const opacity = Math.random() * grainIntensity * filmFlicker * 0.8 * blueIntensityBoost;

    // Color con mayor variación para SVG azul
    const colorVarRange = isBlueSVG ? 80 : 40;
    const colorVar = (Math.random() - 0.5) * colorVarRange;
    let r = baseR + colorVar;
    let g = baseG + colorVar;
    let b = baseB + colorVar;

    // Variaciones adicionales para SVG azul (tonos cálidos contrastantes)
    if (isBlueSVG) {
      const warmBoost = Math.random() * 60;
      r = Math.min(255, r + warmBoost); // Más rojo
      g = Math.min(255, g + warmBoost * 0.7); // Algo de amarillo
      b = Math.max(50, b - warmBoost * 0.3); // Menos azul
    }

    // Clamp rápido sin Math.max/min
    r = r < 0 ? 0 : r > 255 ? 255 : r;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    b = b < 0 ? 0 : b > 255 ? 255 : b;

    ctx.globalAlpha = opacity;
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; // Bitwise OR para enteros rápidos

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Generar partículas grandes y medianas juntas (ultra-optimizado)
  const totalLargeMed = largeParticleCount + mediumParticleCount;
  for (let i = 0; i < totalLargeMed; i++) {
    const isLarge = i < largeParticleCount;
    const timeOffset = isLarge ? animTime * 2.5 : animTime * 3;

    const x = viewBox.x + Math.random() * viewBox.w + Math.sin(timeOffset + i) * (isLarge ? 3 : 2);
    const y = viewBox.y + Math.random() * viewBox.h + Math.cos(timeOffset + i) * (isLarge ? 3 : 2);

    const baseSize = isLarge ? 2 + Math.random() * (isBlueSVG ? 3 : 2) : 1 + Math.random() * (isBlueSVG ? 1.5 : 1);
    const size = getMobileGrainSize(baseSize); // Aplicar ajuste móvil
    const opacity = Math.random() * grainIntensity * filmFlicker * 0.7 * blueIntensityBoost;

    // Color con boost para azul
    const colorVarRange = isBlueSVG ? 100 : 50;
    const colorVar = (Math.random() - 0.5) * colorVarRange;
    let r = baseR + colorVar;
    let g = baseG + colorVar;
    let b = baseB + colorVar;

    // Variaciones cálidas para SVG azul
    if (isBlueSVG) {
      const warmBoost = Math.random() * (isLarge ? 80 : 60);
      r = Math.min(255, r + warmBoost);
      g = Math.min(255, g + warmBoost * 0.8);
      b = Math.max(30, b - warmBoost * 0.4);
    }

    // Clamp rápido
    r = r < 0 ? 0 : r > 255 ? 255 : r;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    b = b < 0 ? 0 : b > 255 ? 255 : b;

    ctx.globalAlpha = opacity;
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Generar partículas de polvo con boost para azul
  if (dustParticleCount > 0) {
    const dustTime = animTime * 6;
    for (let i = 0; i < dustParticleCount; i++) {
      const x = viewBox.x + Math.random() * viewBox.w + Math.sin(dustTime + i) * 2;
      const y = viewBox.y + Math.random() * viewBox.h;

      const dustOpacity = Math.random() * grainIntensity * 0.4 * blueIntensityBoost;

      // Color de polvo con variación para azul
      let dustR = baseR;
      let dustG = baseG;
      let dustB = baseB;

      if (isBlueSVG) {
        const warmVar = Math.random() * 40;
        dustR = Math.min(255, dustR + warmVar);
        dustG = Math.min(255, dustG + warmVar * 0.6);
        dustB = Math.max(80, dustB - warmVar * 0.2);
      }

      ctx.globalAlpha = dustOpacity;
      ctx.fillStyle = `rgb(${dustR | 0},${dustG | 0},${dustB | 0})`;

      const dustBaseSize = isBlueSVG ? 0.8 : 0.5;
      const dustSize = getMobileGrainSize(dustBaseSize); // Aplicar ajuste móvil
      
      ctx.beginPath();
      ctx.arc(x, y, dustSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Rayones ultra-simplificados (solo con alta intensidad)
  if (intensity > 70 && Math.random() < 0.1) {
    const x = viewBox.x + Math.random() * viewBox.w;
    const startY = viewBox.y + Math.random() * viewBox.h * 0.3;
    const endY = startY + Math.random() * viewBox.h * 0.4;

    ctx.globalAlpha = Math.random() * grainIntensity * 0.3;
    ctx.strokeStyle = `rgb(${baseR | 0},${baseG | 0},${baseB | 0})`;
    ctx.lineWidth = 0.5;

    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
  }

  ctx.restore();
}

// Funciones de ruido para recrear el shader4
function random(x, y) {
  return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123) % 1;
}

function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const a = random(ix, iy);
  const b = random(ix + 1, iy);
  const c = random(ix, iy + 1);
  const d = random(ix + 1, iy + 1);

  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// Función de ruido 3D para el shader5
function noise3D(x, y, z) {
  // Simplificación: usar el ruido 2D con z como offset
  return (noise(x + z * 0.1, y + z * 0.1) + noise(x - z * 0.1, y - z * 0.1)) * 0.5;
}

// Cache para el shader4 optimizado
let shader4Cache = null;
let lastShader4Update = 0;
let shader4UpdateRate = 33; // ~30 FPS para el shader

// Función optimizada del shader4 con cache
function drawPureShader4(ctx, intensity, time, scale, tx, ty) {
  if (intensity <= 0) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  // Clip al área del SVG
  ctx.clip(svgPath);

  const currentTime = Date.now();
  const width = Math.ceil(viewBox.w);
  const height = Math.ceil(viewBox.h);

  // Solo regenerar el cache si ha pasado suficiente tiempo o cambió el tamaño
  if (!shader4Cache ||
    currentTime - lastShader4Update > shader4UpdateRate ||
    shader4Cache.width !== width ||
    shader4Cache.height !== height) {

    generateShader4Cache(width, height, time * 0.001);
    lastShader4Update = currentTime;
  }

  if (shader4Cache) {
    ctx.globalCompositeOperation = 'normal';
    ctx.globalAlpha = intensity;
    ctx.drawImage(shader4Cache, viewBox.x, viewBox.y);
  }

  ctx.restore();
}

// Función optimizada para generar el cache del shader4
function generateShader4Cache(width, height, u_time) {
  if (!shader4Cache) {
    shader4Cache = document.createElement('canvas');
  }

  shader4Cache.width = width;
  shader4Cache.height = height;
  const tempCtx = shader4Cache.getContext('2d');

  const imageData = tempCtx.createImageData(width, height);
  const data = imageData.data;

  // Determinar colores del shader basados en el color del SVG
  let baseShaderColor, colorVariation;

  // Función para convertir hex a RGB (reutilizada del grano)
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  const svgRgb = hexToRgb(currentColor);

  if (currentColor === '#ffffff') {
    // SVG blanco -> shader gris
    baseShaderColor = { r: 128, g: 128, b: 128 };
    colorVariation = 60;
  } else if (currentColor === '#000000') {
    // SVG negro -> shader gris claro
    baseShaderColor = { r: 180, g: 180, b: 180 };
    colorVariation = 50;
  } else if (currentColor === '#2B43FF') {
    // SVG azul -> shader azul (misma gama)
    baseShaderColor = { r: 43, g: 67, b: 255 };
    colorVariation = 80;
  } else {
    // Otros colores -> usar el mismo color del SVG con variaciones
    const brightness = (svgRgb.r + svgRgb.g + svgRgb.b) / 3;

    if (brightness > 128) {
      // Color claro -> shader más oscuro del mismo color
      baseShaderColor = {
        r: Math.max(30, svgRgb.r - 80),
        g: Math.max(30, svgRgb.g - 80),
        b: Math.max(30, svgRgb.b - 80)
      };
    } else {
      // Color oscuro -> shader más claro del mismo color
      baseShaderColor = {
        r: Math.min(255, svgRgb.r + 100),
        g: Math.min(255, svgRgb.g + 100),
        b: Math.min(255, svgRgb.b + 100)
      };
    }
    colorVariation = 70;
  }

  // Precalcular valores trigonométricos comunes para optimización
  const sinTime = Math.sin(u_time);
  const cosTime = Math.cos(u_time);
  const sinTime05 = Math.sin(u_time * 0.5);
  const cosTime03 = Math.cos(u_time * 0.3);
  const sinTime2 = Math.sin(u_time * 2);
  const cosTime3 = Math.cos(u_time * 3);

  // Sampling más agresivo para mejor rendimiento (cada 3 píxeles)
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      // Coordenadas normalizadas exactas del shader
      const coord_x = x / width;
      const coord_y = y / height;
      const center_x = 0.5 - coord_x;
      const center_y = 0.5 - coord_y;

      // Optimización: precalcular valores complejos
      const base1 = center_x * 10.0 + u_time * 0.5;
      const base2 = center_y * 4.0 + u_time * 0.3;
      const base3 = center_x * 5.0 + u_time * 0.5;
      const base4 = center_y * 3.0 + u_time;

      // Cálculo optimizado del shader original
      let col = noise(
        center_x * 5.0 +
        Math.sin(base1 + Math.sin(center_y * u_time)) +
        Math.cos(base2 + Math.sin(center_x * 2.0 * u_time)) +
        u_time,
        center_y * 5.0
      ) * 0.5;

      col += noise(
        center_x * 10.0 +
        Math.cos(base3) +
        Math.cos(base4) +
        u_time,
        center_y * 10.0
      ) * 0.7;

      col -= random(center_x - col, center_y - col) * 0.3;

      // Clamp
      col = Math.max(0, Math.min(1, col));

      // Aplicar colores adaptativos basados en el SVG
      const noiseVariation = (Math.random() - 0.5) * colorVariation;
      const timeVariation = Math.sin(u_time * 2 + x * 0.1 + y * 0.1) * (colorVariation * 0.3);

      let r = baseShaderColor.r + noiseVariation + timeVariation;
      let g = baseShaderColor.g + noiseVariation * 0.8 + timeVariation * 0.9;
      let b = baseShaderColor.b + noiseVariation * 0.6 + timeVariation * 1.1;

      // Modular la intensidad del color con el ruido
      r = Math.floor(Math.max(0, Math.min(255, r * col)));
      g = Math.floor(Math.max(0, Math.min(255, g * col)));
      b = Math.floor(Math.max(0, Math.min(255, b * col)));

      // Aplicar a un bloque de 3x3 píxeles para mejor cobertura
      for (let dy = 0; dy < 3 && y + dy < height; dy++) {
        for (let dx = 0; dx < 3 && x + dx < width; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          data[idx] = r;         // R
          data[idx + 1] = g;     // G
          data[idx + 2] = b;     // B
          data[idx + 3] = 255;   // A
        }
      }
    }
  }

  // Aplicar el ImageData al canvas cache
  tempCtx.putImageData(imageData, 0, 0);
}

// Cache para el shader5 optimizado
let shader5Cache = null;
let lastShader5Update = 0;
let shader5UpdateRate = 33; // ~30 FPS para el shader

// Función optimizada del shader5 con cache (efecto generativo con círculos de ruido)
function drawPureShader5(ctx, intensity, time, scale, tx, ty) {
  if (intensity <= 0) return;

  // console.log('Ejecutando drawPureShader5 con intensidad:', intensity);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  // Clip al área del SVG
  ctx.clip(svgPath);

  const currentTime = Date.now();
  const width = Math.ceil(viewBox.w);
  const height = Math.ceil(viewBox.h);

  // Solo regenerar el cache si ha pasado suficiente tiempo o cambió el tamaño
  if (!shader5Cache ||
    currentTime - lastShader5Update > shader5UpdateRate ||
    shader5Cache.width !== width ||
    shader5Cache.height !== height) {

    generateShader5Cache(width, height, time * 0.01);
    lastShader5Update = currentTime;
  }

  if (shader5Cache) {
    ctx.globalCompositeOperation = 'normal';
    ctx.globalAlpha = intensity;
    ctx.drawImage(shader5Cache, viewBox.x, viewBox.y);
  }

  ctx.restore();
}

// Función para generar el cache del shader5 (recreando el efecto de shader5/mySketch.js)
function generateShader5Cache(width, height, t) {
  if (!shader5Cache) {
    shader5Cache = document.createElement('canvas');
  }

  shader5Cache.width = width;
  shader5Cache.height = height;
  const tempCtx = shader5Cache.getContext('2d');

  // Limpiar el canvas
  tempCtx.clearRect(0, 0, width, height);

  // Configurar el modo de color HSB simulado y sin stroke
  tempCtx.globalCompositeOperation = 'source-over';

  // Recrear el efecto del shader5 original
  let xoff = 0;
  const stepSize = 10; // Tamaño de paso como en el original

  for (let x = 0; x < width; x += stepSize) {
    let yoff = 0;
    for (let y = 0; y < height; y += stepSize) {
      // Recrear el mapeo de ruido del shader5 original
      const noiseR = mapValue(noise3D(xoff, yoff, t), 0, 1, 0, 360);
      const noiseG = mapValue(noise3D(xoff + 1000, yoff + 2000, t), 0, 1, 0, 100);
      const noiseB = mapValue(noise3D(xoff + 3000, yoff + 5000, t), 0, 1, 0, 100);
      const a = mapValue(noise3D(xoff + 5000, yoff + 7000, t), 0, 1, 0, 100);

      let finalColor;

      // Adaptar colores según el color del SVG
      if (currentColor === '#ffffff') {
        // SVG blanco -> colores blancos/grises claros
        const intensity = noiseG / 100; // Usar el ruido G como intensidad
        const variation = (noiseR / 360) * 0.3; // Variación sutil
        const baseValue = 0.7 + intensity * 0.3 + variation; // 0.7-1.0
        finalColor = {
          r: baseValue,
          g: baseValue,
          b: baseValue
        };
      } else if (currentColor === '#000000' || currentColor === '#2B43FF') {
        // SVG negro o azul -> colores azules
        const hueBase = 220; // Azul base
        const hueVariation = (noiseR / 360) * 60 - 30; // ±30 grados de variación
        const finalHue = (hueBase + hueVariation) / 360;
        const saturation = 0.6 + (noiseG / 100) * 0.4; // 0.6-1.0
        const brightness = 0.4 + (noiseB / 100) * 0.6; // 0.4-1.0

        finalColor = hsbToRgb(finalHue, saturation, brightness);
      } else {
        // Otros colores -> usar el efecto original
        const rgb = hsbToRgb(noiseR / 360, noiseG / 100, noiseB / 100);
        finalColor = rgb;
      }

      // Aplicar alpha
      tempCtx.globalAlpha = a / 100;
      tempCtx.fillStyle = `rgb(${Math.floor(finalColor.r * 255)}, ${Math.floor(finalColor.g * 255)}, ${Math.floor(finalColor.b * 255)})`;

      // Dibujar círculo como en el original
      tempCtx.beginPath();
      tempCtx.arc(x, y, stepSize / 2, 0, Math.PI * 2);
      tempCtx.fill();

      yoff += 0.1;
    }
    xoff += 0.1;
  }
}

// Función auxiliar para mapear valores (equivalente a map() de p5.js)
function mapValue(value, start1, stop1, start2, stop2) {
  return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

// Función auxiliar para convertir HSB a RGB
function hsbToRgb(h, s, b) {
  let r, g, blue;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = b * (1 - s);
  const q = b * (1 - f * s);
  const t = b * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = b, g = t, blue = p; break;
    case 1: r = q, g = b, blue = p; break;
    case 2: r = p, g = b, blue = t; break;
    case 3: r = p, g = q, blue = b; break;
    case 4: r = t, g = p, blue = b; break;
    case 5: r = b, g = p, blue = q; break;
  }

  return { r, g, b: blue };
}

// Cache para el shader6 (efecto GLSL con patrones Bayer) - ESTABILIZADO
let shader6Cache = null;
let lastShader6Update = 0;
let shader6UpdateRate = 33; // ~30 FPS más estable
let shader6PerformanceMode = 'auto'; // 'auto', 'fast', 'quality'
let shader6LastFrameTime = 0;
let shader6FrameSkipCounter = 0;
let shader6AdaptiveQuality = 0.8; // Empezar con calidad más conservadora (0.7-1.0)
let shader6StabilityCounter = 0; // Contador para estabilizar cambios
let shader6OptimizationsEnabled = true; // Permitir desactivar optimizaciones si hay problemas

// NUEVAS OPTIMIZACIONES AVANZADAS
let shader6LookupTable = null; // Tabla de lookup para Bayer dithering
let shader6TrigCache = new Map(); // Cache para valores trigonométricos
let shader6LastIntensity = -1; // Para detectar cambios de intensidad
let shader6UseAdvancedOptimizations = true; // Optimizaciones ultra-agresivas

// Función optimizada del shader6 con cache (efecto GLSL Bayer) - MEJORADO
function drawPureShader6(ctx, intensity, time, scale, tx, ty) {
  if (intensity <= 0) return;

  const currentTime = performance.now();

  // Monitoreo de rendimiento adaptativo ULTRA-OPTIMIZADO
  if (shader6OptimizationsEnabled && shader6LastFrameTime > 0) {
    const frameTime = currentTime - shader6LastFrameTime;
    shader6StabilityCounter++;

    // Ajustar más frecuentemente pero con cambios más pequeños
    if (shader6StabilityCounter >= 3) {
      shader6StabilityCounter = 0;

      // Umbrales más agresivos para mejor rendimiento
      if (frameTime > 30) {
        shader6AdaptiveQuality = Math.max(0.5, shader6AdaptiveQuality - 0.08);
        shader6UpdateRate = Math.min(80, shader6UpdateRate + 8);
        // Activar optimizaciones ultra-agresivas si el rendimiento es muy malo
        if (frameTime > 50) {
          shader6UseAdvancedOptimizations = true;
        }
      } else if (frameTime < 16) {
        // Mejorar calidad más rápidamente cuando hay margen
        shader6AdaptiveQuality = Math.min(1.0, shader6AdaptiveQuality + 0.04);
        shader6UpdateRate = Math.max(20, shader6UpdateRate - 2);
      }
    }
  }
  shader6LastFrameTime = currentTime;

  // Frame skipping INTELIGENTE con predicción
  const timeSinceLastUpdate = currentTime - lastShader6Update;
  const shouldSkipFrame = shader6OptimizationsEnabled && timeSinceLastUpdate < shader6UpdateRate && shader6Cache;

  // Skip más agresivo si el rendimiento es malo
  const maxSkipFrames = shader6UseAdvancedOptimizations ? 5 : 3;

  if (shouldSkipFrame) {
    shader6FrameSkipCounter++;
    if (shader6FrameSkipCounter < maxSkipFrames) {
      // Solo dibujar el cache existente
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      ctx.scale(dpr, dpr);
      ctx.translate(tx, ty);
      ctx.scale(scale, scale);
      ctx.clip(svgPath);

      if (shader6Cache) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(0.9, intensity);
        ctx.drawImage(shader6Cache, viewBox.x, viewBox.y);
      }

      ctx.restore();
      return;
    }
  }

  shader6FrameSkipCounter = 0;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  // Clip al área del SVG
  ctx.clip(svgPath);

  // Calcular dimensiones adaptativas basadas en calidad (o usar tamaño completo si optimizaciones desactivadas)
  const baseWidth = Math.ceil(viewBox.w);
  const baseHeight = Math.ceil(viewBox.h);
  const qualityFactor = shader6OptimizationsEnabled ? shader6AdaptiveQuality : 1.0;
  const width = Math.ceil(baseWidth * qualityFactor);
  const height = Math.ceil(baseHeight * qualityFactor);

  // Regenerar cache con lógica ULTRA-INTELIGENTE
  const intensityChanged = Math.abs(intensity - shader6LastIntensity) > 0.01;
  const sizeChanged = !shader6Cache ||
    Math.abs(shader6Cache.width - width) > 8 ||
    Math.abs(shader6Cache.height - height) > 8;
  const timeForUpdate = timeSinceLastUpdate > shader6UpdateRate;

  const needsUpdate = sizeChanged || (timeForUpdate && (intensityChanged || !shader6UseAdvancedOptimizations));

  // Actualizar intensidad tracking
  shader6LastIntensity = intensity;

  if (needsUpdate) {
    generateShader6Cache(width, height, time * 0.001, intensity, scale, qualityFactor);
    lastShader6Update = currentTime;
  }

  if (shader6Cache) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(0.9, intensity);

    // Si la calidad es reducida, escalar el cache al tamaño completo
    if (shader6OptimizationsEnabled && qualityFactor < 1.0) {
      ctx.save();
      ctx.scale(1 / qualityFactor, 1 / qualityFactor);
      ctx.drawImage(shader6Cache, viewBox.x * qualityFactor, viewBox.y * qualityFactor);
      ctx.restore();
    } else {
      ctx.drawImage(shader6Cache, viewBox.x, viewBox.y);
    }
  }

  ctx.restore();
}

// Función para generar el cache del shader6 (recreando el efecto GLSL Bayer) - OPTIMIZADO
function generateShader6Cache(width, height, time, intensity, scale = 1, quality = 1.0) {
  if (!shader6Cache) {
    shader6Cache = document.createElement('canvas');
  }

  shader6Cache.width = width;
  shader6Cache.height = height;
  const tempCtx = shader6Cache.getContext('2d');

  // Limpiar canvas
  tempCtx.clearRect(0, 0, width, height);

  // Parámetros del shader6 basados en el GLSL original
  const gridSize = 150 * (0.5 + intensity * 1.0); // uGridSize variable
  const bayerScale = 0.5 * (0.3 + intensity * 0.7); // uScale variable
  const timeIncrement = time * 0.025; // Velocidad aumentada 2.5x

  // OPTIMIZACIÓN ULTRA-AGRESIVA: Sampling adaptativo inteligente
  let sampleStep;
  if (shader6UseAdvancedOptimizations) {
    // Sampling más agresivo cuando el rendimiento es crítico
    sampleStep = Math.max(1, Math.floor(4 - (quality * 2.5))); // 1-4 píxeles
  } else {
    sampleStep = Math.max(1, Math.floor(2.5 - (quality * 1.5))); // 1-2 píxeles conservador
  }

  // Inicializar lookup table para Bayer si no existe
  if (!shader6LookupTable || shader6LookupTable.scale !== bayerScale) {
    generateBayerLookupTable(bayerScale);
  }

  // Crear el efecto Bayer dithering con patrones animados
  const imageData = tempCtx.createImageData(width, height);
  const data = imageData.data;

  // OPTIMIZACIÓN: Precalcular TODOS los valores trigonométricos
  const timeKey = Math.floor(timeIncrement * 100); // Discretizar para cache
  let trigValues = shader6TrigCache.get(timeKey);
  if (!trigValues) {
    const sinTimeDiv4 = Math.sin(timeIncrement / 4.0);
    trigValues = {
      timeFactor0: Math.pow(Math.sin(0.0 + sinTimeDiv4), 2.0) * gridSize,
      timeFactor1: Math.pow(Math.sin(1.0 + sinTimeDiv4), 2.0) * gridSize,
      timeFactor2: Math.pow(Math.sin(2.0 + sinTimeDiv4), 2.0) * gridSize,
      sinTimeIncrement: Math.sin(timeIncrement),
      cosTimeIncrement: Math.cos(timeIncrement)
    };
    shader6TrigCache.set(timeKey, trigValues);
    // Limpiar cache si crece mucho
    if (shader6TrigCache.size > 50) {
      const firstKey = shader6TrigCache.keys().next().value;
      shader6TrigCache.delete(firstKey);
    }
  }

  // ULTRA-OPTIMIZACIÓN: Procesamiento en bloques con lookup tables
  const { timeFactor0, timeFactor1, timeFactor2 } = trigValues;

  // Precalcular constantes para el bucle
  const invWidth = 1.0 / width;
  const invHeight = 1.0 / height;
  const alpha = Math.floor(255 * intensity);

  // Determinar colores una sola vez
  let finalColorTrue, finalColorFalse;
  if (currentColor === '#ffffff') {
    finalColorTrue = 0; finalColorFalse = 255;
  } else if (currentColor === '#000000') {
    finalColorTrue = 255; finalColorFalse = 0;
  } else if (currentColor === '#2B43FF') {
    finalColorTrue = 255; finalColorFalse = 43;
  } else {
    finalColorTrue = 0; finalColorFalse = 255;
  }

  // Procesamiento ultra-optimizado en bloques
  for (let y = 0; y < height; y += sampleStep) {
    const uv_y = 1.0 - (y * invHeight);
    const pos_x_base = uv_y * gridSize;

    for (let x = 0; x < width; x += sampleStep) {
      const uv_x = x * invWidth;
      const pos_y = uv_x * gridSize;
      const pos_x = pos_x_base;

      // Cálculo ultra-optimizado de 'a' (reducir llamadas a atan2)
      let a = 3.0;
      a += Math.sin(2.0 * Math.atan2((pos_x - 62.0), (pos_y - timeFactor0 + 0.0001)));
      a += Math.sin(2.0 * Math.atan2((pos_y - 71.0), (pos_y - 9.0 - timeFactor1 + 0.0001)));
      a += Math.sin(2.0 * Math.atan2((pos_x - 80.0), (pos_x - 18.0 - timeFactor2 + 0.0001)));

      // Patrón p ultra-optimizado
      const sinA = Math.sin(a - timeIncrement);
      const p = sinA * sinA * gridSize / 3.0;
      const col = p / gridSize * 3.0;

      // Bayer dithering con lookup table
      const m = getBayerFromLookup(x, y);
      const finalColor = col > m ? finalColorTrue : finalColorFalse;

      // Aplicar el color ULTRA-OPTIMIZADO (sin suavizado si es crítico el rendimiento)
      if (shader6UseAdvancedOptimizations && sampleStep > 2) {
        // Modo ultra-rápido: sin suavizado
        for (let dy = 0; dy < sampleStep && y + dy < height; dy++) {
          for (let dx = 0; dx < sampleStep && x + dx < width; dx++) {
            const index = ((y + dy) * width + (x + dx)) * 4;
            data[index] = finalColor;
            data[index + 1] = finalColor;
            data[index + 2] = finalColor;
            data[index + 3] = alpha;
          }
        }
      } else {
        // Modo normal: con suavizado
        for (let dy = 0; dy < sampleStep && y + dy < height; dy++) {
          for (let dx = 0; dx < sampleStep && x + dx < width; dx++) {
            const index = ((y + dy) * width + (x + dx)) * 4;
            const edgeFactor = (dx === 0 || dy === 0 || dx === sampleStep - 1 || dy === sampleStep - 1) ? 0.9 : 1.0;
            const smoothAlpha = Math.floor(alpha * edgeFactor);

            data[index] = finalColor;
            data[index + 1] = finalColor;
            data[index + 2] = finalColor;
            data[index + 3] = smoothAlpha;
          }
        }
      }
    }
  }

  tempCtx.putImageData(imageData, 0, 0);
}

// Función para mostrar información de rendimiento del shader6 (opcional)
function getShader6PerformanceInfo() {
  return {
    updateRate: shader6UpdateRate,
    adaptiveQuality: shader6AdaptiveQuality,
    frameSkipCounter: shader6FrameSkipCounter,
    cacheSize: shader6Cache ? `${shader6Cache.width}x${shader6Cache.height}` : 'No cache',
    performanceMode: shader6PerformanceMode,
    optimizationsEnabled: shader6OptimizationsEnabled,
    isOptimized: shader6AdaptiveQuality < 1.0 || shader6UpdateRate > 50
  };
}

// Función para desactivar optimizaciones si causan problemas
function disableShader6Optimizations() {
  shader6OptimizationsEnabled = false;
  shader6AdaptiveQuality = 1.0;
  shader6UpdateRate = 25; // Frecuencia original más alta
  console.log('🔧 Shader6 optimizations disabled - using original performance mode');
}

// Función para reactivar optimizaciones
function enableShader6Optimizations() {
  shader6OptimizationsEnabled = true;
  shader6UseAdvancedOptimizations = true;
  shader6AdaptiveQuality = 0.8;
  shader6UpdateRate = 33;
  console.log('⚡ Shader6 optimizations enabled - using adaptive performance mode');
}

// Función para activar modo ULTRA-PERFORMANCE (máxima velocidad)
function enableShader6UltraMode() {
  shader6OptimizationsEnabled = true;
  shader6UseAdvancedOptimizations = true;
  shader6AdaptiveQuality = 0.6;
  shader6UpdateRate = 50;
  console.log('🚀 Shader6 ULTRA mode enabled - maximum performance!');
}

// Función para limpiar caches y forzar regeneración
function clearShader6Caches() {
  shader6TrigCache.clear();
  shader6LookupTable = null;
  shader6Cache = null;
  console.log('🧹 Shader6 caches cleared');
}

// NUEVAS FUNCIONES DE OPTIMIZACIÓN ULTRA-AVANZADA

// Generar lookup table para Bayer dithering
function generateBayerLookupTable(scale) {
  const size = 64; // Tamaño de la lookup table
  shader6LookupTable = {
    scale: scale,
    size: size,
    data: new Float32Array(size * size)
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      shader6LookupTable.data[index] = bayer32(x * scale, y * scale);
    }
  }
}

// Obtener valor Bayer desde lookup table (ultra-rápido)
function getBayerFromLookup(x, y) {
  if (!shader6LookupTable) return 0.5;

  const size = shader6LookupTable.size;
  const lx = Math.floor(x) % size;
  const ly = Math.floor(y) % size;
  return shader6LookupTable.data[ly * size + lx];
}

// Función Bayer dithering original (solo para generar lookup table)
function bayer32(x, y) {
  const bayer2 = (a_x, a_y) => {
    const ax = Math.floor(a_x);
    const ay = Math.floor(a_y);
    return (ax / 2.0 + ay * ay * 0.75) % 1.0;
  };

  const bayer4 = (a_x, a_y) => bayer2(a_x * 0.5, a_y * 0.5) * 0.25 + bayer2(a_x, a_y);
  const bayer8 = (a_x, a_y) => bayer4(a_x * 0.5, a_y * 0.5) * 0.25 + bayer2(a_x, a_y);
  const bayer16 = (a_x, a_y) => bayer8(a_x * 0.5, a_y * 0.5) * 0.25 + bayer2(a_x, a_y);
  const bayer32_calc = (a_x, a_y) => bayer16(a_x * 0.5, a_y * 0.5) * 0.25 + bayer2(a_x, a_y);

  return bayer32_calc(x, y);
}

// Función de suavizado para animación más smooth
function smoothStep(t) {
  // Función de interpolación cúbica suave (smoothstep)
  return t * t * (3.0 - 2.0 * t);
}

// Función para crear color metálico gris brillante
function createMetallicColor(originalColor, metallicFactor) {
  // Gris metálico brillante fijo independiente del color original
  const baseMetallicGray = 180; // Gris metálico brillante base
  const highlightGray = 220; // Gris más brillante para highlights

  // Crear gris metálico brillante con variación
  const metallicGray = Math.floor(baseMetallicGray + (highlightGray - baseMetallicGray) * metallicFactor * 0.5);

  // Siempre devolver gris metálico, sin mezclar con color original
  return `rgb(${metallicGray}, ${metallicGray}, ${metallicGray})`;
}

// Función para crear efecto túnel en el contorno
function drawTunnelEffect(ctx, svgPath, color, outlineWidth, time, metallicIntensity = 0) {
  // Determinar si aplicar efecto metálico
  const isMetallicActive = metallicIntensity > 0;

  // Primero dibujar el contorno principal estático (sin animación)
  ctx.save();

  if (isMetallicActive) {
    // Aplicar efecto gris metálico
    const metallicFactor = metallicIntensity / 100;
    const metallicColor = createMetallicColor(color, metallicFactor);
    ctx.strokeStyle = metallicColor;

    // Añadir brillo metálico con gradiente
    const centerX = viewBox.x + viewBox.w * 0.5;
    const centerY = viewBox.y + viewBox.h * 0.5;
    const maxDim = Math.max(viewBox.w, viewBox.h);

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxDim * 0.7);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${0.6 * metallicFactor})`); // Blanco brillante
    gradient.addColorStop(0.3, `rgba(240, 240, 240, ${0.4 * metallicFactor})`); // Gris muy claro
    gradient.addColorStop(0.7, `rgba(200, 200, 200, ${0.3 * metallicFactor})`); // Gris medio
    gradient.addColorStop(1, `rgba(160, 160, 160, ${0.2 * metallicFactor})`); // Gris más oscuro

    // Aplicar múltiples sombras para más brillo
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = outlineWidth * 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
  } else {
    ctx.strokeStyle = color;
  }

  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1.0;
  ctx.stroke(svgPath);

  // Añadir resplandor extra si es metálico
  if (isMetallicActive) {
    const metallicFactor = metallicIntensity / 100;
    ctx.save();
    ctx.globalAlpha = 0.3 * metallicFactor;
    ctx.shadowColor = 'rgba(255, 255, 255, 1.0)';
    ctx.shadowBlur = outlineWidth * 5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = outlineWidth * 0.5;
    ctx.stroke(svgPath);
    ctx.restore();
  }

  ctx.restore();

  // Parámetros del túnel para capas internas solamente
  const numLayers = 12; // Número de capas internas (sin contar la principal)
  const maxScale = 0.9; // Escala máxima para capas internas (menor que el original)
  const minScale = 0.03; // Escala mínima (centro del túnel)
  const animationSpeed = 0.0003; // Velocidad muy lenta
  const depthOffset = time * animationSpeed; // Desplazamiento temporal para animación

  // Configurar el recorte al SVG original para que el túnel no se salga
  ctx.save();
  ctx.clip(svgPath);

  // Dibujar solo las capas internas del túnel (sin la capa principal)
  for (let i = 0; i < numLayers; i++) {
    const layerProgress = i / (numLayers - 1); // 0 a 1

    // Calcular escala con animación más smooth
    const rawProgress = (layerProgress + depthOffset) % 1.0;
    const smoothProgress = smoothStep(rawProgress);
    const scale = maxScale - (maxScale - minScale) * smoothProgress;

    // Saltar capas muy pequeñas para optimización
    if (scale < 0.02) continue;

    // Calcular opacidad basada en la profundidad
    const opacity = Math.pow(1 - smoothProgress, 0.8) * 0.7;

    // Calcular grosor del contorno basado en la escala
    const layerOutlineWidth = outlineWidth * (0.2 + scale * 0.6);

    ctx.save();

    // Centrar y escalar
    const centerX = viewBox.x + viewBox.w * 0.5;
    const centerY = viewBox.y + viewBox.h * 0.5;

    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);

    // Configurar estilo del contorno con efecto metálico si está activo
    if (isMetallicActive) {
      const metallicFactor = metallicIntensity / 100;
      const layerMetallicColor = createMetallicColor(color, metallicFactor); // Misma intensidad que el principal
      ctx.strokeStyle = layerMetallicColor;

      // Añadir brillo más intenso a las capas internas
      ctx.shadowColor = `rgba(255, 255, 255, ${0.4 * metallicFactor * opacity})`;
      ctx.shadowBlur = layerOutlineWidth * 1.5;
      ctx.shadowOffsetX = 0.5;
      ctx.shadowOffsetY = 0.5;
    } else {
      ctx.strokeStyle = color;
    }

    ctx.globalAlpha = opacity;
    ctx.lineWidth = layerOutlineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Dibujar el contorno escalado
    ctx.stroke(svgPath);

    ctx.restore();
  }

  // Añadir efecto de resplandor en el centro
  if (numLayers > 6) {
    ctx.save();

    const centerX = viewBox.x + viewBox.w * 0.5;
    const centerY = viewBox.y + viewBox.h * 0.5;
    const glowRadius = Math.min(viewBox.w, viewBox.h) * 0.08; // Resplandor fijo sin parpadeo

    // Crear gradiente radial para el resplandor
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);

    // Convertir color a rgba para el resplandor
    let glowColor;
    if (color.startsWith('#')) {
      // Convertir hex a rgba
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      glowColor = `rgba(${r}, ${g}, ${b}`;
    } else if (color.startsWith('rgb')) {
      glowColor = color.replace('rgb', 'rgba').replace(')', '');
    } else {
      glowColor = 'rgba(255, 255, 255'; // Fallback
    }

    gradient.addColorStop(0, `${glowColor}, 0.4)`);
    gradient.addColorStop(0.5, `${glowColor}, 0.2)`);
    gradient.addColorStop(1, `${glowColor}, 0)`);

    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

// Función para crear efecto neumorphism en el SVG
function drawNeumorphismEffect(ctx, intensity, scale, tx, ty, time = 0) {
  if (intensity === 0) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  // Intensidad del efecto (0-100 convertido a 0-1)
  const effectIntensity = intensity / 100;

  // Variación temporal para la posición de la sombra
  const timeVariation = time * 0.001;
  const shadowVariationX = Math.sin(timeVariation) * 3 * effectIntensity;
  const shadowVariationY = Math.cos(timeVariation * 0.7) * 2 * effectIntensity;

  // Crear múltiples capas de sombras para simular profundidad
  const shadowLayers = [
    { offset: 8, blur: 16, alpha: 0.15 },
    { offset: 4, blur: 8, alpha: 0.1 },
    { offset: 2, blur: 4, alpha: 0.05 }
  ];

  // Sombras externas con variación temporal
  shadowLayers.forEach((layer, index) => {
    const layerIntensity = effectIntensity * (1 - index * 0.2);
    if (layerIntensity > 0) {
      ctx.save();

      // Sombra inferior derecha (oscura) con variación
      ctx.shadowColor = `rgba(0, 0, 0, ${layer.alpha * layerIntensity})`;
      ctx.shadowOffsetX = layer.offset * layerIntensity + shadowVariationX;
      ctx.shadowOffsetY = layer.offset * layerIntensity + shadowVariationY;
      ctx.shadowBlur = layer.blur * layerIntensity;
      ctx.fillStyle = '#f0f0f0';
      ctx.fill(svgPath);

      ctx.restore();
      ctx.save();

      // Sombra superior izquierda (clara) con variación opuesta
      ctx.shadowColor = `rgba(255, 255, 255, ${layer.alpha * layerIntensity * 0.8})`;
      ctx.shadowOffsetX = -layer.offset * layerIntensity * 0.7 - shadowVariationX * 0.5;
      ctx.shadowOffsetY = -layer.offset * layerIntensity * 0.7 - shadowVariationY * 0.5;
      ctx.shadowBlur = layer.blur * layerIntensity;
      ctx.fillStyle = '#f0f0f0';
      ctx.fill(svgPath);

      ctx.restore();
    }
  });

  // Crear gradiente interno para simular curvatura
  const centerX = viewBox.x + viewBox.w / 2;
  const centerY = viewBox.y + viewBox.h / 2;
  const radius = Math.max(viewBox.w, viewBox.h) / 2;

  // Gradiente radial para el efecto de profundidad
  const innerGradient = ctx.createRadialGradient(
    centerX - radius * 0.3, centerY - radius * 0.3, 0,
    centerX, centerY, radius
  );

  // Colores del gradiente basados en la intensidad
  const lightColor = `rgba(255, 255, 255, ${0.3 * effectIntensity})`;
  const darkColor = `rgba(0, 0, 0, ${0.1 * effectIntensity})`;
  const midColor = `rgba(240, 240, 240, ${0.05 * effectIntensity})`;

  innerGradient.addColorStop(0, lightColor);
  innerGradient.addColorStop(0.4, midColor);
  innerGradient.addColorStop(1, darkColor);

  // Aplicar el gradiente interno
  ctx.save();
  ctx.clip(svgPath);
  ctx.fillStyle = innerGradient;
  ctx.fillRect(viewBox.x, viewBox.y, viewBox.w, viewBox.h);
  ctx.restore();

  // Añadir textura realista con variación temporal
  ctx.save();
  ctx.clip(svgPath);

  // Textura de superficie con ruido Perlin simulado
  const textureIntensity = effectIntensity * 0.4;
  const textureScale = 15; // Tamaño de la textura
  const textureTime = timeVariation * 0.5;

  for (let x = viewBox.x; x < viewBox.x + viewBox.w; x += textureScale) {
    for (let y = viewBox.y; y < viewBox.y + viewBox.h; y += textureScale) {
      // Crear ruido pseudo-aleatorio basado en posición y tiempo
      const noiseX = x * 0.01 + textureTime;
      const noiseY = y * 0.01 + textureTime * 0.7;

      const noise1 = Math.sin(noiseX) * Math.cos(noiseY);
      const noise2 = Math.sin(noiseX * 2.1) * Math.cos(noiseY * 1.7);
      const noise3 = Math.sin(noiseX * 4.3) * Math.cos(noiseY * 3.1);

      const combinedNoise = (noise1 + noise2 * 0.5 + noise3 * 0.25) / 1.75;
      const textureValue = combinedNoise * textureIntensity;

      // Aplicar textura como pequeños puntos de luz/sombra
      if (Math.abs(textureValue) > 0.1) {
        ctx.save();
        ctx.globalAlpha = Math.abs(textureValue) * 0.3;

        const textureColor = textureValue > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
        ctx.fillStyle = textureColor;

        // Crear pequeñas formas orgánicas para la textura
        const size = Math.abs(textureValue) * 4 + 1;
        ctx.beginPath();
        ctx.ellipse(x, y, size, size * 0.7, combinedNoise, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }
  }

  // Añadir textura de fibras sutiles
  if (effectIntensity > 0.2) {
    ctx.save();
    ctx.globalAlpha = effectIntensity * 0.15;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5;

    // Crear líneas orgánicas que simulan fibras de material
    for (let i = 0; i < 20; i++) {
      const startX = viewBox.x + Math.random() * viewBox.w;
      const startY = viewBox.y + Math.random() * viewBox.h;
      const length = 20 + Math.random() * 40;
      const angle = Math.random() * Math.PI * 2 + timeVariation * 0.1;

      ctx.beginPath();
      ctx.moveTo(startX, startY);

      // Crear línea ondulada
      for (let j = 0; j < length; j += 3) {
        const waveX = startX + Math.cos(angle) * j + Math.sin(j * 0.2 + timeVariation) * 2;
        const waveY = startY + Math.sin(angle) * j + Math.cos(j * 0.15 + timeVariation) * 1.5;
        ctx.lineTo(waveX, waveY);
      }

      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.restore();

  // Añadir brillo sutil en los bordes con variación temporal
  if (effectIntensity > 0.3) {
    ctx.save();
    ctx.clip(svgPath);

    // Variación del ángulo del gradiente basada en el tiempo
    const gradientAngle = timeVariation * 0.3;
    const gradientX1 = viewBox.x + viewBox.w * 0.5 + Math.cos(gradientAngle) * viewBox.w * 0.3;
    const gradientY1 = viewBox.y + viewBox.h * 0.5 + Math.sin(gradientAngle) * viewBox.h * 0.3;
    const gradientX2 = viewBox.x + viewBox.w * 0.5 - Math.cos(gradientAngle) * viewBox.w * 0.3;
    const gradientY2 = viewBox.y + viewBox.h * 0.5 - Math.sin(gradientAngle) * viewBox.h * 0.3;

    // Crear gradiente de borde con variación temporal
    const borderGradient = ctx.createLinearGradient(
      gradientX1, gradientY1,
      gradientX2, gradientY2
    );

    const highlightAlpha = (effectIntensity - 0.3) * 0.2;
    const timeAlphaVariation = Math.sin(timeVariation * 2) * 0.05 + 1;

    borderGradient.addColorStop(0, `rgba(255, 255, 255, ${highlightAlpha * timeAlphaVariation})`);
    borderGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    borderGradient.addColorStop(1, `rgba(0, 0, 0, ${highlightAlpha * 0.5 * timeAlphaVariation})`);

    ctx.fillStyle = borderGradient;
    ctx.fillRect(viewBox.x, viewBox.y, viewBox.w, viewBox.h);
    ctx.restore();
  }

  ctx.restore();
}

function drawInternalLines(ctx, intensity, scale, tx, ty, time = 0, outlineWidth = 0) {
  if (intensity === 0) return;

  // Configurar el estilo de las líneas
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  // Crear máscara del SVG para que las líneas solo aparezcan dentro
  ctx.clip(svgPath);

  // Calcular distancia del mouse al centro del SVG (en coordenadas del SVG)
  const centerX = viewBox.x + viewBox.w / 2;
  const centerY = viewBox.y + viewBox.h / 2;
  const mouseXInSVG = (mouse.x - tx) / scale;
  const mouseYInSVG = (mouse.y - ty) / scale;
  const distanceToMouse = Math.sqrt(
    Math.pow(mouseXInSVG - centerX, 2) +
    Math.pow(mouseYInSVG - centerY, 2)
  );
  const maxDistance = Math.max(viewBox.w, viewBox.h) / 2;
  const hoverEffect = Math.max(0, 1 - (distanceToMouse / maxDistance));

  // Configurar estilo de línea con animación
  const baseOpacity = 0.3 + (intensity / 100) * 0.4;
  const animatedOpacity = baseOpacity + (hoverEffect * 0.3);
  // Hacer las líneas más gruesas tanto en desktop como en móvil
  const baseLineWidth = 1.8 + (intensity / 100) * 4.0; // Aumentado a 1.8 base y 4.0 multiplicador para líneas bien gruesas
  const animatedLineWidth = baseLineWidth + (hoverEffect * 1.5);

  // Color de líneas según el color del SVG y si el contorno está activo
  let lineColor;
  if (outlineWidth > 0) {
    // Cuando contorno está activo: negro con SVG negro/azul, blanco con SVG blanco
    if (currentColor === '#ffffff') {
      lineColor = '#ffffff'; // Líneas blancas con SVG blanco
    } else {
      lineColor = '#000000'; // Líneas negras con SVG negro/azul
    }
  } else {
    // Comportamiento original cuando no hay contorno
    lineColor = currentColor === '#ffffff' ? '#2B43FF' : '#fff';
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = animatedLineWidth;
  ctx.globalAlpha = animatedOpacity;

  // Calcular número de líneas basado en intensidad
  const numLines = Math.floor((intensity / 100) * 50) + 5;
  const spacing = viewBox.h / numLines;

  // Dibujar líneas horizontales con animación
  for (let i = 0; i < numLines; i++) {
    const y = viewBox.y + (i * spacing);

    // Calcular distancia de esta línea al mouse
    const lineDistanceToMouse = Math.abs(mouseYInSVG - y);
    const lineHoverEffect = Math.max(0, 1 - (lineDistanceToMouse / 100));

    // Eliminar completamente los offsets horizontales para evitar ondulaciones
    // Solo mantener efectos de opacidad y grosor
    const startX = viewBox.x;
    const endX = viewBox.x + viewBox.w;

    // Aplicar opacidad individual por línea
    const lineOpacity = animatedOpacity * (0.7 + lineHoverEffect * 0.3);
    ctx.globalAlpha = lineOpacity;

    // Aplicar grosor individual por línea
    const lineWidth = animatedLineWidth * (0.8 + lineHoverEffect * 0.4);
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }

  // Dibujar algunas líneas verticales para crear textura cruzada con animación
  if (intensity > 30) {
    const verticalLines = Math.floor((intensity / 100) * 20) + 3;
    const verticalSpacing = viewBox.w / verticalLines;

    for (let i = 0; i < verticalLines; i++) {
      const x = viewBox.x + (i * verticalSpacing);

      // Calcular distancia de esta línea vertical al mouse
      const verticalDistanceToMouse = Math.abs(mouseXInSVG - x);
      const verticalHoverEffect = Math.max(0, 1 - (verticalDistanceToMouse / 80));

      // Eliminar completamente los offsets verticales para evitar ondulaciones
      // Solo mantener efectos de opacidad y grosor
      const startY = viewBox.y;
      const endY = viewBox.y + viewBox.h;

      // Aplicar opacidad individual por línea vertical
      const verticalOpacity = animatedOpacity * (0.6 + verticalHoverEffect * 0.4);
      ctx.globalAlpha = verticalOpacity;

      // Aplicar grosor individual por línea vertical
      const verticalWidth = animatedLineWidth * (0.7 + verticalHoverEffect * 0.5);
      ctx.lineWidth = verticalWidth;

      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
  }

  ctx.restore();
}


function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  ctx.scale(dpr, dpr);

  // Reinicializar watercolor canvas con nuevo tamaño
  if (watercolorCanvas) {
    initWatercolor();
  }
}

function getTransformToFit() {
  const padding = 20;
  const cw = canvas.width / (window.devicePixelRatio || 1);
  const ch = canvas.height / (window.devicePixelRatio || 1);

  // Reducir menos el área disponible para hacer el SVG un poco más grande
  const availableWidth = cw - padding * 2 - 150; // Reducir solo 150px de ancho (antes 200px)
  const availableHeight = ch - padding * 2 - 50; // Reducir solo 50px de alto (antes 100px)

  const scale = Math.min(
    availableWidth / viewBox.w,
    availableHeight / viewBox.h
  ) * 0.9; // Aumentar escala al 90% (antes 80%)

  // Mover hacia la derecha y centrar verticalmente
  const offsetX = 120; // Reducir offset a 120px (antes 150px)
  const tx = (cw - viewBox.w * scale) / 2 - viewBox.x * scale + offsetX;
  const ty = (ch - viewBox.h * scale) / 2 - viewBox.y * scale;

  return { scale, tx, ty };
}

function draw() {
  if (!svgPath) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.width / dpr;
  const ch = canvas.height / dpr;
  const { scale, tx, ty } = getTransformToFit();

  const desired = parseInt(densityInput.value, 10);
  const metallicIntensity = parseInt(metallicInput.value, 10);
  const linesIntensity = parseInt(linesInput.value, 10);
  const outlineWidth = parseInt(outlineInput.value, 10);
  const watercolorIntensity = parseInt(watercolorInput.value, 10);
  const baseFilmgrainIntensity = filmgrainInput ? parseInt(filmgrainInput.value, 10) : 0;
  const filmgrainIntensity = getMobileFilmgrainIntensity(baseFilmgrainIntensity); // Aplicar ajuste móvil
  
  // Debug para ruido móvil
  if (isMobileDevice() && baseFilmgrainIntensity > 0 && filmgrainIntensity !== baseFilmgrainIntensity) {
    console.log('📱 Ruido móvil aplicado:', {
      valorSlider: baseFilmgrainIntensity,
      intensidadOriginal: baseFilmgrainIntensity,
      intensidadMóvil: filmgrainIntensity,
      incremento: `+${(filmgrainIntensity - baseFilmgrainIntensity).toFixed(0)} puntos`
    });
  }

  // Actualizar tiempo de animación
  animationTime = performance.now();

  // Debug: mostrar solo cuando se activa shader5 por primera vez
  const shader5ShouldActivate = watercolorIntensity > 0 && desired > 1;
  if (shader5ShouldActivate && !window.shader5DebugShown) {
    console.log('🎨 Shader5 activado - Condiciones cumplidas:', {
      watercolorIntensity,
      desired,
      modo: desired <= 1 ? 'relleno' : 'trama'
    });
    window.shader5DebugShown = true;
  } else if (!shader5ShouldActivate) {
    window.shader5DebugShown = false;
  }

  // Debug: mostrar solo cuando se activa shader6 por primera vez
  const shader6ShouldActivate = linesIntensity > 0 && desired > 1;
  if (shader6ShouldActivate && !window.shader6DebugShown) {
    console.log('🎨 Shader6 activado - Condiciones cumplidas:', {
      linesIntensity,
      desired,
      modo: desired <= 1 ? 'relleno' : 'trama'
    });
    window.shader6DebugShown = true;
  } else if (!shader6ShouldActivate) {
    window.shader6DebugShown = false;
  }

  // Si la densidad es 1, dibujar sólido
  if (desired <= 1) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);


    // Modo contorno o relleno
    if (outlineWidth > 0) {
      // Efecto túnel: replicar el SVG en tamaños decrecientes
      drawTunnelEffect(ctx, svgPath, currentColor, outlineWidth, animationTime, metallicIntensity);
    } else {
      // Modo relleno normal
      // Siempre dibujar el fondo con el color actual primero
      ctx.fillStyle = currentColor;
      ctx.fill(svgPath);

      // Aplicar shader con opacidad basada en el slider (solo si shader6 no está activo)
      const shader6WillActivate = linesIntensity > 0 && desired > 1;
      if (metallicIntensity > 0 && !shader6WillActivate) {
        const opacity = metallicIntensity / 100; // Convertir 0-100 a 0-1

        // Intentar usar el shader p5
        if (window.shaderWhirls && window.shaderWhirls.isReady()) {
          const canvas = window.shaderWhirls.getCanvas();
          if (canvas && canvas.width > 0) {
            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.clip(svgPath);
            ctx.drawImage(canvas, viewBox.x, viewBox.y, viewBox.w, viewBox.h);
            ctx.restore();
          } else {
            // Fallback: gradiente animado con opacidad
            ctx.save();
            ctx.globalAlpha = opacity;
            const centerX = viewBox.x + viewBox.w / 2;
            const centerY = viewBox.y + viewBox.h / 2;
            const radius = Math.max(viewBox.w, viewBox.h) / 2;
            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            const time = animationTime * 0.001;
            gradient.addColorStop(0, `hsl(${(time * 50) % 360}, 60%, 40%)`);
            gradient.addColorStop(0.5, `hsl(${(time * 30 + 120) % 360}, 70%, 30%)`);
            gradient.addColorStop(1, `hsl(${(time * 60) % 360}, 50%, 10%)`);
            ctx.fillStyle = gradient;
            ctx.fill(svgPath);
            ctx.restore();
          }
        } else if (metallicIntensity > 0 && !(metallicIntensity >= 80 && filmgrainIntensity >= 80)) {
          // Shader no listo: usar gradiente temporal con opacidad (solo si no está activo el shader especial)
          ctx.save();
          ctx.globalAlpha = opacity;
          const centerX = viewBox.x + viewBox.w / 2;
          const centerY = viewBox.y + viewBox.h / 2;
          const radius = Math.max(viewBox.w, viewBox.h) / 2;
          const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
          const time = animationTime * 0.001;
          gradient.addColorStop(0, `hsl(${(time * 50) % 360}, 60%, 40%)`);
          gradient.addColorStop(0.5, `hsl(${(time * 30 + 120) % 360}, 70%, 30%)`);
          gradient.addColorStop(1, `hsl(${(time * 60) % 360}, 50%, 10%)`);
          ctx.fillStyle = gradient;
          ctx.fill(svgPath);
          ctx.restore();
        }
      }
    }

    // Solo aplicar efectos normales si shader6 no está activo
    const shader6WillActivate = linesIntensity > 0 && desired > 1;

    if (!shader6WillActivate) {
      // Aplicar efecto watercolor si está activado (solo en modo relleno)
      if (watercolorIntensity > 0 && outlineWidth === 0) {
        ctx.save();
        ctx.clip(svgPath);
        drawWatercolor(ctx, watercolorIntensity, animationTime, scale, tx, ty);
        ctx.restore();
      }


      // Dibujar líneas internas si están activadas
      if (linesIntensity > 0) {
        drawInternalLines(ctx, linesIntensity, scale, tx, ty, animationTime, outlineWidth);
      }
    }

    ctx.restore();

    // Aplicar shader especial cuando ambos efectos estén casi al máximo (reemplaza otros efectos)
    if (metallicIntensity >= 80 && filmgrainIntensity >= 80) {
      const specialIntensity = Math.min((metallicIntensity - 80) / 20, (filmgrainIntensity - 80) / 20);
      drawPureShader4(ctx, specialIntensity, animationTime, scale, tx, ty);
    } else if (linesIntensity > 0 && desired > 1) {
      // Aplicar shader6 cuando delineado y semitono estén activos (reemplaza otros efectos)
      const linesFactor = linesIntensity / 100; // Normalizar de 0-100 a 0-1
      const densityFactor = (desired - 1) / 14; // Normalizar de 1-15 a 0-1
      const shader6Intensity = Math.min(linesFactor, densityFactor);
      drawPureShader6(ctx, shader6Intensity, animationTime, scale, tx, ty);
    } else if (watercolorIntensity > 0 && desired > 1) {
      // Aplicar shader5 cuando acuarela y semitono estén activos
      const watercolorFactor = watercolorIntensity / 100;
      const densityFactor = (desired - 1) / 14; // Normalizar de 1-15 a 0-1
      const shader5Intensity = Math.min(watercolorFactor, densityFactor);
      drawPureShader5(ctx, shader5Intensity, animationTime, scale, tx, ty);
    } else {
      // Solo aplicar efectos normales si no está activo ningún shader especial
      if (filmgrainIntensity > 0) {
        drawFilmGrain(ctx, filmgrainIntensity, animationTime, scale, tx, ty);
      }
    }

    return;
  }

  // Para densidad > 1: Solo puntos de trama (sin fondo)
  // Pero no dibujar puntos si algún shader está activo
  const shader6Active = linesIntensity > 0 && desired > 1;
  const shader5Active = watercolorIntensity > 0 && desired > 1;

  if (shader6Active) {
    // Si shader6 está activo, solo dibujar el fondo y aplicar el shader
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // Dibujar fondo sólido
    ctx.fillStyle = currentColor;
    ctx.fill(svgPath);

    ctx.restore();

    // Aplicar shader6
    const linesFactor = linesIntensity / 100; // Normalizar de 0-100 a 0-1
    const densityFactor = (desired - 1) / 14; // Normalizar de 1-15 a 0-1
    const shader6Intensity = Math.min(linesFactor, densityFactor);
    drawPureShader6(ctx, shader6Intensity, animationTime, scale, tx, ty);
    return;
  } else if (shader5Active) {
    // Si shader5 está activo, solo dibujar el fondo y aplicar el shader
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // Dibujar fondo sólido
    ctx.fillStyle = currentColor;
    ctx.fill(svgPath);

    ctx.restore();

    // Aplicar shader5
    const watercolorFactor = watercolorIntensity / 100;
    const densityFactor = (desired - 1) / 14; // Normalizar de 1-15 a 0-1
    const shader5Intensity = Math.min(watercolorFactor, densityFactor);
    drawPureShader5(ctx, shader5Intensity, animationTime, scale, tx, ty);
    return;
  }

  // Calcular radio primero
  // Ajustar fórmula para que el valor máximo (15) tenga el tamaño del valor medio anterior
  const baseDotRadius = Math.max(1, 14 - desired * 0.75);
  const dotRadius = getMobileDotRadius(baseDotRadius, desired); // Aplicar ajuste móvil
  
  // Calcular espaciado basado en el tamaño real de los círculos para evitar superposiciones
  const svgSize = Math.max(viewBox.w, viewBox.h);
  const screenSize = Math.min(cw, ch);
  const baseSpacing = (screenSize / 12) * (scale * svgSize / screenSize);
  
  // NUEVO: Espaciado inteligente que considera el tamaño de los círculos
  // El espaciado mínimo debe ser al menos el diámetro + un pequeño margen
  const minSpacing = (dotRadius * 2) + (dotRadius * 0.3); // Diámetro + 30% de margen
  const densitySpacing = baseSpacing / Math.sqrt(desired);
  const spacing = Math.max(minSpacing, densitySpacing); // Usar el mayor de los dos
  
  // Debug para espaciado anti-superposición
  if (spacing === minSpacing && minSpacing > densitySpacing) {
    console.log('🔧 Espaciado anti-superposición aplicado:', {
      valorSlider: desired,
      radioPunto: dotRadius.toFixed(2),
      espaciadoOriginal: densitySpacing.toFixed(2),
      espaciadoAjustado: spacing.toFixed(2),
      margenSeguridad: '30%'
    });
  }
  
  // Debug para móvil
  if (isMobileDevice() && desired > 1 && dotRadius !== baseDotRadius) {
    console.log('📱 Semitono móvil aplicado:', {
      valorSlider: desired,
      radioOriginal: baseDotRadius.toFixed(2),
      radioMóvil: dotRadius.toFixed(2),
      reducción: `${((1 - dotRadius/baseDotRadius) * 100).toFixed(0)}%`
    });
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);


  let dotsDrawn = 0;
  let totalTested = 0;

  // Usar el test de inclusión corregido para todas las densidades
  for (let y = spacing / 2; y < ch; y += spacing) {
    for (let x = spacing / 2; x < cw; x += spacing) {
      totalTested++;

      // Test de inclusión: convertir coordenadas de pantalla a coordenadas del SVG
      const svgX = (x - tx) / scale;
      const svgY = (y - ty) / scale;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform para el test
      const inside = ctx.isPointInPath(svgPath, svgX, svgY);
      ctx.restore();

      if (inside) {
        // Obtener datos estables del punto (cacheados)
        const pointData = getStablePointData(x, y, ctx, scale, tx, ty, dotRadius);

        // Añadir efecto de hover
        const hoverScale = getHoverScale(x, y);

        // Calcular radio final usando valores estables
        let finalRadius;
        if (hoverScale > 1.01) {
          // Durante hover: usar solo valores cacheados estables
          finalRadius = pointData.adjustedRadius * hoverScale;
        } else {
          // Sin hover: usar variación orgánica cacheada
          finalRadius = pointData.adjustedRadius * pointData.variation;
        }

        // Solo dibujar si el radio es significativo
        if (finalRadius > 0.8) {
          // Dibujar punto recortado por el contorno del SVG
          ctx.save();

          // Crear máscara del SVG para recortar el punto
          ctx.translate(tx, ty);
          ctx.scale(scale, scale);
          ctx.clip(svgPath);

          // Volver a coordenadas de pantalla para dibujar el punto
          ctx.scale(1 / scale, 1 / scale);
          ctx.translate(-tx, -ty);

          // Aplicar efecto metálico simplificado si ambos sliders están activos
          if (metallicIntensity > 0) {
            // Crear reflejo metálico simple para puntos
            const reflectIntensity = metallicIntensity / 100;
            const angle = Math.PI / 4; // 45 grados
            const gradientSize = finalRadius * 2;

            const gradient = ctx.createLinearGradient(
              x - gradientSize * Math.cos(angle),
              y - gradientSize * Math.sin(angle),
              x + gradientSize * Math.cos(angle),
              y + gradientSize * Math.sin(angle)
            );

            // Reflejo metálico sutil
            const baseGray = Math.round(reflectIntensity * 120); // Máximo gris medio
            gradient.addColorStop(0, `rgb(${baseGray + 30}, ${baseGray + 30}, ${baseGray + 30})`);
            gradient.addColorStop(0.5, `rgb(${baseGray}, ${baseGray}, ${baseGray})`);
            gradient.addColorStop(1, `rgb(${Math.max(0, baseGray - 30)}, ${Math.max(0, baseGray - 30)}, ${Math.max(0, baseGray - 30)})`);

            ctx.fillStyle = gradient;
          } else {
            ctx.fillStyle = currentColor;
          }

          // Dibujar el punto con tamaño ajustado
          ctx.beginPath();
          ctx.arc(x, y, finalRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
          dotsDrawn++;
        }
      }
    }
  }

  // Dibujar líneas internas también en modo trama si están activadas
  if (linesIntensity > 0) {
    drawInternalLines(ctx, linesIntensity, scale, tx, ty, animationTime, outlineWidth);
  }

  ctx.restore();

  // Aplicar shader especial también en modo trama (reemplaza otros efectos)
  // Nota: shader5 ya se maneja antes de dibujar los puntos
  if (metallicIntensity >= 80 && filmgrainIntensity >= 80) {
    const specialIntensity = Math.min((metallicIntensity - 80) / 20, (filmgrainIntensity - 80) / 20);
    drawPureShader4(ctx, specialIntensity, animationTime, scale, tx, ty);
  } else {
    // Solo aplicar efectos normales si no está activo ningún shader especial
    if (filmgrainIntensity > 0) {
      drawFilmGrain(ctx, filmgrainIntensity, animationTime, scale, tx, ty);
    }
  }
}

async function loadSVG() {
  const res = await fetch('./assets/Recurso 2.svg');
  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (svg) {
    const vb = svg.getAttribute('viewBox');
    if (vb) {
      const parts = vb.split(/\s+/).map(parseFloat);
      if (parts.length === 4) {
        viewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
      }
    }

    // Limpiar cache de puntos al cargar nuevo SVG
    pointCache.clear();

    // El nuevo SVG tiene múltiples paths, necesitamos combinarlos
    const paths = svg.querySelectorAll('path');
    if (paths.length > 0) {
      svgPath = new Path2D();
      paths.forEach(pathEl => {
        const d = pathEl.getAttribute('d');
        if (d) {
          svgPath.addPath(new Path2D(d));
        }
      });
    }
  }
}

// Función para cargar los logos PNG
async function loadLogos() {
  try {
    // Cargar logo negro (para fondo blanco)
    logoBlack = new Image();
    logoBlack.src = './assets/bisonahashblack.png';

    // Cargar logo blanco (para fondo negro)
    logoWhite = new Image();
    logoWhite.src = './assets/bisionahashwhite.png';

    // Esperar a que ambas imágenes se carguen
    await Promise.all([
      new Promise((resolve) => {
        logoBlack.onload = resolve;
        logoBlack.onerror = () => {
          console.error('Error cargando logo negro');
          resolve();
        };
      }),
      new Promise((resolve) => {
        logoWhite.onload = resolve;
        logoWhite.onerror = () => {
          console.error('Error cargando logo blanco');
          resolve();
        };
      })
    ]);

    console.log('Logos cargados exitosamente');
  } catch (error) {
    console.error('Error cargando logos:', error);
  }
}

function startAnimationLoop() {
  if (!isAnimating) {
    isAnimating = true;
    animationLoop();
  }
}

function stopAnimationLoop() {
  isAnimating = false;
}

function shouldAnimate() {
  return parseInt(metallicInput.value, 10) > 0 || parseInt(watercolorInput.value, 10) > 0 || (filmgrainInput && parseInt(filmgrainInput.value, 10) > 0);
}

function animationLoop() {
  if (isAnimating || shouldAnimate()) {
    draw();
    requestAnimationFrame(animationLoop);
  }
}

function init() {
  resizeCanvas();


  // Cargar SVG y logos en paralelo
  Promise.all([loadSVG(), loadLogos()]).then(() => {
    // Inicializar shader si está disponible
    if (window.shaderWhirls && typeof window.shaderWhirls.getCanvas === 'function') {
      try { window.shaderWhirls.getCanvas(); } catch (e) { }
    }
    draw();
    // Iniciar animación si el efecto metálico está activo
    if (shouldAnimate()) {
      startAnimationLoop();
    }
  });

  // Event listeners
  densityInput.addEventListener('input', () => {
    // Limpiar cache cuando cambia la densidad
    pointCache.clear();
    draw();
  });

  metallicInput.addEventListener('input', () => {
    draw();
    // Controlar animación basada en el efecto metálico
    if (shouldAnimate()) {
      startAnimationLoop();
    } else {
      stopAnimationLoop();
    }
  });

  linesInput.addEventListener('input', draw);
  outlineInput.addEventListener('input', draw);
  watercolorInput.addEventListener('input', () => {
    draw();
    if (shouldAnimate()) {
      startAnimationLoop();
    } else {
      stopAnimationLoop();
    }
  });


  if (filmgrainInput) {
    filmgrainInput.addEventListener('input', () => {
      draw();
      if (shouldAnimate()) {
        startAnimationLoop();
      } else {
        stopAnimationLoop();
      }
    });
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
    if (!isAnimating) draw();
  });

  // Mouse tracking para efecto hover
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;

    if (!isAnimating) {
      startAnimationLoop();
    }
  });

  // Parar animación cuando el mouse sale del canvas
  canvas.addEventListener('mouseleave', () => {
    setTimeout(() => {
      stopAnimationLoop();
      draw(); // Dibujar estado final sin hover
    }, 100);
  });
}

// Función para actualizar el progreso visual de los sliders
function updateSliderProgress() {
  const sliders = [densityInput, metallicInput, linesInput, outlineInput, watercolorInput, filmgrainInput].filter(Boolean);

  sliders.forEach(slider => {
    if (slider) {
      const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
      slider.style.setProperty('--progress', `${value}%`);
    }
  });
}

// Inicializar progreso de sliders
function initSliderProgress() {
  updateSliderProgress();

  // Añadir event listeners para actualizar progreso
  [densityInput, metallicInput, linesInput, outlineInput, watercolorInput, filmgrainInput].filter(Boolean).forEach(slider => {
    if (slider) {
      slider.addEventListener('input', updateSliderProgress);
    }
  });
}

// Funciones para los botones
function exportCanvas() {
  try {
    // Mostrar diálogo de selección de formato
    const isDarkTheme = document.body.classList.contains('dark-theme');
    const backgroundText = isDarkTheme ? "fondo negro" : "fondo claro";

    // Detectar dispositivo móvil para mostrar información relevante
    const isMobileForPrompt = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    const jpgResolution = isMobileForPrompt ? "4000x4000px" : "3200x3200px";
    const qualityNote = isMobileForPrompt ? " (calidad optimizada para móvil)" : "";

    const format = prompt(
      "Selecciona el formato de exportación:\n\n" +
      `1 - JPG (${jpgResolution}, ${backgroundText}, archivo más pequeño${qualityNote})\n` +
      "2 - PNG (alta resolución, fondo transparente, mayor calidad)\n\n" +
      "Escribe 1 o 2:",
      "1"
    );

    if (format === null) return; // Usuario canceló

    const isJPG = format === "1";
    const isPNG = format === "2";

    if (!isJPG && !isPNG) {
      alert("Formato no válido. Usa 1 para JPG o 2 para PNG.");
      return;
    }

    // Capturar el canvas actual en tiempo real
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;
    const { scale, tx, ty } = getTransformToFit();

    // Calcular área del SVG en pantalla
    const svgScreenWidth = viewBox.w * scale;
    const svgScreenHeight = viewBox.h * scale;
    const svgScreenX = tx + viewBox.x * scale;
    const svgScreenY = ty + viewBox.y * scale;

    // Detectar si es dispositivo móvil para mejorar calidad
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;

    // Crear canvas de exportación
    const exportCanvas = document.createElement('canvas');
    const exportCtx = exportCanvas.getContext('2d');

    // Configurar contexto para mejor calidad en móviles
    if (isMobile) {
      exportCtx.imageSmoothingEnabled = true;
      exportCtx.imageSmoothingQuality = 'high';
    }

    // Para JPG: tamaño optimizado según dispositivo
    if (isJPG) {
      // En móviles, usar mayor resolución para mejor calidad
      const baseSize = isMobile ? 4000 : 3200;
      exportCanvas.width = baseSize;
      exportCanvas.height = baseSize;
    } else {
      // Para PNG mantener el sistema original de alta resolución
      const exportScale = 5; // 5x resolución para máxima calidad
      const margin = 60; // Margen más grande para contornos gruesos

      // Añadir padding extra para contornos y efectos
      const outlineWidth = parseInt(outlineInput.value, 10);
      const metallicIntensity = parseInt(metallicInput.value, 10);

      let extraPadding = Math.max(outlineWidth * 4, 30); // Padding base para túnel
      if (metallicIntensity > 0 && outlineWidth > 0) {
        extraPadding += outlineWidth * 6; // Espacio extra para resplandor metálico
      }
      extraPadding = Math.max(extraPadding, 50); // Mínimo para asegurar captura completa

      exportCanvas.width = (svgScreenWidth + margin * 2 + extraPadding * 2) * exportScale;
      exportCanvas.height = (svgScreenHeight + margin * 2 + extraPadding * 2) * exportScale;
    }

    // Configurar fondo según formato y tema actual
    if (isJPG) {
      // Usar el color de fondo correspondiente al tema actual
      const isDarkTheme = document.body.classList.contains('dark-theme');
      exportCtx.fillStyle = isDarkTheme ? '#000000' : '#fafafa';
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    if (isJPG) {
      // Para JPG: escalar y centrar el SVG con dimensiones optimizadas según dispositivo
      exportCtx.save();

      // Usar dimensiones dinámicas basadas en el tamaño del canvas
      const canvasSize = exportCanvas.width; // 4000px en móviles, 3200px en desktop
      
      // Usar el mismo ratio de margen para móvil y desktop para consistencia
      const marginRatio = 0.125; // Margen consistente para ambos dispositivos

      // Calcular escala para que el SVG quepa con margen optimizado
      const targetWidth = canvasSize * (1 - marginRatio * 2); // Margen proporcional
      const targetHeight = canvasSize * 0.65; // Más espacio vertical para el texto
      const svgScale = Math.min(targetWidth / svgScreenWidth, targetHeight / svgScreenHeight);

      // Centrar el SVG tanto horizontal como verticalmente
      const scaledWidth = svgScreenWidth * svgScale;
      const scaledHeight = svgScreenHeight * svgScale;
      
      // Centrado horizontal perfecto - igual para móvil y desktop
      const offsetX = (canvasSize - scaledWidth) / 2;
      
      // Centrado vertical consistente - igual para móvil y desktop
      const availableHeight = canvasSize * 0.85; // 85% del canvas para el SVG
      const offsetY = (availableHeight - scaledHeight) / 2 + canvasSize * 0.075; // Centrado consistente

      // Calcular área expandida para capturar efectos de contorno
      const outlineWidth = parseInt(outlineInput.value, 10);
      const metallicIntensity = parseInt(metallicInput.value, 10);
      let effectPadding = 0;

      if (outlineWidth > 0) {
        effectPadding = outlineWidth * 4; // Padding base para túnel
        if (metallicIntensity > 0) {
          effectPadding += outlineWidth * 6; // Espacio extra para resplandor metálico
        }
      }

      // Área de captura expandida
      const sourceX = Math.max(0, (svgScreenX - effectPadding) * dpr);
      const sourceY = Math.max(0, (svgScreenY - effectPadding) * dpr);
      const sourceWidth = Math.min(canvas.width - sourceX, (svgScreenWidth + effectPadding * 2) * dpr);
      const sourceHeight = Math.min(canvas.height - sourceY, (svgScreenHeight + effectPadding * 2) * dpr);

      // Dibujar el SVG escalado con área expandida para efectos
      exportCtx.drawImage(
        canvas,
        sourceX, sourceY, // Posición fuente expandida
        sourceWidth, sourceHeight, // Tamaño fuente expandido
        offsetX - effectPadding * svgScale, offsetY - effectPadding * svgScale, // Posición destino ajustada
        (sourceWidth / dpr) * svgScale, (sourceHeight / dpr) * svgScale // Tamaño destino escalado
      );

      // Añadir logo PNG en lugar del texto "#bisiona"
      const isDarkTheme = document.body.classList.contains('dark-theme');
      const logoToUse = isDarkTheme ? logoWhite : logoBlack;

      if (logoToUse && logoToUse.complete) {
        // Calcular tamaño del logo proporcional al canvas - consistente para móvil y desktop
        const logoHeight = canvasSize * 0.0375; // Tamaño consistente: 3.75% del canvas
        const logoWidth = (logoToUse.width / logoToUse.height) * logoHeight;

        // Posicionar el logo hacia la derecha de la imagen (alineado a la derecha)
        const marginFromEdge = canvasSize * 0.03125; // 3.125% del canvas desde el borde
        const logoX = canvasSize - marginFromEdge - logoWidth;
        
        // Posicionamiento vertical del logo - consistente para móvil y desktop
        const logoSpacing = canvasSize * 0.0375; // Espacio consistente
        const logoY = offsetY + scaledHeight + logoSpacing - logoHeight / 2;

        exportCtx.drawImage(logoToUse, logoX, logoY, logoWidth, logoHeight);
      } else {
        // Fallback: usar texto si el logo no está disponible
        const textColor = isDarkTheme ? '#ffffff' : '#333333';
        exportCtx.fillStyle = textColor;
        const fontSize = canvasSize * 0.05; // 5% del canvas - consistente
        exportCtx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
        exportCtx.textAlign = 'right';
        exportCtx.textBaseline = 'middle';

        const marginFromEdge = canvasSize * 0.03125; // 3.125% del canvas desde el borde
        const textX = canvasSize - marginFromEdge;
        const textY = offsetY + scaledHeight + (canvasSize * 0.0375); // Espacio proporcional debajo del SVG
        exportCtx.fillText('#bisiona', textX, textY);
      }

      exportCtx.restore();
    } else {
      // Para PNG: mantener la lógica original de alta resolución
      const exportScale = 5;
      const margin = 60;
      const outlineWidth = parseInt(outlineInput.value, 10);
      const extraPadding = Math.max(outlineWidth * 2, 20);

      exportCtx.save();
      exportCtx.scale(exportScale, exportScale);
      
      // Centrar mejor el contenido en el canvas de exportación
      const canvasWidth = exportCanvas.width / exportScale;
      const canvasHeight = exportCanvas.height / exportScale;
      const contentWidth = svgScreenWidth + extraPadding * 2;
      const contentHeight = svgScreenHeight + extraPadding * 2;
      
      // Calcular offset para centrar
      const centerOffsetX = (canvasWidth - contentWidth) / 2;
      const centerOffsetY = (canvasHeight - contentHeight) / 2;
      
      exportCtx.translate(centerOffsetX + extraPadding, centerOffsetY + extraPadding);

      // Calcular área expandida para capturar contornos
      const captureX = Math.max(0, (svgScreenX - extraPadding) * dpr);
      const captureY = Math.max(0, (svgScreenY - extraPadding) * dpr);
      const captureWidth = Math.min(canvas.width - captureX, (svgScreenWidth + extraPadding * 2) * dpr);
      const captureHeight = Math.min(canvas.height - captureY, (svgScreenHeight + extraPadding * 2) * dpr);

      // Dibujar la región expandida del canvas que contiene el SVG y sus contornos
      exportCtx.drawImage(
        canvas,
        captureX, captureY, // Posición fuente expandida
        captureWidth, captureHeight, // Tamaño fuente expandido
        -extraPadding, -extraPadding, // Posición destino ajustada
        captureWidth / dpr, captureHeight / dpr // Tamaño destino
      );

      exportCtx.restore();
    }

    // Convertir y descargar según formato seleccionado
    const link = document.createElement('a');
    const timestamp = Date.now();

    if (isJPG) {
      link.download = `bisiona-export-${timestamp}.jpg`;
      // Usar máxima calidad en móviles para compensar la pantalla más pequeña
      const jpegQuality = isMobile ? 0.99 : 0.98;
      link.href = exportCanvas.toDataURL('image/jpeg', jpegQuality);
    } else {
      link.download = `bisiona-export-${timestamp}.png`;
      link.href = exportCanvas.toDataURL('image/png'); // Máxima calidad PNG
    }

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const formatName = isJPG ? 'JPG' : 'PNG';
    console.log(`Canvas exportado exitosamente como ${formatName}`);

    // Feedback visual
    const exportBtn = document.getElementById('exportBtn');
    const originalText = exportBtn.textContent;
    exportBtn.textContent = `✓ Exportado ${formatName}`;
    exportBtn.style.color = '#4285f4';

    setTimeout(() => {
      exportBtn.textContent = originalText;
      exportBtn.style.color = '';
    }, 2000);

  } catch (error) {
    console.error('Error al exportar:', error);
    alert('Error al exportar la imagen. Por favor, inténtalo de nuevo.');
  }
}

// Variables para grabación del canvas
let canvasRecorder = null;
let recordedFrames = [];
let isRecording = false;
let recordingInterval = null;
let recordingStartTime = 0;

function createCanvasRecording() {
  try {
    // Crear canvas de alta resolución para grabación
    const recordingCanvas = document.createElement('canvas');
    const recordingCtx = recordingCanvas.getContext('2d');

    // Configurar resolución HD con transparencia
    const hdWidth = 1920;
    const hdHeight = 1080;
    recordingCanvas.width = hdWidth;
    recordingCanvas.height = hdHeight;

    // Configurar para preservar transparencia
    recordingCtx.globalCompositeOperation = 'source-over';

    return { recordingCanvas, recordingCtx, hdWidth, hdHeight };
  } catch (error) {
    console.error('Error creando canvas de grabación:', error);
    return null;
  }
}

function captureCanvasFrame(recordingCanvas, recordingCtx, hdWidth, hdHeight) {
  try {
    // Limpiar con transparencia
    recordingCtx.clearRect(0, 0, hdWidth, hdHeight);

    // Calcular escala para HD manteniendo aspecto
    const canvasAspect = canvas.width / canvas.height;
    const hdAspect = hdWidth / hdHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (canvasAspect > hdAspect) {
      // Canvas más ancho - ajustar por ancho
      drawWidth = hdWidth;
      drawHeight = hdWidth / canvasAspect;
      offsetX = 0;
      offsetY = (hdHeight - drawHeight) / 2;
    } else {
      // Canvas más alto - ajustar por alto
      drawHeight = hdHeight;
      drawWidth = hdHeight * canvasAspect;
      offsetX = (hdWidth - drawWidth) / 2;
      offsetY = 0;
    }

    // Dibujar canvas principal escalado en HD
    recordingCtx.drawImage(canvas, offsetX, offsetY, drawWidth, drawHeight);

    // Capturar frame como PNG con transparencia
    return recordingCanvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error capturando frame:', error);
    return null;
  }
}

async function startCanvasRecording() {
  try {
    const recordingSetup = createCanvasRecording();
    if (!recordingSetup) {
      throw new Error('No se pudo crear el canvas de grabación');
    }

    const { recordingCanvas, recordingCtx, hdWidth, hdHeight } = recordingSetup;

    recordedFrames = [];
    recordingStartTime = Date.now();
    isRecording = true;

    // Capturar frames a 30 FPS estándar para compatibilidad con After Effects
    const captureFPS = 30;
    recordingInterval = setInterval(() => {
      if (!isRecording) return;

      const frameData = captureCanvasFrame(recordingCanvas, recordingCtx, hdWidth, hdHeight);
      if (frameData) {
        recordedFrames.push({
          data: frameData,
          timestamp: Date.now() - recordingStartTime
        });
      }

      // Limitar a 15 segundos para mayor duración útil
      if (recordedFrames.length > 450) { // 30fps * 15s = 450 frames
        stopCanvasRecording();
      }
    }, 1000 / captureFPS); // 30 FPS estándar para After Effects

    return true;
  } catch (error) {
    console.error('Error iniciando grabación del canvas:', error);
    return false;
  }
}

function stopCanvasRecording() {
  if (!isRecording) return false;

  isRecording = false;
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }

  if (recordedFrames.length === 0) {
    alert('No se capturaron frames. Inténtalo de nuevo.');
    return false;
  }

  // Crear secuencia PNG para After Effects usando frames capturados
  createAfterEffectsSequence();
  return true;
}

async function createVideoFromFrames() {
  try {
    // Crear canvas temporal para el video en alta resolución
    const videoCanvas = document.createElement('canvas');
    const videoCtx = videoCanvas.getContext('2d');
    videoCanvas.width = 1920;
    videoCanvas.height = 1080;

    // Configurar MediaRecorder para el canvas optimizado para After Effects
    const stream = videoCanvas.captureStream(30); // 30 FPS estándar para mejor compatibilidad con AE

    // Configuración optimizada para After Effects
    const options = {
      mimeType: 'video/mp4;codecs=avc1.42E01E', // H.264 Baseline Profile para máxima compatibilidad
      videoBitsPerSecond: 15000000, // 15 Mbps para calidad profesional
      bitsPerSecond: 15000000
    };

    // Fallback para compatibilidad con diferentes navegadores
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      // Intentar con AVC1 (H.264)
      options.mimeType = 'video/mp4;codecs=avc1';
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        // Fallback a MP4 genérico
        options.mimeType = 'video/mp4';
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          // Fallback directo: crear secuencia PNG para After Effects
          console.log('Navegador no soporta MP4, usando secuencia PNG para After Effects');
          createAfterEffectsSequence();
          return;
        }
      }
    }

    const mediaRecorder = new MediaRecorder(stream, options);
    const chunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: options.mimeType });
      const url = URL.createObjectURL(blob);

      // Determinar extensión basada en el formato usado
      let fileExtension = '.mov';
      if (options.mimeType.includes('mp4')) {
        fileExtension = '.mov'; // MP4 es compatible con MOV
      } else if (options.mimeType.includes('webm')) {
        fileExtension = '.webm';
      }

      const link = document.createElement('a');
      link.href = url;
      link.download = `bisiona-canvas-recording-${Date.now()}${fileExtension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
      console.log(`Grabación del canvas completada en formato ${fileExtension.toUpperCase()}`);
    };

    mediaRecorder.start();

    // Reproducir frames capturados optimizado para After Effects
    let frameIndex = 0;
    const targetFPS = 30; // Coincidir con el stream FPS estándar
    const playbackInterval = setInterval(() => {
      if (frameIndex >= recordedFrames.length) {
        clearInterval(playbackInterval);
        mediaRecorder.stop();
        return;
      }

      const frame = recordedFrames[frameIndex];
      const img = new Image();
      img.onload = () => {
        // Limpiar con fondo transparente para After Effects
        videoCtx.clearRect(0, 0, 1920, 1080);
        // Configuración optimizada para After Effects
        videoCtx.imageSmoothingEnabled = true;
        videoCtx.imageSmoothingQuality = 'high';
        // Preservar canal alpha para composición en AE
        videoCtx.globalCompositeOperation = 'source-over';
        videoCtx.drawImage(img, 0, 0);
      };
      img.src = frame.data;
      frameIndex++;
    }, 1000 / targetFPS);

  } catch (error) {
    console.error('Error creando video:', error);
    // Fallback: crear ZIP con imágenes
    createImageSequence();
  }
}

function createAnimatedGIF() {
  // Fallback: crear secuencia PNG para After Effects
  alert('Tu navegador no soporta grabación de video. Se creará una secuencia PNG optimizada para After Effects.');
  createAfterEffectsSequence();
}

function createAfterEffectsSequence() {
  try {
    // Crear ZIP con secuencia PNG optimizada para After Effects
    const zip = new JSZip();
    const timestamp = Date.now();
    const projectName = `bisiona_ae_sequence_${timestamp}`;

    // Crear carpeta para la secuencia
    const sequenceFolder = zip.folder(projectName);

    recordedFrames.forEach((frame, index) => {
      // Nomenclatura estándar para After Effects: nombre_000001.png
      const frameNumber = String(index + 1).padStart(6, '0');
      const fileName = `${projectName}_${frameNumber}.png`;
      const base64Data = frame.data.split(',')[1];
      sequenceFolder.file(fileName, base64Data, { base64: true });
    });

    // Crear archivo de información para After Effects
    const aeInfo = `After Effects Import Instructions:

Project: ${projectName}
Frames: ${recordedFrames.length}
Frame Rate: 30 fps
Duration: ${(recordedFrames.length / 30).toFixed(2)} seconds
Resolution: 1920x1080
Format: PNG with Alpha Channel

IMPORT STEPS:
1. Open After Effects
2. File > Import > File...
3. Navigate to the extracted folder
4. Select the FIRST PNG file (${projectName}_000001.png)
5. Check "PNG Sequence" in the import dialog
6. Set frame rate to 30 fps
7. Click Import

The sequence will import as a single composition-ready clip with full transparency support.

Created: ${new Date().toLocaleString()}
`;

    sequenceFolder.file('README_AfterEffects.txt', aeInfo);

    // Generar y descargar el ZIP
    zip.generateAsync({ type: 'blob' }).then((content) => {
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(
        `✅ Secuencia PNG para After Effects creada exitosamente!\n\n` +
        `📁 Archivo: ${projectName}.zip\n` +
        `🎬 Frames: ${recordedFrames.length}\n` +
        `⏱️ Duración: ${(recordedFrames.length / 30).toFixed(2)} segundos\n` +
        `📐 Resolución: 1920x1080 con transparencia\n\n` +
        `📋 Instrucciones incluidas en el archivo README_AfterEffects.txt`
      );
    });

  } catch (error) {
    console.error('Error creando secuencia para After Effects:', error);
    // Fallback: usar la función original
    createImageSequence();
  }
}

function createImageSequence() {
  try {
    // Crear ZIP con todas las imágenes capturadas (función de respaldo)
    const zip = new JSZip();

    recordedFrames.forEach((frame, index) => {
      const frameNumber = String(index).padStart(4, '0');
      const base64Data = frame.data.split(',')[1];
      zip.file(`frame_${frameNumber}.png`, base64Data, { base64: true });
    });

    zip.generateAsync({ type: 'blob' }).then((content) => {
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bisiona-frames-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`Se han guardado ${recordedFrames.length} frames como secuencia de imágenes PNG en un archivo ZIP.`);
    });

  } catch (error) {
    console.error('Error creando secuencia de imágenes:', error);
    // Último recurso: descargar solo el primer frame
    if (recordedFrames.length > 0) {
      const link = document.createElement('a');
      link.href = recordedFrames[0].data;
      link.download = `bisiona-snapshot-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert('Se ha guardado una captura de pantalla en PNG con transparencia.');
    }
  }
}

function saveProject() {
  try {
    const saveBtn = document.getElementById('saveBtn');

    if (isRecording) {
      // Detener grabación
      if (stopCanvasRecording()) {
        saveBtn.textContent = '✓ Procesando...';
        saveBtn.style.color = '#4285f4';

        setTimeout(() => {
          saveBtn.textContent = 'Guardar';
          saveBtn.style.color = '';
        }, 3000);
      }
    } else {
      // Iniciar grabación del canvas
      saveBtn.textContent = 'Iniciando...';
      saveBtn.style.color = '#ff9800';

      startCanvasRecording().then(success => {
        if (success) {
          saveBtn.textContent = '⏹ Detener Grabación';
          saveBtn.style.color = '#f44336';

          // Mostrar instrucciones
          alert(
            'Grabación para After Effects iniciada.\n\n' +
            'Especificaciones:\n' +
            '• Resolución: 1920x1080 a 30fps\n' +
            '• Formato: Secuencia PNG con transparencia\n' +
            '• Duración máxima: 15 segundos (450 frames)\n' +
            '• Canal alpha completo para composición\n' +
            '• 100% compatible con After Effects\n\n' +
            'Instrucciones:\n' +
            '• Mueve los controles para crear animación\n' +
            '• Haz clic en "Detener Grabación" cuando termines\n' +
            '• Se descargará un ZIP con secuencia PNG\n' +
            '• En AE: File > Import > File... > selecciona el primer PNG\n' +
            '• Marca "PNG Sequence" en el diálogo de importación'
          );
        } else {
          saveBtn.textContent = 'Guardar';
          saveBtn.style.color = '';
        }
      });
    }

  } catch (error) {
    console.error('Error en grabación:', error);
    alert('Error al manejar la grabación. Por favor, inténtalo de nuevo.');

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = 'Guardar';
    saveBtn.style.color = '';
    isRecording = false;
  }
}

// Función para cambiar color
function changeColor(color) {
  currentColor = color;

  // Cambiar tema y logos cuando se selecciona blanco
  const logoImg = document.querySelector('.logo');
  const logoPicassoImg = document.querySelector('.logo-picasso');

  if (color === '#ffffff') {
    document.body.classList.add('dark-theme');
    if (logoImg) {
      logoImg.src = './assets/bisionaboldwhite.png';
    }
    if (logoPicassoImg) {
      logoPicassoImg.src = './assets/logopicassoblanco.png';
    }
  } else {
    document.body.classList.remove('dark-theme');
    if (logoImg) {
      logoImg.src = './assets/bisionabold.png';
    }
    if (logoPicassoImg) {
      logoPicassoImg.src = './assets/logopicasso.png';
    }
  }

  // Limpiar cache de puntos para que se redibuje con el nuevo color
  pointCache.clear();
  draw();
}

// Inicializar botones
function initButtons() {
  const exportBtn = document.getElementById('exportBtn');
  const saveBtn = document.getElementById('saveBtn');
  const blackBtn = document.getElementById('blackBtn');
  const blueBtn = document.getElementById('blueBtn');
  const whiteBtn = document.getElementById('whiteBtn');

  if (exportBtn) {
    exportBtn.addEventListener('click', exportCanvas);
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', saveProject);
  }

  // Botones de color
  if (blackBtn) {
    blackBtn.addEventListener('click', () => changeColor('#000000'));
  }

  if (blueBtn) {
    blueBtn.addEventListener('click', () => changeColor('#2B43FF'));
  }

  if (whiteBtn) {
    whiteBtn.addEventListener('click', () => changeColor('#ffffff'));
  }
}

// ========================================
// DETECCIÓN AUTOMÁTICA DE MÓVIL Y AJUSTES
// ========================================

// Función para detectar dispositivos móviles
function isMobileDevice() {
  return window.innerWidth <= 768 || 
         /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         ('ontouchstart' in window) || 
         (navigator.maxTouchPoints > 0);
}

// Función para ajustar el radio de los círculos en móvil
function getMobileDotRadius(dotRadius, desired) {
  if (!isMobileDevice() || desired <= 1) {
    return dotRadius; // Desktop o modo sólido: sin cambios
  }
  
  // En móvil, hacer círculos más pequeños para evitar superposiciones
  const mobileReduction = 0.6; // Reducir a 60% del tamaño original
  return dotRadius * mobileReduction;
}

// Función para ajustar la intensidad del ruido en móvil
function getMobileFilmgrainIntensity(originalIntensity) {
  if (!isMobileDevice() || originalIntensity === 0) {
    return originalIntensity; // Desktop o ruido desactivado: sin cambios
  }
  
  // En móvil, hacer el ruido más intenso
  const mobileBoost = 25; // Añadir 25 puntos base
  const mobileMultiplier = 1.4; // Multiplicar por 1.4
  
  const boostedIntensity = originalIntensity + mobileBoost;
  const finalIntensity = boostedIntensity * mobileMultiplier;
  
  return Math.min(100, finalIntensity); // Limitar al máximo del slider
}

// Función para ajustar el tamaño de las partículas de ruido en móvil
function getMobileGrainSize(baseSize) {
  if (!isMobileDevice()) {
    return baseSize; // Desktop: tamaño original
  }
  
  // En móvil, hacer las partículas más grandes para mejor visibilidad
  const mobileSizeMultiplier = 1.8; // Aumentar 80% el tamaño
  return baseSize * mobileSizeMultiplier;
}

// Función para mostrar indicador de modo móvil
function initMobileIndicator() {
  if (isMobileDevice()) {
    console.log('📱 MODO MÓVIL DETECTADO - Efectos optimizados:', {
      semitono: 'Valor 0 = sólido, valores 1+ = círculos más pequeños (40% reducción)',
      ruido: 'Intensidad aumentada (+25 base, x1.4 multiplicador) + partículas 80% más grandes',
      antiSuperposicion: 'Espaciado inteligente activado'
    });
    
    // Mostrar tooltip temporal
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(43, 67, 255, 0.9);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      pointer-events: none;
    `;
    tooltip.textContent = '📱 Móvil: Efectos optimizados';
    document.body.appendChild(tooltip);
    
    // Remover tooltip después de 3 segundos
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }, 3000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    initSliderProgress();
    initButtons();
    initMobileIndicator(); // Inicializar indicador móvil
  });
} else {
  init();
  initSliderProgress();
  initButtons();
  initMobileIndicator(); // Inicializar indicador móvil
}
