#!/usr/bin/env python3
import os
import sys
import time
import json
import boto3
import logging
from datetime import datetime, timedelta
from botocore.exceptions import BotoCoreError, ClientError
from datacache import DataCache

# ==============================
# Configuration
# ==============================
REGION = os.environ.get("AWS_REGION", "us-east-2")
SECRET_ARN = os.environ.get(
    "SECRET_ARN",
    "arn:aws:secretsmanager:us-east-2:316490106381:secret:PandaDbSecretCache-pdzjei"
)
POLL_INTERVAL = 5  # seconds between polls when idle
IDLE_TIMEOUT = 30  # minutes after which the instance commits suicide

# ==============================
# Logging setup (CloudWatch-compatible)
# ==============================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
    force=True
)
logger = logging.getLogger(__name__)

# ==============================
# AWS Clients (initialized in main after credentials are available)
# ==============================
sqs = None
ec2 = None
cache = None
position_keeper_user_id = None  # Will be set during startup

# ==============================
# Secret retrieval
# ==============================


def load_secret_values(secret_arn):
    """Load secrets from environment variables."""
    # Load from environment variables (set by systemd service)
    if all(key in os.environ for key in ['QUEUE_URL', 'PK_INSTANCE']):
        logger.info("Loading secrets from environment variables")
        return {
            'DB_HOST': os.environ.get('DB_HOST'),
            'DB_USER': os.environ.get('DB_USER'),
            'DB_PASS': os.environ.get('DB_PASS'),
            'DATABASE': os.environ.get('DATABASE'),
            'QUEUE_URL': os.environ.get('QUEUE_URL'),
            'PK_INSTANCE': os.environ.get('PK_INSTANCE')
        }
    else:
        logger.error(
            "Required environment variables not set (QUEUE_URL, PK_INSTANCE)")
        raise ValueError("Missing required environment variables")

# ==============================
# SQS message handling
# ==============================


# Track last message processing time
last_message_time = datetime.now()


def process_transaction(message_data):
    """Process a transaction message (create, update, or delete)."""
    try:
        transaction_id = message_data.get("transaction_id")
        transaction_status_id = message_data.get("transaction_status_id")
        transaction_type_id = message_data.get("transaction_type_id")
        updated_user_id = message_data.get("updated_user_id")

        # Look up transaction type name and position keeping actions from cache
        transaction_types_df = cache.cache.get("transaction_types")
        transaction_type_row = transaction_types_df[transaction_types_df['transaction_type_id']
                                                    == transaction_type_id]

        if transaction_type_row.empty:
            logger.warning(
                f"Transaction type {transaction_type_id} not found in cache for transaction {transaction_id}")
            return

        transaction_type_name = transaction_type_row.iloc[0]['transaction_type_name']
        properties = transaction_type_row.iloc[0].get('properties', {})
        if isinstance(properties, str):
            properties = json.loads(properties)
        position_keeping_actions = properties.get(
            'position_keeping_actions', 'None')

        # Look up user email from cache
        users_df = cache.cache.get("users")
        user_row = users_df[users_df['user_id'] == updated_user_id]
        email = user_row.iloc[0]['email'] if not user_row.empty else "Unknown"

        # Look up transaction status name from cache
        transaction_statuses_df = cache.cache.get("transaction_statuses")
        transaction_status_row = transaction_statuses_df[
            transaction_statuses_df['transaction_status_id'] == transaction_status_id]
        transaction_status_name = transaction_status_row.iloc[0][
            'transaction_status_name'] if not transaction_status_row.empty else f"Unknown({transaction_status_id})"

        # Handle INCOMPLETE transactions (status 1)
        if transaction_status_id == 1:
            logger.info(
                f"{transaction_status_name} saved transaction {transaction_id} by {email} ignored.")
            return

        # Handle NEW (status 2) or AMENDED (status 4) transactions
        if transaction_status_id in [2, 4]:
            # Look up entity names from cache
            entities_df = cache.cache.get("entities")

            portfolio_entity_id = message_data.get("portfolio_entity_id")
            contra_entity_id = message_data.get("contra_entity_id")
            instrument_entity_id = message_data.get("instrument_entity_id")

            portfolio_entity_name = "None"
            if portfolio_entity_id:
                portfolio_row = entities_df[entities_df['entity_id']
                                            == portfolio_entity_id]
                portfolio_entity_name = portfolio_row.iloc[0][
                    'entity_name'] if not portfolio_row.empty else f"Unknown({portfolio_entity_id})"

            contra_entity_name = "None"
            if contra_entity_id:
                contra_row = entities_df[entities_df['entity_id']
                                         == contra_entity_id]
                contra_entity_name = contra_row.iloc[0][
                    'entity_name'] if not contra_row.empty else f"Unknown({contra_entity_id})"

            instrument_entity_name = "None"
            if instrument_entity_id:
                instrument_row = entities_df[entities_df['entity_id']
                                             == instrument_entity_id]
                instrument_entity_name = instrument_row.iloc[0][
                    'entity_name'] if not instrument_row.empty else f"Unknown({instrument_entity_id})"

            trade_date = message_data.get("trade_date")
            settle_date = message_data.get("settle_date")
            transaction_properties = message_data.get("properties", {})
            timestamp = message_data.get("timestamp")
            changes = message_data.get("changes", {})

            status_label = "NEW" if transaction_status_id == 2 else "AMENDED"

            logger.info(f"""
{status_label} transaction {transaction_id}:
    Portfolio {portfolio_entity_id} {portfolio_entity_name}
    Contra {contra_entity_id} {contra_entity_name}
    Instrument {instrument_entity_id} {instrument_entity_name}
    Transaction Type {transaction_type_id} {transaction_type_name}
    Properties {transaction_properties}
    User {updated_user_id} {email}
    Timestamp {timestamp}
    Trade Date {trade_date}
    Settle Date {settle_date}
    Position Keeping Actions {position_keeping_actions}
    Changes {changes}
""")

            # Update transaction status to PROCESSED (status 3)
            # Position Keeper uses the HEADLESS POSITION KEEPER user_id
            try:
                with cache.cursor() as cursor:
                    cursor.execute(
                        "UPDATE transactions SET transaction_status_id = 3, updated_user_id = %s, update_date = NOW() WHERE transaction_id = %s",
                        (position_keeper_user_id, transaction_id)
                    )
                    cache.conn.commit()
                    logger.info(
                        f"Transaction {transaction_id} marked as PROCESSED by Position Keeper (user {position_keeper_user_id})")
            except Exception as e:
                logger.error(
                    f"Failed to update transaction {transaction_id} status: {e}")

            return

        # Handle unknown status
        logger.warning(
            f"WARNING: Unrecognized {transaction_type_name} type transaction {transaction_id} with status {transaction_status_id} ignored.")

    except Exception as e:
        logger.error(f"Error processing transaction message: {e}")
        import traceback
        logger.error(traceback.format_exc())


def process_message(msg):
    """Process and log an SQS message."""
    global last_message_time
    body = msg.get("Body", "")
    message_id = msg.get("MessageId", "unknown")
    logger.info(f"Received message {message_id}: {body}")

    # Update last message time
    last_message_time = datetime.now()

    # Parse and handle messages
    try:
        message_data = json.loads(body)
        operation = message_data.get("operation")

        if operation == "refresh_cache":
            table = message_data.get("table")
            primary_key = message_data.get("primary_key")
            primary_key_column = message_data.get("primary_key_column", "id")

            if not table:
                logger.warning(
                    f"Cache refresh message missing 'table' field: {body}")
                return

            if primary_key is not None:
                # Refresh single record
                logger.info(
                    f"Refreshing single record: table={table}, {primary_key_column}={primary_key}")
                cache.refresh_record(table, primary_key, primary_key_column)
            else:
                # Refresh entire table
                logger.info(f"Refreshing entire table: {table}")
                cache.refresh(table)

        elif operation in ["create", "update", "delete"]:
            # Handle transaction messages
            process_transaction(message_data)

        else:
            logger.info(f"Unrecognized operation: {operation}")

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse message as JSON: {e}")
    except Exception as e:
        logger.error(f"Error processing message: {e}")


def shutdown_instance(instance_id):
    """Stop the EC2 instance."""
    try:
        logger.info(
            f"Idle timeout reached. Shutting down instance {instance_id}")

        # Stop the EC2 instance
        logger.info(f"Stopping EC2 instance: {instance_id}")

        # Flush all log handlers to ensure messages reach CloudWatch
        for handler in logger.handlers:
            handler.flush()
        for handler in logging.root.handlers:
            handler.flush()

        # Give CloudWatch agent time to pick up the logs
        time.sleep(2)

        ec2.stop_instances(InstanceIds=[instance_id])
        logger.info(f"Instance {instance_id} stop command sent successfully")

        # Final flush after stop command
        for handler in logger.handlers:
            handler.flush()
        for handler in logging.root.handlers:
            handler.flush()

        # Final delay for last log message
        time.sleep(1)

    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
        raise


def poll_sqs_forever(queue_url, instance_id):
    """Continuously poll the SQS queue and process messages."""
    global last_message_time
    logger.info(f"Starting SQS poller for queue: {queue_url}")
    logger.info(f"Idle timeout set to {IDLE_TIMEOUT} minutes")

    while True:
        try:
            # Check for idle timeout
            idle_duration = datetime.now() - last_message_time
            idle_minutes = idle_duration.total_seconds() / 60

            if idle_minutes >= IDLE_TIMEOUT:
                logger.warning(
                    f"Idle timeout reached ({idle_minutes:.1f} minutes). Initiating shutdown...")
                shutdown_instance(instance_id)
                logger.info("Shutdown complete. Exiting.")
                exit(0)

            resp = sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=5,
                WaitTimeSeconds=20,  # long polling
                VisibilityTimeout=30
            )

            messages = resp.get("Messages", [])
            if not messages:
                time.sleep(POLL_INTERVAL)
                continue

            for msg in messages:
                process_message(msg)

                # delete message after successful processing
                sqs.delete_message(
                    QueueUrl=queue_url,
                    ReceiptHandle=msg["ReceiptHandle"]
                )

        except (BotoCoreError, ClientError) as e:
            logger.error(f"SQS error: {e}")
            time.sleep(10)

        except Exception as e:
            logger.exception(f"Unexpected error: {e}")
            time.sleep(10)


def ensure_position_keeper_user():
    """Ensure the HEADLESS POSITION KEEPER user exists in the database."""
    global position_keeper_user_id

    try:
        with cache.cursor() as cursor:
            # Try to find existing HEADLESS POSITION KEEPER user
            cursor.execute(
                "SELECT user_id FROM users WHERE sub = %s AND deleted = false",
                ("HEADLESS POSITION KEEPER",)
            )
            result = cursor.fetchone()

            if result:
                position_keeper_user_id = result[0]
                logger.info(
                    f"Found existing HEADLESS POSITION KEEPER user: user_id={position_keeper_user_id}")
                return position_keeper_user_id

            # User doesn't exist, create it
            logger.info("HEADLESS POSITION KEEPER user not found, creating...")

            # Use a bootstrap user_id for the initial creation (user 1 is typically admin)
            # This will be self-referential after creation
            cursor.execute(
                """INSERT INTO users (sub, email, updated_user_id) 
                   VALUES (%s, %s, %s)""",
                ("HEADLESS POSITION KEEPER", "info@fullbor.ai", 1)
            )
            cache.conn.commit()

            # Confirm creation by querying again
            cursor.execute(
                "SELECT user_id FROM users WHERE sub = %s",
                ("HEADLESS POSITION KEEPER",)
            )
            result = cursor.fetchone()

            if result:
                position_keeper_user_id = result[0]
                logger.info(
                    f"Created HEADLESS POSITION KEEPER user: user_id={position_keeper_user_id}")

                # Update the user to reference itself as the creator
                cursor.execute(
                    "UPDATE users SET updated_user_id = %s WHERE user_id = %s",
                    (position_keeper_user_id, position_keeper_user_id)
                )
                cache.conn.commit()

                # Refresh the users cache to include the new user
                cache.refresh("users")

                return position_keeper_user_id
            else:
                raise Exception(
                    "Failed to create HEADLESS POSITION KEEPER user")

    except Exception as e:
        logger.error(f"Error ensuring HEADLESS POSITION KEEPER user: {e}")
        raise


# ==============================
# Main entry
# ==============================
def main():
    global sqs, ec2, cache

    # Load configuration from environment
    secrets = load_secret_values(SECRET_ARN)

    # Initialize AWS clients with proper credentials
    logger.info("Initializing AWS clients...")
    sqs = boto3.client("sqs", region_name=REGION)
    ec2 = boto3.client("ec2", region_name=REGION)
    logger.info("AWS clients initialized successfully")

    cache = DataCache(
        host=secrets.get("DB_HOST"),
        user=secrets.get("DB_USER"),
        password=secrets.get("DB_PASS"),
        db=secrets.get("DATABASE"),
        tables=["entities", "entity_types", "transaction_types",
                "users", "transaction_statuses"]
    )
    QUEUE_URL = secrets.get("QUEUE_URL")
    INSTANCE_ID = secrets.get("PK_INSTANCE")

    if not QUEUE_URL:
        logger.error(
            "QUEUE_URL is missing from secrets — cannot start poller.")
        exit(1)

    if not INSTANCE_ID:
        logger.error(
            "PK_INSTANCE is missing from secrets — cannot determine instance ID.")
        exit(1)

    logger.info("Configuration summary:")
    logger.info(f"  QUEUE_URL: {QUEUE_URL}")
    logger.info(f"  INSTANCE_ID: {INSTANCE_ID}")

    logger.info("Refreshing cache...")
    cache.refresh_all()

    # Ensure HEADLESS POSITION KEEPER user exists
    logger.info("Ensuring HEADLESS POSITION KEEPER user exists...")
    ensure_position_keeper_user()
    logger.info(
        f"Position Keeper will use user_id={position_keeper_user_id} for database updates")

    poll_sqs_forever(QUEUE_URL, INSTANCE_ID)


if __name__ == "__main__":
    main()
