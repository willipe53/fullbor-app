-- Migration script to rename 'name' columns to canonical names
-- Run this against your RDS database to update the schema

-- 1. Rename client_groups.name to client_groups.client_group_name
ALTER TABLE `client_groups` 
CHANGE COLUMN `name` `client_group_name` VARCHAR(255) NOT NULL;

-- 2. Rename entity_types.name to entity_types.entity_type_name  
ALTER TABLE `entity_types`
CHANGE COLUMN `name` `entity_type_name` VARCHAR(255) NOT NULL;

-- 3. Rename entities.name to entities.entity_name
ALTER TABLE `entities`
CHANGE COLUMN `name` `entity_name` VARCHAR(255) NOT NULL;

-- 4. Rename transaction_types.name to transaction_types.transaction_type_name
ALTER TABLE `transaction_types`
CHANGE COLUMN `name` `transaction_type_name` VARCHAR(255) NOT NULL;

-- 5. Rename transaction_statuses.name to transaction_statuses.transaction_status_name
ALTER TABLE `transaction_statuses`
CHANGE COLUMN `name` `transaction_status_name` VARCHAR(255) NOT NULL;

-- Verify the changes
SHOW COLUMNS FROM client_groups;
SHOW COLUMNS FROM entity_types;
SHOW COLUMNS FROM entities;
SHOW COLUMNS FROM transaction_types;
SHOW COLUMNS FROM transaction_statuses;

