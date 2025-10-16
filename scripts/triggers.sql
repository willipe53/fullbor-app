-- Audit triggers for table `client_group_entities`

DELIMITER $$

CREATE TRIGGER `after_client_group_entities_insert`
AFTER INSERT ON `client_group_entities`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('client_group_entities', NEW.`client_group_entity_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_client_group_entities_update`
AFTER UPDATE ON `client_group_entities`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('client_group_entities', NEW.`client_group_entity_id`, NEW.`updated_user_id`, 'UPDATE', JSON_MERGE_PATCH(IF(OLD.`client_group_id` <=> NEW.`client_group_id`, JSON_OBJECT(), JSON_OBJECT('client_group_id', JSON_ARRAY(OLD.`client_group_id`, NEW.`client_group_id`))), IF(OLD.`entity_id` <=> NEW.`entity_id`, JSON_OBJECT(), JSON_OBJECT('entity_id', JSON_ARRAY(OLD.`entity_id`, NEW.`entity_id`)))));
END$$

CREATE TRIGGER `after_client_group_entities_delete`
AFTER DELETE ON `client_group_entities`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('client_group_entities', OLD.`client_group_entity_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `client_group_users`

DELIMITER $$

CREATE TRIGGER `after_client_group_users_insert`
AFTER INSERT ON `client_group_users`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('client_group_users', NEW.`client_group_user_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_client_group_users_update`
AFTER UPDATE ON `client_group_users`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('client_group_users', NEW.`client_group_user_id`, NEW.`updated_user_id`, 'UPDATE', JSON_MERGE_PATCH(IF(OLD.`client_group_id` <=> NEW.`client_group_id`, JSON_OBJECT(), JSON_OBJECT('client_group_id', JSON_ARRAY(OLD.`client_group_id`, NEW.`client_group_id`))), IF(OLD.`user_id` <=> NEW.`user_id`, JSON_OBJECT(), JSON_OBJECT('user_id', JSON_ARRAY(OLD.`user_id`, NEW.`user_id`)))));
END$$

CREATE TRIGGER `after_client_group_users_delete`
AFTER DELETE ON `client_group_users`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('client_group_users', OLD.`client_group_user_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `client_groups`

DELIMITER $$

CREATE TRIGGER `after_client_groups_insert`
AFTER INSERT ON `client_groups`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('client_groups', NEW.`client_group_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_client_groups_update`
AFTER UPDATE ON `client_groups`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('client_groups', NEW.`client_group_id`, NEW.`updated_user_id`, 'UPDATE', JSON_MERGE_PATCH(IF(OLD.`client_group_name` <=> NEW.`client_group_name`, JSON_OBJECT(), JSON_OBJECT('client_group_name', JSON_ARRAY(OLD.`client_group_name`, NEW.`client_group_name`))), IF(OLD.`deleted` <=> NEW.`deleted`, JSON_OBJECT(), JSON_OBJECT('deleted', JSON_ARRAY(OLD.`deleted`, NEW.`deleted`))), json_diff_simple(OLD.`preferences`, NEW.`preferences`)));
END$$

CREATE TRIGGER `after_client_groups_delete`
AFTER DELETE ON `client_groups`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('client_groups', OLD.`client_group_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `entities`

DELIMITER $$

CREATE TRIGGER `after_entities_insert`
AFTER INSERT ON `entities`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('entities', NEW.`entity_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_entities_update`
AFTER UPDATE ON `entities`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('entities', NEW.`entity_id`, NEW.`updated_user_id`, 'UPDATE', JSON_MERGE_PATCH(IF(OLD.`entity_name` <=> NEW.`entity_name`, JSON_OBJECT(), JSON_OBJECT('entity_name', JSON_ARRAY(OLD.`entity_name`, NEW.`entity_name`))), IF(OLD.`entity_type_id` <=> NEW.`entity_type_id`, JSON_OBJECT(), JSON_OBJECT('entity_type_id', JSON_ARRAY(OLD.`entity_type_id`, NEW.`entity_type_id`))), IF(OLD.`unitized` <=> NEW.`unitized`, JSON_OBJECT(), JSON_OBJECT('unitized', JSON_ARRAY(OLD.`unitized`, NEW.`unitized`))), IF(OLD.`deleted` <=> NEW.`deleted`, JSON_OBJECT(), JSON_OBJECT('deleted', JSON_ARRAY(OLD.`deleted`, NEW.`deleted`))), json_diff_simple(OLD.`attributes`, NEW.`attributes`)));
END$$

CREATE TRIGGER `after_entities_delete`
AFTER DELETE ON `entities`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('entities', OLD.`entity_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `entity_types`

DELIMITER $$

CREATE TRIGGER `after_entity_types_insert`
AFTER INSERT ON `entity_types`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('entity_types', NEW.`entity_type_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_entity_types_update`
AFTER UPDATE ON `entity_types`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('entity_types', NEW.`entity_type_id`, NEW.`updated_user_id`, 'UPDATE', JSON_MERGE_PATCH(IF(OLD.`entity_type_name` <=> NEW.`entity_type_name`, JSON_OBJECT(), JSON_OBJECT('entity_type_name', JSON_ARRAY(OLD.`entity_type_name`, NEW.`entity_type_name`))), IF(OLD.`short_label` <=> NEW.`short_label`, JSON_OBJECT(), JSON_OBJECT('short_label', JSON_ARRAY(OLD.`short_label`, NEW.`short_label`))), IF(OLD.`label_color` <=> NEW.`label_color`, JSON_OBJECT(), JSON_OBJECT('label_color', JSON_ARRAY(OLD.`label_color`, NEW.`label_color`))), IF(OLD.`entity_category` <=> NEW.`entity_category`, JSON_OBJECT(), JSON_OBJECT('entity_category', JSON_ARRAY(OLD.`entity_category`, NEW.`entity_category`))), json_diff_simple(OLD.`attributes_schema`, NEW.`attributes_schema`)));
END$$

CREATE TRIGGER `after_entity_types_delete`
AFTER DELETE ON `entity_types`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('entity_types', OLD.`entity_type_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `invitations`

DELIMITER $$

CREATE TRIGGER `after_invitations_insert`
AFTER INSERT ON `invitations`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('invitations', NEW.`invitation_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_invitations_update`
AFTER UPDATE ON `invitations`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('invitations', NEW.`invitation_id`, NEW.`updated_user_id`, 'UPDATE', JSON_MERGE_PATCH(IF(OLD.`code` <=> NEW.`code`, JSON_OBJECT(), JSON_OBJECT('code', JSON_ARRAY(OLD.`code`, NEW.`code`))), IF(OLD.`expires_at` <=> NEW.`expires_at`, JSON_OBJECT(), JSON_OBJECT('expires_at', JSON_ARRAY(OLD.`expires_at`, NEW.`expires_at`))), IF(OLD.`client_group_id` <=> NEW.`client_group_id`, JSON_OBJECT(), JSON_OBJECT('client_group_id', JSON_ARRAY(OLD.`client_group_id`, NEW.`client_group_id`))), IF(OLD.`email_sent_to` <=> NEW.`email_sent_to`, JSON_OBJECT(), JSON_OBJECT('email_sent_to', JSON_ARRAY(OLD.`email_sent_to`, NEW.`email_sent_to`)))));
END$$

CREATE TRIGGER `after_invitations_delete`
AFTER DELETE ON `invitations`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('invitations', OLD.`invitation_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `trading_days`

DELIMITER $$

CREATE TRIGGER `after_trading_days_insert`
AFTER INSERT ON `trading_days`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('trading_days', NEW.`trading_day_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_trading_days_update`
AFTER UPDATE ON `trading_days`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('trading_days', NEW.`trading_day_id`, NEW.`updated_user_id`, 'UPDATE', IF(OLD.`trading_day` <=> NEW.`trading_day`, JSON_OBJECT(), JSON_OBJECT('trading_day', JSON_ARRAY(OLD.`trading_day`, NEW.`trading_day`))));
END$$

CREATE TRIGGER `after_trading_days_delete`
AFTER DELETE ON `trading_days`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('trading_days', OLD.`trading_day_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `transaction_statuses`

DELIMITER $$

CREATE TRIGGER `after_transaction_statuses_insert`
AFTER INSERT ON `transaction_statuses`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('transaction_statuses', NEW.`transaction_status_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_transaction_statuses_update`
AFTER UPDATE ON `transaction_statuses`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('transaction_statuses', NEW.`transaction_status_id`, NEW.`updated_user_id`, 'UPDATE', IF(OLD.`transaction_status_name` <=> NEW.`transaction_status_name`, JSON_OBJECT(), JSON_OBJECT('transaction_status_name', JSON_ARRAY(OLD.`transaction_status_name`, NEW.`transaction_status_name`))));
END$$

CREATE TRIGGER `after_transaction_statuses_delete`
AFTER DELETE ON `transaction_statuses`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('transaction_statuses', OLD.`transaction_status_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `transaction_types`

DELIMITER $$

CREATE TRIGGER `after_transaction_types_insert`
AFTER INSERT ON `transaction_types`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('transaction_types', NEW.`transaction_type_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_transaction_types_update`
AFTER UPDATE ON `transaction_types`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('transaction_types', NEW.`transaction_type_id`, NEW.`updated_user_id`, 'UPDATE', JSON_MERGE_PATCH(IF(OLD.`transaction_type_name` <=> NEW.`transaction_type_name`, JSON_OBJECT(), JSON_OBJECT('transaction_type_name', JSON_ARRAY(OLD.`transaction_type_name`, NEW.`transaction_type_name`))), json_diff_simple(OLD.`properties`, NEW.`properties`)));
END$$

CREATE TRIGGER `after_transaction_types_delete`
AFTER DELETE ON `transaction_types`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('transaction_types', OLD.`transaction_type_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `transactions`

DELIMITER $$

CREATE TRIGGER `after_transactions_insert`
AFTER INSERT ON `transactions`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('transactions', NEW.`transaction_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_transactions_update`
AFTER UPDATE ON `transactions`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('transactions', NEW.`transaction_id`, NEW.`updated_user_id`, 'UPDATE', JSON_MERGE_PATCH(IF(OLD.`portfolio_entity_id` <=> NEW.`portfolio_entity_id`, JSON_OBJECT(), JSON_OBJECT('portfolio_entity_id', JSON_ARRAY(OLD.`portfolio_entity_id`, NEW.`portfolio_entity_id`))), IF(OLD.`contra_entity_id` <=> NEW.`contra_entity_id`, JSON_OBJECT(), JSON_OBJECT('contra_entity_id', JSON_ARRAY(OLD.`contra_entity_id`, NEW.`contra_entity_id`))), IF(OLD.`instrument_entity_id` <=> NEW.`instrument_entity_id`, JSON_OBJECT(), JSON_OBJECT('instrument_entity_id', JSON_ARRAY(OLD.`instrument_entity_id`, NEW.`instrument_entity_id`))), IF(OLD.`transaction_status_id` <=> NEW.`transaction_status_id`, JSON_OBJECT(), JSON_OBJECT('transaction_status_id', JSON_ARRAY(OLD.`transaction_status_id`, NEW.`transaction_status_id`))), IF(OLD.`transaction_type_id` <=> NEW.`transaction_type_id`, JSON_OBJECT(), JSON_OBJECT('transaction_type_id', JSON_ARRAY(OLD.`transaction_type_id`, NEW.`transaction_type_id`))), IF(OLD.`trade_date` <=> NEW.`trade_date`, JSON_OBJECT(), JSON_OBJECT('trade_date', JSON_ARRAY(OLD.`trade_date`, NEW.`trade_date`))), IF(OLD.`settle_date` <=> NEW.`settle_date`, JSON_OBJECT(), JSON_OBJECT('settle_date', JSON_ARRAY(OLD.`settle_date`, NEW.`settle_date`))), IF(OLD.`deleted` <=> NEW.`deleted`, JSON_OBJECT(), JSON_OBJECT('deleted', JSON_ARRAY(OLD.`deleted`, NEW.`deleted`))), json_diff_simple(OLD.`properties`, NEW.`properties`)));
END$$

CREATE TRIGGER `after_transactions_delete`
AFTER DELETE ON `transactions`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('transactions', OLD.`transaction_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
-- Audit triggers for table `users`

DELIMITER $$

CREATE TRIGGER `after_users_insert`
AFTER INSERT ON `users`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('users', NEW.`user_id`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
END$$

CREATE TRIGGER `after_users_update`
AFTER UPDATE ON `users`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('users', NEW.`user_id`, NEW.`updated_user_id`, 'UPDATE', JSON_MERGE_PATCH(IF(OLD.`sub` <=> NEW.`sub`, JSON_OBJECT(), JSON_OBJECT('sub', JSON_ARRAY(OLD.`sub`, NEW.`sub`))), IF(OLD.`email` <=> NEW.`email`, JSON_OBJECT(), JSON_OBJECT('email', JSON_ARRAY(OLD.`email`, NEW.`email`))), IF(OLD.`primary_client_group_id` <=> NEW.`primary_client_group_id`, JSON_OBJECT(), JSON_OBJECT('primary_client_group_id', JSON_ARRAY(OLD.`primary_client_group_id`, NEW.`primary_client_group_id`))), IF(OLD.`deleted` <=> NEW.`deleted`, JSON_OBJECT(), JSON_OBJECT('deleted', JSON_ARRAY(OLD.`deleted`, NEW.`deleted`))), json_diff_simple(OLD.`preferences`, NEW.`preferences`)));
END$$

CREATE TRIGGER `after_users_delete`
AFTER DELETE ON `users`
FOR EACH ROW
BEGIN
    INSERT INTO `audit_log` (table_name, primary_key, updated_user_id, action, changes)
    VALUES ('users', OLD.`user_id`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
END$$

DELIMITER ;
