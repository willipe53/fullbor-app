-- Migration: Create position_sandbox table
-- Date: 2025-10-09
-- Description: Creates a sandbox table for position calculations before committing to positions table

DROP TABLE IF EXISTS `position_sandbox`;

CREATE TABLE `position_sandbox` (
  `position_sandbox_id` int NOT NULL AUTO_INCREMENT,
  `position_date` date NOT NULL,
  `position_type_id` int NOT NULL,
  `portfolio_entity_id` int NOT NULL,
  `instrument_entity_id` int DEFAULT NULL,
  `share_amount` decimal(20,8) DEFAULT 0,
  `market_value` decimal(20,4) DEFAULT 0,
  `position_keeper_id` int NOT NULL,
  PRIMARY KEY (`position_sandbox_id`),
  KEY `idx_sandbox_date_type` (`position_date`, `position_type_id`),
  KEY `idx_sandbox_portfolio` (`portfolio_entity_id`),
  KEY `idx_sandbox_instrument` (`instrument_entity_id`),
  KEY `fk_sandbox_position_type` (`position_type_id`),
  KEY `fk_sandbox_position_keeper` (`position_keeper_id`),
  CONSTRAINT `fk_sandbox_portfolio_entity` FOREIGN KEY (`portfolio_entity_id`) REFERENCES `entities` (`entity_id`),
  CONSTRAINT `fk_sandbox_instrument_entity` FOREIGN KEY (`instrument_entity_id`) REFERENCES `entities` (`entity_id`),
  CONSTRAINT `fk_sandbox_position_keeper` FOREIGN KEY (`position_keeper_id`) REFERENCES `position_keepers` (`position_keeper_id`),
  CONSTRAINT `fk_sandbox_position_type` FOREIGN KEY (`position_type_id`) REFERENCES `position_types` (`position_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Add index for fast lookups during position calculations
CREATE INDEX idx_sandbox_lookup ON position_sandbox (
  position_date, 
  position_type_id, 
  portfolio_entity_id, 
  instrument_entity_id
);

