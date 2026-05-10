-- Al Waqt Database Schema
-- Run this SQL on your MySQL server to create the database and tables

CREATE DATABASE IF NOT EXISTS alwaqt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE alwaqt;

-- ============================================
-- Users table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  firebase_uid VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  mobile_number VARCHAR(20) DEFAULT NULL,
  user_type ENUM('Muazzin', 'Not Muazzin') DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_firebase_uid (firebase_uid),
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- ============================================
-- Masjids table
-- ============================================
CREATE TABLE IF NOT EXISTS masjids (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address_line1 TEXT DEFAULT NULL,
  country_name VARCHAR(100) DEFAULT 'India',
  state_name VARCHAR(100) DEFAULT NULL,
  city_name VARCHAR(100) DEFAULT NULL,
  contact_number VARCHAR(20) DEFAULT NULL,
  status ENUM('pending', 'approved', 'rejected', 'hidden') DEFAULT 'approved',
  source ENUM('user', 'ola') DEFAULT 'user',
  ola_place_id VARCHAR(255) DEFAULT NULL,
  image_url VARCHAR(255) DEFAULT NULL,
  is_verified TINYINT(1) DEFAULT 1,
  ola_latitude DECIMAL(10, 8) DEFAULT NULL,
  ola_longitude DECIMAL(11, 8) DEFAULT NULL,
  timings_image_url VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_location (latitude, longitude)
) ENGINE=InnoDB;

-- ============================================
-- Prayer timings (one row per masjid)
-- ============================================
CREATE TABLE IF NOT EXISTS masjid_timings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  masjid_id INT NOT NULL UNIQUE,
  fajr VARCHAR(20) DEFAULT NULL,
  dhuhr VARCHAR(20) DEFAULT NULL,
  asar VARCHAR(20) DEFAULT NULL,
  maghrib VARCHAR(20) DEFAULT NULL,
  isha VARCHAR(20) DEFAULT NULL,
  FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- Jumma timings (multiple rows per masjid)
-- ============================================
CREATE TABLE IF NOT EXISTS jumma_timings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  masjid_id INT NOT NULL,
  timing VARCHAR(20) NOT NULL,
  bayan_name VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
  INDEX idx_masjid (masjid_id)
) ENGINE=InnoDB;

-- ============================================
-- Taraweeh entries (multiple rows per masjid)
-- ============================================
CREATE TABLE IF NOT EXISTS taraweeh_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  masjid_id INT NOT NULL,
  time VARCHAR(20) DEFAULT NULL,
  parah VARCHAR(50) DEFAULT NULL,
  start_date VARCHAR(50) DEFAULT NULL,
  FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
  INDEX idx_masjid (masjid_id)
) ENGINE=InnoDB;

-- ============================================
-- User favorites (many-to-many)
-- ============================================
CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  masjid_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_fav (user_id, masjid_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- ============================================
-- Events (multiple rows per masjid)
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  masjid_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  speaker_name VARCHAR(255) DEFAULT NULL,
  frequency ENUM('daily', 'weekly', 'monthly', 'yearly') NOT NULL DEFAULT 'weekly',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
  INDEX idx_masjid_events (masjid_id)
) ENGINE=InnoDB;

-- ============================================
-- App Settings (global configuration)
-- ============================================
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Insert default app settings
INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('show_add_button', 'true');

-- ============================================
-- Muazzins (multiple rows per masjid)
-- ============================================
CREATE TABLE IF NOT EXISTS muazzins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  masjid_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
  INDEX idx_masjid_muazzins (masjid_id)
) ENGINE=InnoDB;

-- ============================================
-- Masjid Reports (Location updates, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS masjid_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  masjid_id INT NOT NULL,
  report_type VARCHAR(50) NOT NULL,
  new_lat DECIMAL(10, 8),
  new_lng DECIMAL(11, 8),
  original_lat DECIMAL(10, 8),
  original_lng DECIMAL(11, 8),
  image_url VARCHAR(255),
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- Masjid Changes (History tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS masjid_changes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  masjid_id INT NOT NULL,
  user_id INT DEFAULT NULL,
  changed_by_name VARCHAR(255) DEFAULT 'Unknown Person',
  change_type ENUM('Muazzin', 'Follower', 'User', 'Unknown') DEFAULT 'Unknown',
  change_summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_masjid_changes (masjid_id)
) ENGINE=InnoDB;

-- ============================================
-- App Announcements (System-wide popups)
-- ============================================
CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_active TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
