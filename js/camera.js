// ===== CAMERA MODULE — 100% Client-Side Analysis (No server calls during session) =====
// Analysis is done entirely in the browser via pixel diff — instant, no waiting
// Flask is only called ONCE at the end to save results

const API_BASE = 'http://localhost:5000/api';
const CAMERA_CONFIG = {
  SESSION_DURATION:  30,    // seconds
  TICK_INTERVAL:     200,   // ms — how often we sample movement (5x/sec, instant)
  MAX_FRAMES_STORED: 150,
};

// ===== STATE =====
let stream         = null;
let tickInterval   = null;
let sessionTimer   = null;
let sessionActive  = false;
let secondsLeft    = CAMERA_CONFIG.SESSION_DURATION;
let frameSamples   = [];
let prevPixels     = null;

// ===== START CAMERA (instant — no server needed) =====
async function startCameraStream(videoEl) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });
    videoEl.srcObject = stream;
    videoEl.play();
    return true;
  } catch (err) {
    console.error('Camera error:', err);
    return false;
  }
}

function stopCameraStream() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

// ===== INSTANT PIXEL-DIFF MOVEMENT (pure JS, no server) =====
function sampleFrame(videoEl) {
  if (!videoEl.videoWidth) return { movement: 0, brightness: 128 };

  const W = 80, H = 60;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  // Grayscale array
  const gray = new Float32Array(W * H);
  let totalBright = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
    totalBright += gray[j];
  }
  const brightness = totalBright / gray.length;

  // Movement = mean absolute diff from previous frame
  let movement = 0;
  if (prevPixels) {
    let diff = 0;
    for (let i = 0; i < gray.length; i++) diff += Math.abs(gray[i] - prevPixels[i]);
    movement = diff / gray.length;
  }
  prevPixels = gray;

  return { movement: parseFloat(movement.toFixed(2)), brightness: parseFloat(brightness.toFixed(1)) };
}

// ===== LOCAL CLASSIFICATION (no server needed) =====
function computeLiveIndicator() {
  if (frameSamples.length < 10) return 'analyzing';
  return classifyCamera(aggregateLocalMetrics());
}

function aggregateLocalMetrics() {
  const n = frameSamples.length;
  if (!n) return {};
  const avgMovement  = frameSamples.reduce((s, f) => s + f.movement, 0) / n;
  const avgBrightVar = parseFloat(Math.sqrt(
    frameSamples.reduce((s, f) => s + (f.brightness - 128) ** 2, 0) / n
  ).toFixed(2));
  const movements    = frameSamples.map(f => f.movement);
  const variance     = parseFloat(Math.sqrt(
    movements.reduce((s, v) => s + (v - avgMovement) ** 2, 0) / n
  ).toFixed(3));

  return { avgMovement, avgBrightVar, expressionVariance: variance, sampleCount: n };
}

function classifyCamera(m) {
  if (!m || m.sampleCount < 10) return 'analyzing';
  const { avgMovement, expressionVariance } = m;

  // ASD: very still + low variance
  if (avgMovement < 2.5 && expressionVariance < 1.0) return 'autism';

  // ADHD hyperactive: high movement + high variance
  if (avgMovement >= 5.0 && expressionVariance >= 1.5) return 'hyperactive';

  // ADHD attention: mixed signs
  if (avgMovement >= 5.0 || expressionVariance >= 1.5) return 'attention';

  // Borderline ASD
  if (avgMovement < 3.5) return 'autism';

  return 'normal';
}

// ===== SESSION CONTROL =====
function resetSession() {
  frameSamples  = [];
  prevPixels    = null;
  secondsLeft   = CAMERA_CONFIG.SESSION_DURATION;
  sessionActive = false;
}

function getFinalResult() {
  const metrics = aggregateLocalMetrics();
  const level   = classifyCamera(metrics);
  return {
    metrics: {
      avgMovement:        parseFloat((metrics.avgMovement || 0).toFixed(2)),
      avg_movement:       parseFloat((metrics.avgMovement || 0).toFixed(2)),
      expressionVariance: parseFloat((metrics.expressionVariance || 0).toFixed(3)),
      avgNeutral:         parseFloat(Math.max(0, 1 - (metrics.avgMovement || 0) / 8).toFixed(3)),
      avg_neutral:        parseFloat(Math.max(0, 1 - (metrics.avgMovement || 0) / 8).toFixed(3)),
      sampleCount:        metrics.sampleCount || 0,
      sample_count:       metrics.sampleCount || 0
    },
    level,
    frames: frameSamples.slice(-30).map(f => ({
      movement:   f.movement,
      mouth_open: 0,
      eye_open:   0,
      emotions:   { neutral: Math.max(0, 1 - f.movement / 8), active: Math.min(1, f.movement / 8) }
    })),
    date: new Date().toISOString()
  };
}

// ===== SAVE TO SERVER (only at end, once) =====
async function saveSessionToServer(childId, result) {
  const token = sessionStorage.getItem('scba_token');
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/camera/save_session`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ child_id: childId, frames: result.frames })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
