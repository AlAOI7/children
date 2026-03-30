-- ============================================
-- ADHD / ASD Diagnostic System — MySQL Schema
-- ============================================

CREATE DATABASE IF NOT EXISTS adhd_diagnostic_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE adhd_diagnostic_db;

-- ===== USERS =====
CREATE TABLE IF NOT EXISTS users (
  user_id      INT AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(100) NOT NULL UNIQUE,
  email        VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role         ENUM('parent','doctor','admin') NOT NULL DEFAULT 'parent',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login   TIMESTAMP NULL,
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- ===== CHILDREN =====
CREATE TABLE IF NOT EXISTS children (
  child_id   INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  age        TINYINT UNSIGNED NOT NULL,
  gender     ENUM('male','female') NOT NULL,
  grade      VARCHAR(50),
  school     VARCHAR(150),
  notes      TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- ===== INTERACTION DATA (raw behavioral data) =====
CREATE TABLE IF NOT EXISTS interaction_data (
  data_id        INT AUTO_INCREMENT PRIMARY KEY,
  child_id       INT NOT NULL,
  session_ts     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  mouse_x        FLOAT,
  mouse_y        FLOAT,
  click_latency  FLOAT COMMENT 'milliseconds',
  focus_score    FLOAT COMMENT '0.0 – 1.0',
  activity_level FLOAT COMMENT '0.0 – 1.0',
  FOREIGN KEY (child_id) REFERENCES children(child_id) ON DELETE CASCADE,
  INDEX idx_child (child_id)
) ENGINE=InnoDB;

-- ===== DIAGNOSTIC REPORTS (questionnaire results) =====
CREATE TABLE IF NOT EXISTS diagnostic_reports (
  report_id       INT AUTO_INCREMENT PRIMARY KEY,
  child_id        INT NOT NULL,
  report_date     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_score     SMALLINT UNSIGNED,
  level           ENUM('normal','attention','hyperactive','autism') NOT NULL,
  score_attention    SMALLINT UNSIGNED DEFAULT 0,
  score_hyperactive  SMALLINT UNSIGNED DEFAULT 0,
  score_social       SMALLINT UNSIGNED DEFAULT 0,
  answers_json    JSON NOT NULL COMMENT 'Full answer map {qId: value}',
  summary_text    TEXT,
  FOREIGN KEY (child_id) REFERENCES children(child_id) ON DELETE CASCADE,
  INDEX idx_child (child_id)
) ENGINE=InnoDB;

-- ===== CAMERA SESSIONS (AI face-analysis results) =====
CREATE TABLE IF NOT EXISTS camera_sessions (
  session_id         INT AUTO_INCREMENT PRIMARY KEY,
  child_id           INT NOT NULL,
  session_date       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  level              ENUM('normal','attention','hyperactive','autism') NOT NULL,
  avg_movement       FLOAT COMMENT 'avg pixels per frame',
  avg_neutral        FLOAT COMMENT '0.0 – 1.0',
  avg_happy          FLOAT,
  expression_variance FLOAT,
  sample_count       SMALLINT UNSIGNED,
  raw_metrics_json   JSON,
  FOREIGN KEY (child_id) REFERENCES children(child_id) ON DELETE CASCADE,
  INDEX idx_child (child_id)
) ENGINE=InnoDB;

-- ===== NOTIFICATIONS =====
CREATE TABLE IF NOT EXISTS notifications (
  notif_id   INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;
