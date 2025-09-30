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
-- Temporary view structure for view `client_group_user_view`
--

DROP TABLE IF EXISTS `client_group_user_view`;
/*!50001 DROP VIEW IF EXISTS `client_group_user_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `client_group_user_view` AS SELECT 
 1 AS `client_group_id`,
 1 AS `client_group_name`,
 1 AS `user_id`,
 1 AS `email`*/;
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
-- Table structure for table `client_groups`
--

DROP TABLE IF EXISTS `client_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_groups` (
  `client_group_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `preferences` json DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  PRIMARY KEY (`client_group_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=426 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `currencies`
--

DROP TABLE IF EXISTS `currencies`;
/*!50001 DROP VIEW IF EXISTS `currencies`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `currencies` AS SELECT 
 1 AS `entity_id`,
 1 AS `name`,
 1 AS `entity_type_id`,
 1 AS `attributes`,
 1 AS `update_date`,
 1 AS `updated_user_id`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `entities`
--

DROP TABLE IF EXISTS `entities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entities` (
  `entity_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `entity_type_id` int NOT NULL,
  `attributes` json DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  PRIMARY KEY (`entity_id`),
  KEY `fk_entities_entity_type` (`entity_type_id`),
  CONSTRAINT `fk_entities_entity_type` FOREIGN KEY (`entity_type_id`) REFERENCES `entity_types` (`entity_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=647 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entity_types`
--

DROP TABLE IF EXISTS `entity_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entity_types` (
  `entity_type_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `attributes_schema` json DEFAULT NULL,
  `short_label` varchar(5) DEFAULT NULL,
  `label_color` char(6) DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  `entity_category` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`entity_type_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=257 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `instruments`
--

DROP TABLE IF EXISTS `instruments`;
/*!50001 DROP VIEW IF EXISTS `instruments`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `instruments` AS SELECT 
 1 AS `entity_id`,
 1 AS `name`,
 1 AS `entity_type_id`,
 1 AS `attributes`,
 1 AS `update_date`,
 1 AS `updated_user_id`*/;
SET character_set_client = @saved_cs_client;

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
) ENGINE=InnoDB AUTO_INCREMENT=90 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lambda_locks`
--

DROP TABLE IF EXISTS `lambda_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lambda_locks` (
  `lock_id` varchar(64) NOT NULL,
  `holder` varchar(255) DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`lock_id`)
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
  `name` varchar(255) NOT NULL,
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
  `name` varchar(255) NOT NULL,
  `properties` json DEFAULT NULL,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_user_id` int DEFAULT NULL,
  PRIMARY KEY (`transaction_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

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
) ENGINE=InnoDB AUTO_INCREMENT=236 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

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
-- Final view structure for view `client_group_user_view`
--

/*!50001 DROP VIEW IF EXISTS `client_group_user_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`admin`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `client_group_user_view` AS select `cgu`.`client_group_id` AS `client_group_id`,`cg`.`name` AS `client_group_name`,`cgu`.`user_id` AS `user_id`,`us`.`email` AS `email` from ((`client_group_users` `cgu` join `client_groups` `cg` on((`cgu`.`client_group_id` = `cg`.`client_group_id`))) join `users` `us` on((`cgu`.`user_id` = `us`.`user_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `currencies`
--

/*!50001 DROP VIEW IF EXISTS `currencies`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`admin`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `currencies` AS select `en`.`entity_id` AS `entity_id`,`en`.`name` AS `name`,`en`.`entity_type_id` AS `entity_type_id`,`en`.`attributes` AS `attributes`,`en`.`update_date` AS `update_date`,`en`.`updated_user_id` AS `updated_user_id` from (`entities` `en` left join `entity_types` `et` on((`en`.`entity_type_id` = `et`.`entity_type_id`))) where (`et`.`entity_category` = 'Currency') */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `instruments`
--

/*!50001 DROP VIEW IF EXISTS `instruments`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`admin`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `instruments` AS select `en`.`entity_id` AS `entity_id`,`en`.`name` AS `name`,`en`.`entity_type_id` AS `entity_type_id`,`en`.`attributes` AS `attributes`,`en`.`update_date` AS `update_date`,`en`.`updated_user_id` AS `updated_user_id` from (`entities` `en` left join `entity_types` `et` on((`en`.`entity_type_id` = `et`.`entity_type_id`))) where (`et`.`entity_category` = 'Instrument') */;
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

-- Dump completed on 2025-09-30 13:04:33
-- =============================================================================
-- OneBor Database Schema Export
-- Generated on: 2025-09-30 13:04:24
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

