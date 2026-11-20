CREATE DATABASE IF NOT EXISTS docuarch CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE docuarch;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('admin','staff','requester') NOT NULL DEFAULT 'requester',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- The only three document types the system accepts
CREATE TABLE IF NOT EXISTS document_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  prefix VARCHAR(5) NOT NULL UNIQUE
);
INSERT IGNORE INTO document_types (id, name, prefix) VALUES
  (1, 'Letter', 'LTR'),
  (2, 'Clearance Form', 'CLR'),
  (3, 'Report', 'RPT');

-- One numbering series per document type per year
CREATE TABLE IF NOT EXISTS doc_counters (
  type_id INT NOT NULL,
  doc_year INT NOT NULL,
  last_no INT NOT NULL,
  PRIMARY KEY (type_id, doc_year),
  FOREIGN KEY (type_id) REFERENCES document_types(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type_id INT NOT NULL,
  doc_number VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  sender VARCHAR(100),
  recipient VARCHAR(100),
  doc_date DATE NOT NULL,
  notes TEXT,
  archived_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- A document is identified by type + number, not by number alone
  UNIQUE KEY uq_type_number (type_id, doc_number),
  FOREIGN KEY (type_id) REFERENCES document_types(id),
  FOREIGN KEY (archived_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS archive_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  user_id INT NOT NULL,
  action ENUM('archived','updated','retrieved') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
