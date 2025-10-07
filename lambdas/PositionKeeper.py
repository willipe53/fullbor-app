import json
import boto3
import pymysql
import os
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
from typing import Dict, Any, Optional

# Global caches for transaction types and entities
_transaction_types_cache: Dict[int, Dict[str, Any]] = {}
_entities_cache: Dict[int, str] = {}


def get_lambda_client():
    """Get AWS Lambda client."""
    return boto3.client('lambda', region_name='us-east-2')


def get_sqs_client():
    """Get AWS SQS client."""
    return boto3.client('sqs', region_name='us-east-2')


def get_db_connection():
    """Get database connection using secrets manager."""
    try:
        # Get secret from AWS Secrets Manager
        secrets_client = boto3.client(
            'secretsmanager', region_name='us-east-2')
        secret_arn = os.environ.get('SECRET_ARN')

        if not secret_arn:
            raise Exception("SECRET_ARN environment variable not set")

        response = secrets_client.get_secret_value(SecretId=secret_arn)
        secret = json.loads(response['SecretString'])

        connection = pymysql.connect(
            host=secret['DB_HOST'],
            user=secret['DB_USER'],
            password=secret['DB_PASS'],
            database=secret['DATABASE'],
            connect_timeout=10,
            read_timeout=10,
            write_timeout=10
        )
        return connection
    except Exception as e:
        raise Exception(f"Failed to connect to database: {str(e)}")


def acquire_lock(connection, lock_id, holder, expires_at):
    """Try to acquire a lock in the database."""
    try:
        with connection.cursor() as cursor:
            # Try to insert the lock
            cursor.execute(
                "INSERT INTO lambda_locks (lock_id, holder, expires_at) VALUES (%s, %s, %s)",
                (lock_id, holder, expires_at)
            )
            connection.commit()
            return True
    except pymysql.IntegrityError:
        # Lock already exists (primary key constraint violation)
        return False
    except Exception as e:
        raise Exception(f"Failed to acquire lock: {str(e)}")


def release_lock(connection, lock_id):
    """Release a lock from the database."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM lambda_locks WHERE lock_id = %s",
                (lock_id,)
            )
            connection.commit()
            return cursor.rowcount > 0
    except Exception as e:
        raise Exception(f"Failed to release lock: {str(e)}")


def get_lock_status(connection, lock_id):
    """Get the current status of a lock."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT holder, expires_at FROM lambda_locks WHERE lock_id = %s",
                (lock_id,)
            )
            result = cursor.fetchone()
            if result:
                return {
                    'holder': result[0],
                    'expires_at': result[1],
                    'is_active': result[1] > datetime.utcnow()
                }
            return None
    except Exception as e:
        raise Exception(f"Failed to get lock status: {str(e)}")


def load_transaction_types_cache(connection):
    """Load all transaction types into memory cache."""
    global _transaction_types_cache
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT transaction_type_id, transaction_type_name, properties
                FROM transaction_types
            """)
            results = cursor.fetchall()

            for row in results:
                transaction_type_id = row[0]
                transaction_type_name = row[1]
                properties_json = row[2]

                # Parse properties JSON
                properties = {}
                if properties_json:
                    try:
                        properties = json.loads(properties_json)
                    except json.JSONDecodeError:
                        print(
                            f"Warning: Failed to parse properties for transaction type {transaction_type_id}")

                _transaction_types_cache[transaction_type_id] = {
                    'name': transaction_type_name,
                    'properties': properties
                }

            print(
                f"Loaded {len(_transaction_types_cache)} transaction types into cache")
    except Exception as e:
        print(f"Error loading transaction types cache: {str(e)}")
        raise


def load_entities_cache(connection):
    """Load all entity names into memory cache."""
    global _entities_cache
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT entity_id, entity_name
                FROM entities
            """)
            results = cursor.fetchall()

            for row in results:
                entity_id = row[0]
                entity_name = row[1]
                _entities_cache[entity_id] = entity_name

            print(f"Loaded {len(_entities_cache)} entities into cache")
    except Exception as e:
        print(f"Error loading entities cache: {str(e)}")
        raise


def process_position_keeping(
    transaction_type_name: str,
    properties: Dict[str, Any],
    current_position_date_field: str,
    forecast_position_date_field: str,
    position_keeping_actions: list,
    portfolio_name: str,
    instrument_name: str
):
    """
    Process position keeping logic based on transaction type rules.

    Args:
        transaction_type_name: Name of the transaction type
        properties: Transaction properties
        current_position_date_field: Field name for current position date
        forecast_position_date_field: Field name for forecast position date
        position_keeping_actions: List of position keeping actions
        portfolio_name: Name of the portfolio
        instrument_name: Name of the instrument
    """
    print(f"\n=== Processing Position Keeping for {transaction_type_name} ===")
    print(f"Portfolio: {portfolio_name}")
    print(f"Instrument: {instrument_name}")
    print(f"Transaction Properties: {json.dumps(properties, indent=2)}")
    print(f"Current Position Date Field: {current_position_date_field}")
    print(f"Forecast Position Date Field: {forecast_position_date_field}")
    print(
        f"Position Keeping Actions: {json.dumps(position_keeping_actions, indent=2)}")

    # Extract dates from properties
    current_date = properties.get(current_position_date_field)
    forecast_date = properties.get(forecast_position_date_field)

    print(f"Current Position Date: {current_date}")
    print(f"Forecast Position Date: {forecast_date}")

    # Process each position keeping action
    for action in position_keeping_actions:
        print(f"\nProcessing action: {json.dumps(action, indent=2)}")
        # TODO: Implement actual position creation/update logic
        # For now, just log the action

    print("=== Position Keeping Complete ===\n")


def process_transaction_message(message_body: Dict[str, Any]) -> bool:
    """
    Process a single transaction message from SQS by creating positions
    based on transaction type rules.

    Args:
        message_body: The parsed message body from SQS

    Returns:
        bool: True if processing was successful, False otherwise
    """
    try:
        operation = message_body.get("operation")
        transaction_id = message_body.get("transaction_id")
        transaction_type_id = message_body.get("transaction_type_id")
        portfolio_entity_id = message_body.get("portfolio_entity_id")
        contra_entity_id = message_body.get("contra_entity_id")
        instrument_entity_id = message_body.get("instrument_entity_id")
        properties = message_body.get("properties", {})

        # Parse properties if it's a JSON string
        if isinstance(properties, str):
            try:
                properties = json.loads(properties)
            except json.JSONDecodeError as e:
                print(f"ERROR: Failed to parse properties JSON: {str(e)}")
                return False
        updated_user_id = message_body.get("updated_user_id")

        print(
            f"Processing {operation} operation for transaction ID: {transaction_id}")
        print(f"Transaction Type ID: {transaction_type_id}")

        # Get transaction type from cache (no database lookup needed!)
        transaction_type = _transaction_types_cache.get(transaction_type_id)
        if not transaction_type:
            print(
                f"ERROR: Transaction type {transaction_type_id} not found in cache")
            return False

        transaction_type_name = transaction_type['name']
        type_properties = transaction_type['properties']

        print(f"Transaction Type: {transaction_type_name}")

        # Extract position keeping rules
        current_position_date_field = type_properties.get("current_position")
        forecast_position_date_field = type_properties.get("forecast_position")
        position_keeping_actions = type_properties.get(
            "position_keeping_actions", [])

        if not current_position_date_field or not forecast_position_date_field:
            print(
                f"ERROR: Missing current_position or forecast_position in transaction type rules")
            return False

        if not position_keeping_actions:
            print(f"ERROR: No position_keeping_actions defined for transaction type")
            return False

        print(f"Current position date field: {current_position_date_field}")
        print(f"Forecast position date field: {forecast_position_date_field}")
        print(f"Position keeping actions: {position_keeping_actions}")

        # Get portfolio and instrument names from cache (no database lookup needed!)
        portfolio_name = _entities_cache.get(portfolio_entity_id)
        if not portfolio_name:
            portfolio_name = f"Portfolio {portfolio_entity_id} (name not found)"

        if instrument_entity_id:
            instrument_name = _entities_cache.get(instrument_entity_id)
            if not instrument_name:
                instrument_name = f"Instrument {instrument_entity_id} (name not found)"
        else:
            instrument_name = "Cash"

        print(f"Portfolio: {portfolio_name}")
        print(f"Instrument: {instrument_name}")

        # Process position keeping
        process_position_keeping(
            transaction_type_name,
            properties,
            current_position_date_field,
            forecast_position_date_field,
            position_keeping_actions,
            portfolio_name,
            instrument_name
        )

        # Update transaction status to PROCESSED (status_id = 3)
        connection = get_db_connection()
        cursor = connection.cursor()

        try:
            update_sql = """
            UPDATE transactions 
            SET transaction_status_id = 3, 
                updated_user_id = %s
            WHERE transaction_id = %s
            """
            cursor.execute(update_sql, (updated_user_id, transaction_id))
            connection.commit()

            print(
                f"Successfully processed {operation} for transaction {transaction_id}")
            return True

        except Exception as e:
            print(
                f"Database error processing transaction {transaction_id}: {str(e)}")
            connection.rollback()
            return False

        finally:
            cursor.close()
            connection.close()

    except Exception as e:
        print(f"Error processing message: {str(e)}")
        return False


def fetch_and_process_sqs_messages(sqs_client, queue_url: str) -> Dict[str, Any]:
    """
    Fetch all messages from SQS queue and process them.

    Args:
        sqs_client: Boto3 SQS client
        queue_url: URL of the SQS queue

    Returns:
        Dict with processing statistics
    """
    total_messages = 0
    successful = 0
    failed = 0

    print(f"Fetching messages from queue: {queue_url}")

    while True:
        try:
            # Receive messages from SQS (max 10 at a time)
            response = sqs_client.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=5,
                MessageAttributeNames=['All'],
                AttributeNames=['All']
            )

            messages = response.get('Messages', [])

            if not messages:
                print("No more messages in queue")
                break

            print(f"Received {len(messages)} messages from queue")

            for message in messages:
                total_messages += 1
                receipt_handle = message['ReceiptHandle']

                try:
                    # Parse message body
                    message_body = json.loads(message['Body'])
                    print(f"\n--- Processing message {total_messages} ---")
                    print(
                        f"Message body: {json.dumps(message_body, indent=2)}")

                    # Process the transaction message
                    if process_transaction_message(message_body):
                        successful += 1

                        # Delete the message from the queue after successful processing
                        sqs_client.delete_message(
                            QueueUrl=queue_url,
                            ReceiptHandle=receipt_handle
                        )
                        print(f"Message deleted from queue")
                    else:
                        failed += 1
                        print(f"Failed to process message, leaving in queue")

                except json.JSONDecodeError as e:
                    failed += 1
                    print(f"ERROR: Failed to parse message body: {str(e)}")
                    # Delete malformed messages
                    sqs_client.delete_message(
                        QueueUrl=queue_url,
                        ReceiptHandle=receipt_handle
                    )
                except Exception as e:
                    failed += 1
                    print(f"ERROR: Failed to process message: {str(e)}")

        except Exception as e:
            print(f"ERROR: Failed to receive messages from SQS: {str(e)}")
            break

    return {
        'total_messages': total_messages,
        'successful': successful,
        'failed': failed
    }


def lambda_handler(event, context):
    """
    Handle Position Keeper commands (start/stop).

    POST /position-keeper/start:
        - Checks if lock is set
        - If locked, returns error
        - If not locked:
            1. Sets the lock
            2. Fetches all new messages from SQS queue
            3. Processes each message
            4. Updates transaction status to PROCESSED
            5. Releases the lock

    POST /position-keeper/stop:
        - Releases the global lock
    """

    # Extract current user from headers (required by OpenAPI spec)
    current_user_id = event.get('headers', {}).get(
        'X-Current-User-Id', 'system')

    # Determine command from the URL path
    path = event.get('path', '')
    if path.endswith('/start'):
        command = 'start'
    elif path.endswith('/stop'):
        command = 'stop'
    else:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid endpoint. Use /position-keeper/start or /position-keeper/stop"}),
            "headers": {"Content-Type": "application/json"}
        }

    # Constants
    LOCK_ID = "v2 Position Keeper"
    SQS_QUEUE_URL = "https://sqs.us-east-2.amazonaws.com/316490106381/pandatransactions.fifo"

    holder = f"{context.log_stream_name}:{context.aws_request_id}"

    try:
        # Get database connection
        connection = get_db_connection()

        if command == 'stop':
            # Check if Position Keeper is running
            lock_status = get_lock_status(connection, LOCK_ID)

            if lock_status and lock_status['is_active']:
                # Release the lock
                release_lock(connection, LOCK_ID)

                response = {
                    "message": "Position Keeper stopped and lock released"
                }
            else:
                response = {
                    "message": "Position Keeper was not running"
                }

            connection.close()

            return {
                "statusCode": 200,
                "body": json.dumps(response),
                "headers": {"Content-Type": "application/json"}
            }

        elif command == 'start':
            # Check if lock is already set
            lock_status = get_lock_status(connection, LOCK_ID)

            if lock_status and lock_status['is_active']:
                connection.close()
                return {
                    "statusCode": 409,
                    "body": json.dumps({
                        "error": "Position Keeper is already running",
                        "status": "running",
                        "holder": lock_status['holder'],
                        "expires_at": lock_status['expires_at'].isoformat() if lock_status['expires_at'] else None
                    }),
                    "headers": {"Content-Type": "application/json"}
                }

            # Try to acquire lock
            expires_at = datetime.utcnow() + timedelta(minutes=5)  # 5 minute timeout

            if not acquire_lock(connection, LOCK_ID, holder, expires_at):
                connection.close()
                return {
                    "statusCode": 409,
                    "body": json.dumps({
                        "error": "Failed to acquire lock - Position Keeper may be starting",
                        "status": "locked"
                    }),
                    "headers": {"Content-Type": "application/json"}
                }

            print(f"Lock acquired by {holder}")

            try:
                # Load caches
                print("Loading transaction types cache...")
                load_transaction_types_cache(connection)

                print("Loading entities cache...")
                load_entities_cache(connection)

                # Get SQS client
                sqs_client = get_sqs_client()

                # Fetch and process all messages from SQS
                print("\nStarting SQS message processing...")
                stats = fetch_and_process_sqs_messages(
                    sqs_client, SQS_QUEUE_URL)

                print(f"\n=== Processing Complete ===")
                print(f"Total messages: {stats['total_messages']}")
                print(f"Successful: {stats['successful']}")
                print(f"Failed: {stats['failed']}")

                response = {
                    "message": "Position Keeper process completed",
                    "statistics": stats
                }

            finally:
                # Always release the lock when done
                release_lock(connection, LOCK_ID)
                print("Lock released")

            connection.close()

            return {
                "statusCode": 200,
                "body": json.dumps(response),
                "headers": {"Content-Type": "application/json"}
            }

    except Exception as e:
        # Try to close connection if it exists
        try:
            if 'connection' in locals():
                connection.close()
        except:
            pass

        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"}),
            "headers": {"Content-Type": "application/json"}
        }
