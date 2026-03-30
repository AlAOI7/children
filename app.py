"""
app.py — Flask Backend for ADHD/ASD Diagnostic System
=======================================================
Run:  python app.py
API:  http://localhost:5000/api/...
"""

import os
import json
import datetime
import bcrypt
import jwt
import mysql.connector
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from ai_analyzer import analyze_frame, classify_camera_session, aggregate_frame_metrics

load_dotenv()

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ===== CONFIG =====
DB_CONFIG = {
    "host":               "127.0.0.1",   # use IP not 'localhost' to skip DNS
    "port":               int(os.getenv("DB_PORT", 3306)),
    "user":               os.getenv("DB_USER", "root"),
    "password":           os.getenv("DB_PASSWORD", ""),
    "database":           os.getenv("DB_NAME", "adhd_diagnostic_db"),
    "charset":            "utf8mb4",
    "use_pure":           True,           # avoids C-extension DNS delays
    "connection_timeout": 5,
    "autocommit":         False
}
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret")
JWT_EXPIRY_HOURS = 24

# ===== DB HELPER =====
def get_db():
    conn = mysql.connector.connect(**DB_CONFIG)
    return conn

def query(sql, params=(), fetchone=False, commit=False):
    conn = get_db()
    cur  = conn.cursor(dictionary=True)
    cur.execute(sql, params)
    if commit:
        conn.commit()
        last_id = cur.lastrowid
        cur.close(); conn.close()
        return last_id
    result = cur.fetchone() if fetchone else cur.fetchall()
    cur.close(); conn.close()
    return result

# ===== JWT HELPERS =====
def create_token(user_id: int, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role":    role,
        "exp":     datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def require_auth(f):
    """Decorator: requires valid JWT in Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401
        token = auth.split(" ", 1)[1]
        payload = decode_token(token)
        if not payload:
            return jsonify({"error": "Token invalid or expired"}), 401
        request.user_id = payload["user_id"]
        request.user_role = payload["role"]
        return f(*args, **kwargs)
    return decorated

# ===================================================
# ===== AUTH ENDPOINTS =====
# ===================================================

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    name     = data.get('name', '').strip()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')
    role     = data.get('role', 'parent')

    if not all([name, email, password]):
        return jsonify({"error": "جميع الحقول مطلوبة"}), 400
    if role not in ('parent', 'doctor'):
        role = 'parent'

    # Check duplicate
    existing = query("SELECT user_id FROM users WHERE email=%s", (email,), fetchone=True)
    if existing:
        return jsonify({"error": "البريد الإلكتروني مستخدم بالفعل"}), 409

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    uid = query(
        "INSERT INTO users (username, email, password_hash, role) VALUES (%s,%s,%s,%s)",
        (name, email, pw_hash, role), commit=True
    )
    token = create_token(uid, role)
    return jsonify({
        "status": "success",
        "token":  token,
        "user":   {"id": uid, "name": name, "email": email, "role": role}
    }), 201


@app.route('/api/login', methods=['POST'])
def login():
    data     = request.get_json()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')

    user = query("SELECT * FROM users WHERE email=%s", (email,), fetchone=True)
    if not user or not bcrypt.checkpw(password.encode(), user['password_hash'].encode()):
        return jsonify({"error": "البريد الإلكتروني أو كلمة المرور غير صحيحة"}), 401

    query("UPDATE users SET last_login=NOW() WHERE user_id=%s", (user['user_id'],), commit=True)
    token = create_token(user['user_id'], user['role'])
    return jsonify({
        "status": "success",
        "token":  token,
        "user": {
            "id":    user['user_id'],
            "name":  user['username'],
            "email": user['email'],
            "role":  user['role']
        }
    })


# ===================================================
# ===== CHILDREN ENDPOINTS =====
# ===================================================

@app.route('/api/children', methods=['GET'])
@require_auth
def list_children():
    children = query(
        "SELECT * FROM children WHERE user_id=%s ORDER BY created_at DESC",
        (request.user_id,)
    )
    # Convert datetime objects
    for c in children:
        c['created_at'] = str(c['created_at'])
    return jsonify(children)


@app.route('/api/children', methods=['POST'])
@require_auth
def add_child():
    data = request.get_json()
    name   = data.get('name', '').strip()
    age    = data.get('age')
    gender = data.get('gender', 'male')
    grade  = data.get('grade', '')
    school = data.get('school', '')
    notes  = data.get('notes', '')

    if not name or not age:
        return jsonify({"error": "الاسم والعمر مطلوبان"}), 400

    cid = query(
        "INSERT INTO children (user_id, name, age, gender, grade, school, notes) VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (request.user_id, name, age, gender, grade, school, notes), commit=True
    )
    return jsonify({"status": "success", "child_id": cid}), 201


@app.route('/api/children/<int:child_id>', methods=['GET'])
@require_auth
def get_child(child_id):
    child = query(
        "SELECT * FROM children WHERE child_id=%s AND user_id=%s",
        (child_id, request.user_id), fetchone=True
    )
    if not child:
        return jsonify({"error": "الطفل غير موجود"}), 404
    child['created_at'] = str(child['created_at'])
    return jsonify(child)


@app.route('/api/children/<int:child_id>', methods=['PUT'])
@require_auth
def update_child(child_id):
    data = request.get_json()
    child = query(
        "SELECT child_id FROM children WHERE child_id=%s AND user_id=%s",
        (child_id, request.user_id), fetchone=True
    )
    if not child:
        return jsonify({"error": "الطفل غير موجود"}), 404

    name   = data.get('name')
    age    = data.get('age')
    gender = data.get('gender')
    grade  = data.get('grade', '')
    school = data.get('school', '')
    notes  = data.get('notes', '')
    query(
        "UPDATE children SET name=%s, age=%s, gender=%s, grade=%s, school=%s, notes=%s WHERE child_id=%s",
        (name, age, gender, grade, school, notes, child_id), commit=True
    )
    return jsonify({"status": "success"})


@app.route('/api/children/<int:child_id>', methods=['DELETE'])
@require_auth
def delete_child(child_id):
    child = query(
        "SELECT child_id FROM children WHERE child_id=%s AND user_id=%s",
        (child_id, request.user_id), fetchone=True
    )
    if not child:
        return jsonify({"error": "الطفل غير موجود"}), 404
    query("DELETE FROM children WHERE child_id=%s", (child_id,), commit=True)
    return jsonify({"status": "success"})


# ===================================================
# ===== ASSESSMENT / REPORTS ENDPOINTS =====
# ===================================================

@app.route('/api/assessment', methods=['POST'])
@require_auth
def save_assessment():
    data       = request.get_json()
    child_id   = data.get('child_id')
    total      = data.get('total', 0)
    level      = data.get('level', 'normal')
    categories = data.get('categories', {})
    answers    = data.get('answers', {})

    # Verify child ownership
    child = query(
        "SELECT child_id FROM children WHERE child_id=%s AND user_id=%s",
        (child_id, request.user_id), fetchone=True
    )
    if not child:
        return jsonify({"error": "الطفل غير موجود"}), 404

    rid = query(
        """INSERT INTO diagnostic_reports
           (child_id, total_score, level, score_attention, score_hyperactive, score_social, answers_json)
           VALUES (%s,%s,%s,%s,%s,%s,%s)""",
        (
            child_id, total, level,
            categories.get('attention', 0),
            categories.get('hyperactivity', 0),
            categories.get('social', 0),
            json.dumps(answers, ensure_ascii=False)
        ),
        commit=True
    )
    return jsonify({"status": "success", "report_id": rid}), 201


@app.route('/api/assessment/<int:child_id>', methods=['GET'])
@require_auth
def get_assessments(child_id):
    # Verify ownership
    child = query(
        "SELECT child_id FROM children WHERE child_id=%s AND user_id=%s",
        (child_id, request.user_id), fetchone=True
    )
    if not child:
        return jsonify({"error": "الطفل غير موجود"}), 404

    reports = query(
        "SELECT * FROM diagnostic_reports WHERE child_id=%s ORDER BY report_date DESC",
        (child_id,)
    )
    for r in reports:
        r['report_date'] = str(r['report_date'])
        if isinstance(r['answers_json'], str):
            r['answers_json'] = json.loads(r['answers_json'])
    return jsonify(reports)


# ===================================================
# ===== CAMERA / AI ENDPOINTS =====
# ===================================================

@app.route('/api/camera/analyze_frame', methods=['POST'])
@require_auth
def analyze_camera_frame():
    """
    Receives a base64 image frame and analyzes it with DeepFace.
    POST body: { "frame": "<base64 data URL>", "movement": <float> }
    """
    data     = request.get_json()
    b64frame = data.get('frame', '')
    movement = float(data.get('movement', 0))

    if not b64frame:
        return jsonify({"error": "لا توجد صورة"}), 400

    result = analyze_frame(b64frame)
    if not result.get('success'):
        # Return neutral if no face detected (don't break the session)
        return jsonify({
            "success":  False,
            "dominant": "neutral",
            "emotions": {"neutral": 1.0},
            "movement": movement
        })

    return jsonify({
        "success":  True,
        "dominant": result['dominant'],
        "emotions": result['emotions'],
        "movement": movement
    })


@app.route('/api/camera/save_session', methods=['POST'])
@require_auth
def save_camera_session():
    """
    Save a completed 30-second camera analysis session.
    POST body: { "child_id": int, "frames": [...] }
    Each frame: { "emotions": {...}, "movement": float }
    """
    data     = request.get_json()
    child_id = data.get('child_id')
    frames   = data.get('frames', [])

    child = query(
        "SELECT child_id FROM children WHERE child_id=%s AND user_id=%s",
        (child_id, request.user_id), fetchone=True
    )
    if not child:
        return jsonify({"error": "الطفل غير موجود"}), 404

    # Aggregate metrics
    metrics = aggregate_frame_metrics(frames)
    level   = classify_camera_session(metrics)

    sid = query(
        """INSERT INTO camera_sessions
           (child_id, level, avg_movement, avg_neutral, avg_happy, expression_variance, sample_count, raw_metrics_json)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (
            child_id, level,
            metrics.get('avg_movement', 0),
            metrics.get('avg_neutral', 0),
            metrics.get('avg_happy', 0),
            metrics.get('expression_variance', 0),
            metrics.get('sample_count', 0),
            json.dumps(metrics, ensure_ascii=False)
        ),
        commit=True
    )
    return jsonify({
        "status":     "success",
        "session_id": sid,
        "level":      level,
        "metrics":    metrics
    }), 201


@app.route('/api/camera/<int:child_id>', methods=['GET'])
@require_auth
def get_camera_sessions(child_id):
    child = query(
        "SELECT child_id FROM children WHERE child_id=%s AND user_id=%s",
        (child_id, request.user_id), fetchone=True
    )
    if not child:
        return jsonify({"error": "الطفل غير موجود"}), 404

    sessions = query(
        "SELECT * FROM camera_sessions WHERE child_id=%s ORDER BY session_date DESC",
        (child_id,)
    )
    for s in sessions:
        s['session_date'] = str(s['session_date'])
        if isinstance(s.get('raw_metrics_json'), str):
            s['raw_metrics_json'] = json.loads(s['raw_metrics_json'])
    return jsonify(sessions)


# ===================================================
# ===== NOTIFICATIONS =====
# ===================================================

@app.route('/api/notifications', methods=['GET'])
@require_auth
def get_notifications():
    notifs = query(
        "SELECT * FROM notifications WHERE user_id=%s ORDER BY created_at DESC LIMIT 20",
        (request.user_id,)
    )
    for n in notifs:
        n['created_at'] = str(n['created_at'])
    return jsonify(notifs)


@app.route('/api/notifications/<int:notif_id>/read', methods=['PATCH'])
@require_auth
def mark_notification_read(notif_id):
    query(
        "UPDATE notifications SET is_read=TRUE WHERE notif_id=%s AND user_id=%s",
        (notif_id, request.user_id), commit=True
    )
    return jsonify({"status": "success"})


# ===================================================
# ===== SERVE STATIC FILES =====
# ===================================================

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)


# ===================================================
# ===== MAIN =====
# ===================================================

if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5000))
    print(f"\n{'='*50}")
    print(f"  ADHD/ASD Diagnostic System — Flask Backend")
    print(f"  Running at: http://localhost:{port}")
    print(f"  Open your browser at: http://localhost:{port}")
    print(f"{'='*50}\n")
    app.run(debug=True, host='0.0.0.0', port=port)
