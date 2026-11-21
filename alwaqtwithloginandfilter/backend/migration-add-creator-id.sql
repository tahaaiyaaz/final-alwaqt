-- Migration: Add creator_id column to masjids table
-- For existing deployments, run this SQL script on your database server.

USE alwaqt;

ALTER TABLE masjids 
ADD COLUMN creator_id INT DEFAULT NULL,
ADD CONSTRAINT fk_masjids_creator_id FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL;
