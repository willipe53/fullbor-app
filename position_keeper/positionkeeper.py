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
IDLE_TIMEOUT = 15  # minutes after which the instance commits suicide

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


def process_message(msg):
    """Process and log an SQS message."""
    global last_message_time
    body = msg.get("Body", "")
    message_id = msg.get("MessageId", "unknown")
    logger.info(f"Received message {message_id}: {body}")

    # Update last message time
    last_message_time = datetime.now()

    # Parse and handle cache refresh operations
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
        ec2.stop_instances(InstanceIds=[instance_id])
        logger.info(f"Instance {instance_id} stop command sent successfully")

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
        tables=["entities", "transaction_types", "entity_types"]
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

    poll_sqs_forever(QUEUE_URL, INSTANCE_ID)


if __name__ == "__main__":
    main()
