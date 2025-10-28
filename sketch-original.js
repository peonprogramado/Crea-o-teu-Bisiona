const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const densityInput = document.getElementById('density');
const metallicInput = document.getElementById('metallic');

let svgPath = null;
let viewBox = { x: 0, y: 0, w: 831.77, h: 1096.26 };
let lastDesired = 1;
const anim = { active: false, start: 0, dur: 90 };
let mouse = { x: 0, y: 0 };
let isAnimating = false;
let pointCache = new Map(); // Cache para valores estables de puntos
let animationTime = 0; // Tiempo para animación del chrome

function getEdgeProximity(x, y, ctx, scale, tx, ty) {
  // Detectar proximidad al borde muestreando puntos alrededor
  const sampleRadius = 2;
  const samples = 8;
  let insideCount = 0;

  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const sampleX = ((x + Math.cos(angle) * sampleRadius) - tx) / scale;
    const sampleY = ((y + Math.sin(angle) * sampleRadius) - ty) / scale;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (ctx.isPointInPath(svgPath, sampleX, sampleY)) {
      insideCount++;
    }
    ctx.restore();
  }

  return insideCount / samples; // 0 = cerca del borde, 1 = centro
}

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


function resizeCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const parentW = window.innerWidth;
  const parentH = window.innerHeight;
  canvas.style.width = parentW + 'px';
  canvas.style.height = parentH + 'px';
  canvas.width = Math.floor(parentW * dpr);
  canvas.height = Math.floor(parentH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getTransformToFit() {
  const padding = 20;
  const cw = canvas.width / (window.devicePixelRatio || 1);
  const ch = canvas.height / (window.devicePixelRatio || 1);
  const scale = Math.min(
    (cw - padding * 2) / viewBox.w,
    (ch - padding * 2) / viewBox.h
  );
  const tx = (cw - viewBox.w * scale) / 2 - viewBox.x * scale;
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

  // Actualizar tiempo de animación
  animationTime = performance.now();

  // Si la densidad es 1, dibujar sólido
  if (desired <= 1) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);


    // Aplicar efecto metálico al sólido si está activado
    if (metallicIntensity > 0) {
      const centerX = viewBox.x + viewBox.w / 2;
      const centerY = viewBox.y + viewBox.h / 2;
      const radius = Math.max(viewBox.w, viewBox.h);
      ctx.fillStyle = createMetallicGradient(ctx, centerX, centerY, radius, metallicIntensity, animationTime);
    } else {
      ctx.fillStyle = '#000';
    }

    ctx.fill(svgPath);


    ctx.restore();
    return;
  }

  // Para densidad > 1: Solo puntos de trama (sin fondo)

  // Calcular espaciado basado en densidad con más separación
  const svgSize = Math.max(viewBox.w, viewBox.h);
  const screenSize = Math.min(cw, ch);
  const baseSpacing = (screenSize / 15) * (scale * svgSize / screenSize); // Aumentado de /25 a /15 para más separación
  const spacing = baseSpacing / Math.sqrt(desired);
  const dotRadius = Math.max(1, 14 - desired * 1.5);

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

          // Aplicar efecto metálico a los puntos si está activado
          if (metallicIntensity > 0) {
            ctx.fillStyle = createMetallicGradient(ctx, x, y, finalRadius, metallicIntensity, animationTime);
          } else {
            ctx.fillStyle = '#000'; // Puntos negros normales
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


  ctx.restore();
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
  const metallicIntensity = parseInt(metallicInput.value, 10);
  return metallicIntensity > 0; // Animar si hay efecto metálico
}

function animationLoop() {
  if (isAnimating || shouldAnimate()) {
    draw();
    requestAnimationFrame(animationLoop);
  }
}

function init() {
  resizeCanvas();
  loadSVG().then(() => {
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
    if (!isAnimating) draw();
  });

  metallicInput.addEventListener('input', () => {
    if (shouldAnimate() && !isAnimating) {
      startAnimationLoop();
    } else if (!shouldAnimate() && !isAnimating) {
      draw();
    }
  });



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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
