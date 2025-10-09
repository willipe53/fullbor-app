import json
import boto3
import pymysql
import os
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
from typing import Dict, Any, Optional
import cors_helper

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


def cleanup_orphaned_queued_transactions(connection):
    """
    Mark any remaining QUEUED transactions as UNKNOWN.
    This handles cases where SQS messages were lost or failed to process.
    Only affects transactions that were not successfully processed in this run.
    """
    try:
        with connection.cursor() as cursor:
            # Get count of QUEUED transactions before cleanup
            cursor.execute("""
                SELECT COUNT(*) FROM transactions 
                WHERE transaction_status_id = 2
            """)
            queued_count = cursor.fetchone()[0]

            if queued_count > 0:
                print(
                    f"\n=== Cleanup: Found {queued_count} orphaned QUEUED transactions ===")

                # Update all QUEUED transactions to UNKNOWN status
                cursor.execute("""
                    UPDATE transactions 
                    SET transaction_status_id = 4
                    WHERE transaction_status_id = 2
                """)
                connection.commit()

                updated_count = cursor.rowcount
                print(
                    f"Cleanup: Marked {updated_count} transactions as UNKNOWN")

                return updated_count
            else:
                print("\n=== Cleanup: No orphaned QUEUED transactions found ===")
                return 0

    except Exception as e:
        print(f"ERROR during cleanup: {str(e)}")
        raise Exception(f"Failed to cleanup orphaned transactions: {str(e)}")


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


def create_position_keeper_record(connection, lock_id: str, holder: str, expires_at: datetime) -> int:
    """
    Create a position_keeper record to track this position keeping run.

    Args:
        connection: Database connection
        lock_id: The lock ID being used
        holder: The holder of the lock
        expires_at: When the lock expires

    Returns:
        int: The position_keeper_id of the created record
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                INSERT INTO position_keepers (lock_id, holder, expires_at)
                VALUES (%s, %s, %s)
            """, (lock_id, holder, expires_at))
            connection.commit()
            position_keeper_id = cursor.lastrowid
            print(
                f"Created position_keeper record with ID: {position_keeper_id}")
            return position_keeper_id
    except Exception as e:
        print(f"ERROR creating position_keeper record: {str(e)}")
        connection.rollback()
        raise


def generate_sandbox_rows(connection, position_keeper_id: int, mode: str = "Full Refresh") -> int:
    """
    Generate position_sandbox rows for position calculation.

    For Full Refresh mode:
    - Creates Trade Date (position_type_id=1) and Settle Date (position_type_id=2) records
    - For every day from earliest trade_date to latest settle_date
    - For each unique combination of (portfolio_entity_id, instrument_entity_id) 
      and (contra_entity_id, instrument_entity_id)
    - All records start with share_amount=0 and market_value=0

    Args:
        connection: Database connection
        position_keeper_id: ID of the current position keeper run
        mode: "Full Refresh" or "Incremental" (currently only Full Refresh is implemented)

    Returns:
        int: Number of rows inserted into position_sandbox
    """
    print(f"\n=== Generating Position Sandbox Rows (Mode: {mode}) ===")

    if mode != "Full Refresh":
        raise NotImplementedError(
            f"Mode '{mode}' not yet implemented. Only 'Full Refresh' is supported.")

    try:
        with connection.cursor() as cursor:
            # Step 1: Find min and max dates from transactions
            print("Step 1: Finding date range from transactions...")
            cursor.execute("""
                SELECT MIN(dt) as min_date, MAX(dt) as max_date
                FROM (
                    SELECT trade_date AS dt FROM transactions
                    UNION
                    SELECT settle_date AS dt FROM transactions
                ) AS all_dates
            """)
            date_result = cursor.fetchone()

            if not date_result or not date_result[0]:
                print("No transactions found - no sandbox rows to generate")
                return 0

            min_date = date_result[0]
            max_date = date_result[1]
            print(f"Date range: {min_date} to {max_date}")

            # Step 2: Get all unique entity/instrument combinations
            print("Step 2: Finding unique entity/instrument combinations...")
            cursor.execute("""
                SELECT DISTINCT portfolio_entity_id as entity_id, instrument_entity_id
                FROM transactions
                UNION
                SELECT DISTINCT contra_entity_id as entity_id, instrument_entity_id
                FROM transactions
                ORDER BY entity_id, instrument_entity_id
            """)
            entity_permutations = cursor.fetchall()
            print(
                f"Found {len(entity_permutations)} entity/instrument combinations")

            # Step 3: Clear existing sandbox data for this position_keeper_id
            print(
                f"Step 3: Clearing existing sandbox data for position_keeper_id {position_keeper_id}...")
            cursor.execute("""
                DELETE FROM position_sandbox 
                WHERE position_keeper_id = %s
            """, (position_keeper_id,))
            deleted_count = cursor.rowcount
            if deleted_count > 0:
                print(f"Deleted {deleted_count} existing sandbox rows")

            # Step 4: Generate all dates between min and max
            print("Step 4: Generating position sandbox rows...")

            # Use SQL to generate date series and insert all rows in one batch operation
            # This is much more efficient than Python loops
            insert_sql = """
                INSERT INTO position_sandbox (
                    position_date, 
                    position_type_id, 
                    portfolio_entity_id, 
                    instrument_entity_id, 
                    share_amount, 
                    market_value, 
                    position_keeper_id
                )
                SELECT 
                    dates.position_date,
                    position_types.position_type_id,
                    entities.entity_id,
                    entities.instrument_entity_id,
                    0 as share_amount,
                    0 as market_value,
                    %s as position_keeper_id
                FROM (
                    SELECT DATE_ADD(%s, INTERVAL seq DAY) as position_date
                    FROM (
                        SELECT @row := @row + 1 as seq
                        FROM (SELECT 0 UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 
                              UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
                              UNION ALL SELECT 8 UNION ALL SELECT 9) t1,
                             (SELECT 0 UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 
                              UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
                              UNION ALL SELECT 8 UNION ALL SELECT 9) t2,
                             (SELECT 0 UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 
                              UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
                              UNION ALL SELECT 8 UNION ALL SELECT 9) t3,
                             (SELECT @row := -1) r
                    ) seq_table
                    WHERE DATE_ADD(%s, INTERVAL seq DAY) <= %s
                ) dates
                CROSS JOIN (
                    SELECT 1 as position_type_id
                    UNION ALL
                    SELECT 2 as position_type_id
                ) position_types
                CROSS JOIN (
                    SELECT DISTINCT portfolio_entity_id as entity_id, instrument_entity_id
                    FROM transactions
                    UNION
                    SELECT DISTINCT contra_entity_id as entity_id, instrument_entity_id
                    FROM transactions
                ) entities
            """

            cursor.execute(insert_sql, (position_keeper_id,
                           min_date, min_date, max_date))
            rows_inserted = cursor.rowcount
            connection.commit()

            print(
                f"Successfully inserted {rows_inserted} rows into position_sandbox")
            print(f"  - Date range: {min_date} to {max_date}")
            print(
                f"  - Entity/Instrument combinations: {len(entity_permutations)}")
            print(f"  - Position types: 2 (Trade Date, Settle Date)")
            print("=== Sandbox Generation Complete ===\n")

            return rows_inserted

    except Exception as e:
        print(f"ERROR generating sandbox rows: {str(e)}")
        connection.rollback()
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
        position_keeping_actions: List of position keeping actions
        portfolio_name: Name of the portfolio
        instrument_name: Name of the instrument
    """
    print(f"\n=== Processing Position Keeping for {transaction_type_name} ===")
    print(f"Portfolio: {portfolio_name}")
    print(f"Instrument: {instrument_name}")
    print(f"Transaction Properties: {json.dumps(properties, indent=2)}")
    print(
        f"Position Keeping Actions: {json.dumps(position_keeping_actions, indent=2)}")

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
        trade_date = message_body.get("trade_date")
        settle_date = message_body.get("settle_date")
        properties = message_body.get("properties", {})

        # Parse properties if it's a JSON string
        if isinstance(properties, str):
            try:
                properties = json.loads(properties)
            except json.JSONDecodeError as e:
                print(f"ERROR: Failed to parse properties JSON: {str(e)}")
                return False
        updated_user_id = message_body.get("updated_user_id")

        # Get transaction type from cache (no database lookup needed!)
        transaction_type = _transaction_types_cache.get(transaction_type_id)
        if not transaction_type:
            print(
                f"ERROR: Transaction type {transaction_type_id} not found in cache")
            return False

        transaction_type_name = transaction_type['name']
        type_properties = transaction_type['properties']

        print(
            f"Processing {operation} operation for transaction ID: {transaction_id}")
        print(
            f"Transaction Type: {transaction_type_name} (ID: {transaction_type_id})")
        print(f"Trade Date: {trade_date}")
        print(f"Settle Date: {settle_date}")

        # Extract position keeping rules
        current_position_date_field = type_properties.get("current_position")
        forecast_position_date_field = type_properties.get("forecast_position")
        position_keeping_actions = type_properties.get(
            "position_keeping_actions", [])

        # position_keeping_actions is required, but current_position and forecast_position are optional
        if not position_keeping_actions:
            print(
                f"INFO: No position_keeping_actions defined for transaction type '{transaction_type_name}'. Skipping position processing.")
            # Mark transaction as processed even though no position keeping was done
            # This is valid - not all transaction types require position keeping
            return True

        print(f"Position keeping actions: {position_keeping_actions}")
        if current_position_date_field:
            print(
                f"Current position date field: {current_position_date_field}")
        if forecast_position_date_field:
            print(
                f"Forecast position date field: {forecast_position_date_field}")

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
                f"Successfully processed {operation} for transaction {transaction_id} ({transaction_type_name})")
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

                    # Get transaction type name for the header log
                    transaction_type_id = message_body.get(
                        "transaction_type_id")
                    transaction_type = _transaction_types_cache.get(
                        transaction_type_id)
                    transaction_type_name = transaction_type[
                        'name'] if transaction_type else f"Unknown ({transaction_type_id})"

                    print(
                        f"\n--- Processing message {total_messages}: {transaction_type_name} ---")
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
    Handle Position Keeper commands (start/stop/status).

    GET /position-keeper/status:
        - Returns the current status of the Position Keeper lock

    POST /position-keeper/start:
        - Starts Position Keeper in Incremental mode (default)
        - Only processes QUEUED transactions
        - Checks if lock is set
        - If locked, returns error
        - If not locked:
            1. Sets the lock
            2. Generates sandbox rows (incremental)
            3. Fetches all new messages from SQS queue
            4. Processes each message
            5. Updates transaction status to PROCESSED
            6. Deals with any orphans setting them to UNKNOWN
            7. Releases the lock

    POST /position-keeper/start/full-refresh:
        - Starts Position Keeper in Full Refresh mode
        - Processes ALL transactions (QUEUED + PROCESSED)
        - Recalculates all positions from scratch
        - If not locked:
            1. Sets the lock
            2. Generates sandbox rows (full refresh - all dates/entities)
            3. Fetches all new messages from SQS queue
            4. Processes each message
            5. Updates transaction status to PROCESSED
            6. Deals with any orphans setting them to UNKNOWN
            7. Releases the lock

    POST /position-keeper/stop:
        - Releases the global lock
    """

    # Extract current user from headers (required by OpenAPI spec)
    current_user_id = event.get('headers', {}).get(
        'X-Current-User-Id', 'system')

    # Determine command from the URL path
    path = event.get('path', '')
    http_method = event.get('httpMethod', '')
    path_parameters = event.get('pathParameters', {}) or {}

    # Parse mode from path parameter
    # /position-keeper/start/{mode} where mode = "incremental" or "full-refresh"
    mode_param = path_parameters.get('mode', '').lower()

    if mode_param == 'full-refresh':
        mode = 'Full Refresh'
    elif mode_param == 'incremental':
        mode = 'Incremental'
    else:
        # Default to Incremental for any unrecognized mode
        mode = 'Incremental'

    if '/start' in path:
        command = 'start'
    elif path.endswith('/stop'):
        command = 'stop'
    elif path.endswith('/status') and http_method == 'GET':
        command = 'status'
    else:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid endpoint. Use /position-keeper/start, /position-keeper/start/full-refresh, /position-keeper/stop, or GET /position-keeper/status"}),
            "headers": cors_helper.get_cors_headers()
        }

    # Constants
    LOCK_ID = "v2 Position Keeper"
    SQS_QUEUE_URL = "https://sqs.us-east-2.amazonaws.com/316490106381/pandatransactions.fifo"

    holder = f"{context.log_stream_name}:{context.aws_request_id}"

    try:
        # Get database connection
        connection = get_db_connection()

        if command == 'status':
            # Get the current lock status
            lock_status = get_lock_status(connection, LOCK_ID)

            if lock_status and lock_status['is_active']:
                # Lock is active
                response = {
                    "status": "running",
                    "holder": lock_status['holder'],
                    "expires_at": lock_status['expires_at'].isoformat() if lock_status['expires_at'] else None
                }
            else:
                # No active lock
                response = {
                    "status": "idle",
                    "holder": None,
                    "expires_at": None
                }

            connection.close()

            return {
                "statusCode": 200,
                "body": json.dumps(response),
                "headers": cors_helper.get_cors_headers()
            }

        elif command == 'stop':
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
                "headers": cors_helper.get_cors_headers()
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
                    "headers": cors_helper.get_cors_headers()
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
                    "headers": cors_helper.get_cors_headers()
                }

            print(f"Lock acquired by {holder}")
            print(f"Position Keeper Mode: {mode}")

            try:
                # Create position_keeper record
                position_keeper_id = create_position_keeper_record(
                    connection, LOCK_ID, holder, expires_at)

                # Load caches
                print("Loading transaction types cache...")
                load_transaction_types_cache(connection)

                print("Loading entities cache...")
                load_entities_cache(connection)

                # Generate sandbox rows
                print(f"\nGenerating position sandbox rows (Mode: {mode})...")
                sandbox_rows = generate_sandbox_rows(
                    connection, position_keeper_id, mode=mode)

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

                # Cleanup any orphaned QUEUED transactions
                # This marks transactions as UNKNOWN if they were queued but no SQS message exists
                cleanup_count = cleanup_orphaned_queued_transactions(
                    connection)

                response = {
                    "message": "Position Keeper process completed",
                    "mode": mode,
                    "position_keeper_id": position_keeper_id,
                    "sandbox_rows_created": sandbox_rows,
                    "statistics": stats,
                    "cleanup": {
                        "orphaned_transactions_marked_unknown": cleanup_count
                    }
                }

            finally:
                # Always release the lock when done
                release_lock(connection, LOCK_ID)
                print("Lock released")

            connection.close()

            return {
                "statusCode": 200,
                "body": json.dumps(response),
                "headers": cors_helper.get_cors_headers()
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
            "headers": cors_helper.get_cors_headers()
        }
