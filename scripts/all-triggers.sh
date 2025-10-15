#!/bin/bash
# Generate audit triggers for all tables
# This script calls generate-trigger.py with the correct columns for each table

./generate-trigger.py client_group_entities client_group_entity_id client_group_id entity_id

./generate-trigger.py client_group_users client_group_user_id client_group_id user_id

./generate-trigger.py client_groups client_group_id client_group_name deleted preferences:json

./generate-trigger.py entities entity_id entity_name entity_type_id unitized deleted attributes:json

./generate-trigger.py entity_types entity_type_id entity_type_name short_label label_color entity_category attributes_schema:json

./generate-trigger.py invitations invitation_id code expires_at client_group_id email_sent_to

./generate-trigger.py trading_days trading_day_id trading_day

./generate-trigger.py transaction_statuses transaction_status_id transaction_status_name

./generate-trigger.py transaction_types transaction_type_id transaction_type_name properties:json

./generate-trigger.py transactions transaction_id portfolio_entity_id contra_entity_id instrument_entity_id transaction_status_id transaction_type_id trade_date settle_date deleted properties:json

./generate-trigger.py users user_id sub email primary_client_group_id deleted preferences:json
