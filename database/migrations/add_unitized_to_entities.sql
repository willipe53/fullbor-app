-- Migration: Add unitized column to entities table
-- Date: 2025-10-08
-- Description: Adds a boolean column 'unitized' to the entities table to track whether an entity is unitized

-- Add the unitized column with default value of 0 (false)
ALTER TABLE entities
ADD COLUMN unitized TINYINT(1) DEFAULT 0
AFTER attributes;

-- Optional: Add an index if you plan to frequently filter by unitized status
-- CREATE INDEX idx_entities_unitized ON entities(unitized);

-- Verify the change
DESCRIBE entities;

