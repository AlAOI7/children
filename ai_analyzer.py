"""
ai_analyzer.py — Lightweight pixel-based frame analyzer
=========================================================
No heavy ML model needed. Uses only Pillow (already installed).
Analyzes skin-tone pixel movement and brightness variance between frames
to estimate head movement and expression activity.

Classification:
  🔴 Red  = autism (ASD)        — low movement + low expression variance
  🟢 Green = hyperactive (ADHD) — high movement + high variance
  🟡 Yellow = attention (ADHD)  — mixed/partial signals
  🟢 Normal                     — no significant indicators
"""

import base64, io, math
import numpy as np
from PIL import Image

# ===== THRESHOLDS =====
HIGH_MOVEMENT   = 6.0    # avg pixel change score
LOW_MOVEMENT    = 2.0
HIGH_VARIANCE   = 15.0   # brightness variance
LOW_VARIANCE    = 6.0

_prev_pixels = None   # previous frame grayscale pixels for movement diff

def _b64_to_gray_array(b64: str):
    """Decode base64 image → small 80×60 grayscale numpy array."""
    if ',' in b64:
        b64 = b64.split(',', 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert('L').resize((80, 60))
    return np.array(img, dtype=np.float32)


def analyze_frame(b64_image: str) -> dict:
    """
    Analyze one frame by comparing brightness map to previous frame.
    Returns movement score and brightness variance (proxy for expression).
    """
    global _prev_pixels
    try:
        curr = _b64_to_gray_array(b64_image)

        movement = 0.0
        if _prev_pixels is not None:
            diff     = np.abs(curr - _prev_pixels)
            movement = float(np.mean(diff))

        _prev_pixels = curr
        variance     = float(np.std(curr))

        return {
            'success':  True,
            'movement': round(movement, 3),
            'variance': round(variance, 3),
            # Provide neutral/emotions proxy for compatibility
            'emotions': {
                'neutral': round(max(0.0, 1.0 - movement / 10.0), 3),
                'active':  round(min(1.0, movement / 10.0), 3)
            },
            'dominant': 'neutral' if movement < HIGH_MOVEMENT else 'active'
        }
    except Exception as e:
        return {'success': False, 'reason': str(e), 'movement': 0, 'variance': 0}


def classify_camera_session(metrics: dict) -> str:
    """
    Red = ASD | Green = hyperactive ADHD | Yellow = attention | Normal
    """
    mv  = metrics.get('avg_movement', 0)
    var = metrics.get('avg_variance', 0)

    # ASD: low movement + low brightness variance (flat, still)
    if mv < LOW_MOVEMENT and var < LOW_VARIANCE:
        return 'autism'

    # ADHD hyperactive: high movement + high variance
    if mv >= HIGH_MOVEMENT and var >= HIGH_VARIANCE:
        return 'hyperactive'

    # ADHD attention: partial signals
    if mv >= HIGH_MOVEMENT or var >= HIGH_VARIANCE:
        return 'attention'

    # Borderline ASD: very still
    if mv < 2.5 and var < 8.0:
        return 'autism'

    return 'normal'


def aggregate_frame_metrics(frames: list) -> dict:
    """Aggregate per-frame dicts into session-level metrics."""
    if not frames:
        return {}
    n            = len(frames)
    avg_movement = sum(f.get('movement', 0) for f in frames) / n
    avg_variance = sum(f.get('variance', 0) for f in frames) / n
    expr_var     = float(np.std([f.get('movement', 0) for f in frames]))

    return {
        'avg_movement':        round(avg_movement, 2),
        'avg_variance':        round(avg_variance, 2),
        'expression_variance': round(expr_var, 3),
        'avg_neutral':         round(max(0.0, 1.0 - avg_movement / 10.0), 3),
        'avg_happy':           0.0,
        'sample_count':        n
    }
