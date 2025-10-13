-- MySQL dump 10.13  Distrib 9.4.0, for macos15.4 (arm64)
--
-- Host: panda-db.cnqay066ma0a.us-east-2.rds.amazonaws.com    Database: onebor
-- ------------------------------------------------------
-- Server version	8.4.6

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '';

--
-- Table structure for table `client_group_entities`
--

DROP TABLE IF EXISTS `client_group_entities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_group_entities` (
  `client_group_id` int NOT NULL,
  `entity_id` int NOT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  PRIMARY KEY (`client_group_id`,`entity_id`),
  KEY `entity_id` (`entity_id`),
  CONSTRAINT `client_group_entities_ibfk_1` FOREIGN KEY (`client_group_id`) REFERENCES `client_groups` (`client_group_id`) ON DELETE CASCADE,
  CONSTRAINT `client_group_entities_ibfk_2` FOREIGN KEY (`entity_id`) REFERENCES `entities` (`entity_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `client_group_entities_view`
--

DROP TABLE IF EXISTS `client_group_entities_view`;
/*!50001 DROP VIEW IF EXISTS `client_group_entities_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `client_group_entities_view` AS SELECT 
 1 AS `client_group_id`,
 1 AS `client_group_name`,
 1 AS `entity_id`,
 1 AS `entity_name`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `client_group_users`
--

DROP TABLE IF EXISTS `client_group_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_group_users` (
  `client_group_id` int NOT NULL,
  `user_id` int NOT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_group_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `client_group_users_ibfk_1` FOREIGN KEY (`client_group_id`) REFERENCES `client_groups` (`client_group_id`) ON DELETE CASCADE,
  CONSTRAINT `client_group_users_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `client_group_users_view`
--

DROP TABLE IF EXISTS `client_group_users_view`;
/*!50001 DROP VIEW IF EXISTS `client_group_users_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `client_group_users_view` AS SELECT 
 1 AS `client_group_id`,
 1 AS `client_group_name`,
 1 AS `user_id`,
 1 AS `email`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `client_groups`
--

DROP TABLE IF EXISTS `client_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_groups` (
  `client_group_id` int NOT NULL AUTO_INCREMENT,
  `client_group_name` varchar(255) NOT NULL,
  `preferences` json DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  PRIMARY KEY (`client_group_id`),
  UNIQUE KEY `client_group_name` (`client_group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=513 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entities`
--

DROP TABLE IF EXISTS `entities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entities` (
  `entity_id` int NOT NULL AUTO_INCREMENT,
  `entity_name` varchar(255) NOT NULL,
  `entity_type_id` int NOT NULL,
  `attributes` json DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  `unitized` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`entity_id`),
  KEY `fk_entities_entity_type` (`entity_type_id`),
  CONSTRAINT `fk_entities_entity_type` FOREIGN KEY (`entity_type_id`) REFERENCES `entity_types` (`entity_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=708 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `entities_view`
--

DROP TABLE IF EXISTS `entities_view`;
/*!50001 DROP VIEW IF EXISTS `entities_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `entities_view` AS SELECT 
 1 AS `entity_id`,
 1 AS `entity_name`,
 1 AS `entity_type_name`,
 1 AS `entity_type_id`,
 1 AS `update_date`,
 1 AS `updated_user_id`,
 1 AS `email`,
 1 AS `attributes`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `entity_types`
--

DROP TABLE IF EXISTS `entity_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entity_types` (
  `entity_type_id` int NOT NULL AUTO_INCREMENT,
  `entity_type_name` varchar(100) NOT NULL,
  `attributes_schema` json DEFAULT NULL,
  `short_label` varchar(5) DEFAULT NULL,
  `label_color` char(6) DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  `entity_category` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`entity_type_id`),
  UNIQUE KEY `entity_type_name` (`entity_type_name`)
) ENGINE=InnoDB AUTO_INCREMENT=317 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invitations`
--

DROP TABLE IF EXISTS `invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invitations` (
  `invitation_id` int NOT NULL AUTO_INCREMENT,
  `code` char(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (substr(replace(uuid(),_utf8mb3'-',_utf8mb4''),1,16)),
  `expires_at` datetime NOT NULL,
  `client_group_id` int NOT NULL,
  `updated_user_id` int DEFAULT NULL,
  `email_sent_to` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`invitation_id`),
  UNIQUE KEY `uq_invitations_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=139 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lambda_locks`
--

DROP TABLE IF EXISTS `lambda_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lambda_locks` (
  `lock_id` varchar(64) NOT NULL,
  `instance` varchar(255) DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`lock_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION' */ ;
/*!50032 DROP TRIGGER IF EXISTS after_lambda_locks_insert */;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`admin`@`%`*/ /*!50003 TRIGGER `after_lambda_locks_insert` AFTER INSERT ON `lambda_locks` FOR EACH ROW BEGIN
    INSERT INTO position_keepers (lock_id, instance, expires_at)
    VALUES (NEW.lock_id, NEW.instance, NEW.expires_at);
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `position_keepers`
--

DROP TABLE IF EXISTS `position_keepers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `position_keepers` (
  `position_keeper_id` int NOT NULL AUTO_INCREMENT,
  `lock_id` varchar(64) DEFAULT NULL,
  `instance` varchar(255) DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`position_keeper_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `position_sandbox`
--

DROP TABLE IF EXISTS `position_sandbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `position_sandbox` (
  `position_sandbox_id` int NOT NULL AUTO_INCREMENT,
  `position_date` date NOT NULL,
  `position_type_id` int NOT NULL,
  `portfolio_entity_id` int NOT NULL,
  `instrument_entity_id` int DEFAULT NULL,
  `share_amount` decimal(20,8) DEFAULT NULL,
  `market_value` decimal(20,4) DEFAULT NULL,
  `position_keeper_id` int NOT NULL,
  PRIMARY KEY (`position_sandbox_id`),
  UNIQUE KEY `uq_positions_unique_s` (`position_type_id`,`portfolio_entity_id`,`instrument_entity_id`),
  KEY `fk_position_type_s` (`position_type_id`),
  KEY `fk_portfolio_entity_s` (`portfolio_entity_id`),
  KEY `fk_pos_instrument_entity_s` (`instrument_entity_id`),
  KEY `fk_position_keeper_s` (`position_keeper_id`),
  CONSTRAINT `fk_portfolio_entity_s` FOREIGN KEY (`portfolio_entity_id`) REFERENCES `entities` (`entity_id`),
  CONSTRAINT `fk_pos_instrument_entity_s` FOREIGN KEY (`instrument_entity_id`) REFERENCES `entities` (`entity_id`),
  CONSTRAINT `fk_position_keeper_s` FOREIGN KEY (`position_keeper_id`) REFERENCES `position_keepers` (`position_keeper_id`),
  CONSTRAINT `fk_position_type_s` FOREIGN KEY (`position_type_id`) REFERENCES `position_types` (`position_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `position_types`
--

DROP TABLE IF EXISTS `position_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `position_types` (
  `position_type_id` int NOT NULL AUTO_INCREMENT,
  `position_type_name` varchar(255) NOT NULL,
  `properties` json DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  PRIMARY KEY (`position_type_id`),
  UNIQUE KEY `position_type_name` (`position_type_name`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `positions`
--

DROP TABLE IF EXISTS `positions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `positions` (
  `position_id` int NOT NULL AUTO_INCREMENT,
  `position_date` date NOT NULL,
  `position_type_id` int NOT NULL,
  `portfolio_entity_id` int NOT NULL,
  `instrument_entity_id` int DEFAULT NULL,
  `share_amount` decimal(20,8) DEFAULT NULL,
  `market_value` decimal(20,4) DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `position_keeper_id` int NOT NULL,
  PRIMARY KEY (`position_id`),
  UNIQUE KEY `uq_positions_unique` (`position_type_id`,`portfolio_entity_id`,`instrument_entity_id`),
  KEY `fk_position_type` (`position_type_id`),
  KEY `fk_portfolio_entity` (`portfolio_entity_id`),
  KEY `fk_pos_instrument_entity` (`instrument_entity_id`),
  KEY `fk_position_keeper` (`position_keeper_id`),
  CONSTRAINT `fk_portfolio_entity` FOREIGN KEY (`portfolio_entity_id`) REFERENCES `entities` (`entity_id`),
  CONSTRAINT `fk_pos_instrument_entity` FOREIGN KEY (`instrument_entity_id`) REFERENCES `entities` (`entity_id`),
  CONSTRAINT `fk_position_keeper` FOREIGN KEY (`position_keeper_id`) REFERENCES `position_keepers` (`position_keeper_id`),
  CONSTRAINT `fk_position_type` FOREIGN KEY (`position_type_id`) REFERENCES `position_types` (`position_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `trading_days`
--

DROP TABLE IF EXISTS `trading_days`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trading_days` (
  `trading_day` date NOT NULL,
  PRIMARY KEY (`trading_day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transaction_statuses`
--

DROP TABLE IF EXISTS `transaction_statuses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction_statuses` (
  `transaction_status_id` int NOT NULL AUTO_INCREMENT,
  `transaction_status_name` varchar(255) NOT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  PRIMARY KEY (`transaction_status_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transaction_types`
--

DROP TABLE IF EXISTS `transaction_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction_types` (
  `transaction_type_id` int NOT NULL AUTO_INCREMENT,
  `transaction_type_name` varchar(255) NOT NULL,
  `properties` json DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  PRIMARY KEY (`transaction_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transactions` (
  `transaction_id` int NOT NULL AUTO_INCREMENT,
  `portfolio_entity_id` int NOT NULL,
  `contra_entity_id` int DEFAULT NULL,
  `instrument_entity_id` int DEFAULT NULL,
  `properties` json DEFAULT NULL,
  `transaction_status_id` int NOT NULL,
  `transaction_type_id` int NOT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  `trade_date` date NOT NULL,
  `settle_date` date NOT NULL,
  PRIMARY KEY (`transaction_id`),
  KEY `fk_trans_trans_type` (`transaction_type_id`),
  KEY `fk_trans_trans_status` (`transaction_status_id`),
  KEY `fk_party_entity` (`portfolio_entity_id`),
  KEY `fk_contra_entity` (`contra_entity_id`),
  KEY `fk_instrument_entity` (`instrument_entity_id`),
  CONSTRAINT `fk_contra_entity` FOREIGN KEY (`contra_entity_id`) REFERENCES `entities` (`entity_id`),
  CONSTRAINT `fk_instrument_entity` FOREIGN KEY (`instrument_entity_id`) REFERENCES `entities` (`entity_id`),
  CONSTRAINT `fk_party_entity` FOREIGN KEY (`portfolio_entity_id`) REFERENCES `entities` (`entity_id`),
  CONSTRAINT `fk_trans_trans_status` FOREIGN KEY (`transaction_status_id`) REFERENCES `transaction_statuses` (`transaction_status_id`),
  CONSTRAINT `fk_trans_trans_type` FOREIGN KEY (`transaction_type_id`) REFERENCES `transaction_types` (`transaction_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transactions_backup`
--

DROP TABLE IF EXISTS `transactions_backup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transactions_backup` (
  `transaction_id` int NOT NULL DEFAULT '0',
  `portfolio_entity_id` int NOT NULL,
  `contra_entity_id` int DEFAULT NULL,
  `instrument_entity_id` int DEFAULT NULL,
  `properties` json DEFAULT NULL,
  `transaction_status_id` int NOT NULL,
  `transaction_type_id` int NOT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  `trade_date` datetime NOT NULL,
  `settle_date` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `transactions_view`
--

DROP TABLE IF EXISTS `transactions_view`;
/*!50001 DROP VIEW IF EXISTS `transactions_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `transactions_view` AS SELECT 
 1 AS `transaction_id`,
 1 AS `portfolio_name`,
 1 AS `portfolio_entity_id`,
 1 AS `contra_name`,
 1 AS `contra_entity_id`,
 1 AS `instrument_name`,
 1 AS `instrument_entity_id`,
 1 AS `transaction_status`,
 1 AS `transaction_status_id`,
 1 AS `transaction_type`,
 1 AS `transaction_type_id`,
 1 AS `trade_date`,
 1 AS `settle_date`,
 1 AS `properties`,
 1 AS `update_date`,
 1 AS `updated_user_id`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `sub` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `preferences` json DEFAULT NULL,
  `primary_client_group_id` int DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=242 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `users_view`
--

DROP TABLE IF EXISTS `users_view`;
/*!50001 DROP VIEW IF EXISTS `users_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `users_view` AS SELECT 
 1 AS `user_id`,
 1 AS `email`,
 1 AS `primary_client_group_name`,
 1 AS `primary_client_group_id`,
 1 AS `update_date`,
 1 AS `sub`,
 1 AS `preferences`*/;
SET character_set_client = @saved_cs_client;

--
-- Dumping events for database 'onebor'
--

--
-- Dumping routines for database 'onebor'
--
--
-- WARNING: can't read the INFORMATION_SCHEMA.libraries table. It's most probably an old server 8.4.6.
--
--
-- WARNING: can't read the INFORMATION_SCHEMA.libraries table. It's most probably an old server 8.4.6.
--
/*!50003 DROP PROCEDURE IF EXISTS `assign_all_entities_to` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`admin`@`%` PROCEDURE `assign_all_entities_to`(IN p_client_group_id INT)
BEGIN
  /*
    Assigns all entities to the specified client group, skipping any that
    are already present in client_group_entities.
  */
  INSERT INTO client_group_entities (
      client_group_id,
      entity_id,
      update_date,
      updated_user_id
  )
  SELECT
      p_client_group_id AS client_group_id,
      en.entity_id,
      NOW() AS update_date,
      10 AS updated_user_id
  FROM entities en
  WHERE en.entity_id NOT IN (
      SELECT cge.entity_id
      FROM client_group_entities cge
      WHERE cge.client_group_id = p_client_group_id
  );
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
--
-- WARNING: can't read the INFORMATION_SCHEMA.libraries table. It's most probably an old server 8.4.6.
--
/*!50003 DROP PROCEDURE IF EXISTS `sp_check_for_entity_orphans` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`admin`@`%` PROCEDURE `sp_check_for_entity_orphans`()
BEGIN
  /*
    Returns all entities that are not related to any client group
    (i.e., no row exists in client_group_entities for that entity_id).
  */
  SELECT
      ev.entity_id,
      ev.entity_name,
      ev.entity_type_name,
      ev.entity_type_id,
      ev.email,
      ev.updated_user_id
  FROM entities_view ev
  WHERE NOT EXISTS (
    SELECT 1
    FROM client_group_entities cge
    WHERE cge.entity_id = ev.entity_id
  )
  ORDER BY ev.entity_id;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
--
-- WARNING: can't read the INFORMATION_SCHEMA.libraries table. It's most probably an old server 8.4.6.
--
/*!50003 DROP PROCEDURE IF EXISTS `sp_cleanup_client_orphans` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`admin`@`%` PROCEDURE `sp_cleanup_client_orphans`()
BEGIN
  /*
    Inserts missing (primary_client_group_id, user_id) combinations
    from `users` into `client_group_users`.
  */
  INSERT INTO client_group_users (client_group_id, user_id)
  SELECT u.primary_client_group_id, u.user_id
  FROM users u
  WHERE u.primary_client_group_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM client_group_users cgu
      WHERE cgu.client_group_id = u.primary_client_group_id
        AND cgu.user_id = u.user_id
    );
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Final view structure for view `client_group_entities_view`
--

/*!50001 DROP VIEW IF EXISTS `client_group_entities_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`admin`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `client_group_entities_view` AS select `cge`.`client_group_id` AS `client_group_id`,`cg`.`client_group_name` AS `client_group_name`,`cge`.`entity_id` AS `entity_id`,`en`.`entity_name` AS `entity_name` from ((`client_group_entities` `cge` left join `entities` `en` on((`en`.`entity_id` = `cge`.`entity_id`))) left join `client_groups` `cg` on((`cg`.`client_group_id` = `cge`.`client_group_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `client_group_users_view`
--

/*!50001 DROP VIEW IF EXISTS `client_group_users_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`admin`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `client_group_users_view` AS select `cgu`.`client_group_id` AS `client_group_id`,`cg`.`client_group_name` AS `client_group_name`,`cgu`.`user_id` AS `user_id`,`us`.`email` AS `email` from ((`client_group_users` `cgu` left join `client_groups` `cg` on((`cg`.`client_group_id` = `cgu`.`client_group_id`))) left join `users` `us` on((`us`.`user_id` = `cgu`.`user_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `entities_view`
--

/*!50001 DROP VIEW IF EXISTS `entities_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`admin`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `entities_view` AS select `en`.`entity_id` AS `entity_id`,`en`.`entity_name` AS `entity_name`,`et`.`entity_type_name` AS `entity_type_name`,`en`.`entity_type_id` AS `entity_type_id`,`en`.`update_date` AS `update_date`,`en`.`updated_user_id` AS `updated_user_id`,`u`.`email` AS `email`,`en`.`attributes` AS `attributes` from ((`entities` `en` left join `entity_types` `et` on((`en`.`entity_type_id` = `et`.`entity_type_id`))) left join `users` `u` on((`en`.`updated_user_id` = `u`.`user_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `transactions_view`
--

/*!50001 DROP VIEW IF EXISTS `transactions_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`admin`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `transactions_view` AS select `tr`.`transaction_id` AS `transaction_id`,`en1`.`entity_name` AS `portfolio_name`,`tr`.`portfolio_entity_id` AS `portfolio_entity_id`,`en2`.`entity_name` AS `contra_name`,`tr`.`contra_entity_id` AS `contra_entity_id`,`en3`.`entity_name` AS `instrument_name`,`tr`.`instrument_entity_id` AS `instrument_entity_id`,`ts`.`transaction_status_name` AS `transaction_status`,`tr`.`transaction_status_id` AS `transaction_status_id`,`tt`.`transaction_type_name` AS `transaction_type`,`tr`.`transaction_type_id` AS `transaction_type_id`,`tr`.`trade_date` AS `trade_date`,`tr`.`settle_date` AS `settle_date`,`tr`.`properties` AS `properties`,`tr`.`update_date` AS `update_date`,`tr`.`updated_user_id` AS `updated_user_id` from (((((`transactions` `tr` left join `entities` `en1` on((`tr`.`portfolio_entity_id` = `en1`.`entity_id`))) left join `entities` `en2` on((`tr`.`contra_entity_id` = `en2`.`entity_id`))) left join `entities` `en3` on((`tr`.`instrument_entity_id` = `en3`.`entity_id`))) left join `transaction_statuses` `ts` on((`tr`.`transaction_status_id` = `ts`.`transaction_status_id`))) left join `transaction_types` `tt` on((`tr`.`transaction_type_id` = `tt`.`transaction_type_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `users_view`
--

/*!50001 DROP VIEW IF EXISTS `users_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`admin`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `users_view` AS select `us`.`user_id` AS `user_id`,`us`.`email` AS `email`,`cg`.`client_group_name` AS `primary_client_group_name`,`us`.`primary_client_group_id` AS `primary_client_group_id`,`us`.`update_date` AS `update_date`,`us`.`sub` AS `sub`,`us`.`preferences` AS `preferences` from (`users` `us` left join `client_groups` `cg` on((`us`.`primary_client_group_id` = `cg`.`client_group_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-10-10 15:58:12
-- =============================================================================
-- OneBor Database Schema Export
-- Generated on: 2025-10-10 15:57:59
-- Database: onebor
-- Host: panda-db.cnqay066ma0a.us-east-2.rds.amazonaws.com:3306
-- 
-- This file contains the complete schema including:
-- * Tables with structure and indexes
-- * Views
-- * Stored procedures and functions
-- * Triggers
-- * Events
-- * Character set and collation settings
-- =============================================================================

