import json
import boto3
import pymysql
import os
from datetime import datetime, timedelta
from botocore.exceptions import ClientError


def get_lambda_client():
    """Get AWS Lambda client."""
    return boto3.client('lambda', region_name='us-east-2')


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


def stop_running_instances(lambda_client, function_name):
    """Stop any running instances of the Lambda function."""
    try:
        # Get function configuration to check if it's running
        response = lambda_client.get_function(FunctionName=function_name)

        # For Lambda functions, we can't directly "kill" running instances
        # But we can check if there are any active invocations
        # This is a placeholder - in a real implementation, you might:
        # 1. Use Step Functions to manage long-running processes
        # 2. Use ECS/Fargate for processes that need to be killable
        # 3. Use a different mechanism for process management

        return {
            'stopped': True,
            'message': 'Lambda function instances cannot be directly killed, but lock will be released'
        }
    except Exception as e:
        return {
            'stopped': False,
            'error': str(e)
        }


def lambda_handler(event, context):
    """
    Handle Position Keeper commands (start/stop).

    This is a placeholder implementation that:
    - Acquires/releases a database lock
    - Simulates a 20-second process for 'start'
    - Manages the lock lifecycle
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
    lambda_client = get_lambda_client()
    holder = f"{context.log_stream_name}:{context.aws_request_id}"

    try:
        # Get database connection
        connection = get_db_connection()

        if command == 'start':
            # Try to acquire lock
            expires_at = datetime.utcnow() + timedelta(minutes=1)

            if not acquire_lock(connection, LOCK_ID, holder, expires_at):
                # Lock acquisition failed - check if it's expired
                lock_status = get_lock_status(connection, LOCK_ID)
                if lock_status and not lock_status['is_active']:
                    # Lock is expired, try to clean it up and acquire again
                    release_lock(connection, LOCK_ID)
                    if not acquire_lock(connection, LOCK_ID, holder, expires_at):
                        return {
                            "statusCode": 409,
                            "body": json.dumps({
                                "error": "Position Keeper is already running",
                                "status": "running"
                            }),
                            "headers": {"Content-Type": "application/json"}
                        }
                else:
                    return {
                        "statusCode": 409,
                        "body": json.dumps({
                            "error": "Position Keeper is already running",
                            "status": "running"
                        }),
                        "headers": {"Content-Type": "application/json"}
                    }

            # Simulate the Position Keeper process (20 seconds)
            import time
            time.sleep(20)

            # Release the lock
            release_lock(connection, LOCK_ID)

            response = {
                "message": "Position Keeper process completed successfully"
            }

        elif command == 'stop':
            # Check if Position Keeper is running
            lock_status = get_lock_status(connection, LOCK_ID)

            if lock_status and lock_status['is_active']:
                # Try to stop running instances
                stop_result = stop_running_instances(
                    lambda_client, context.function_name)

                # Release the lock
                release_lock(connection, LOCK_ID)

                response = {
                    "message": f"Position Keeper stopped. {stop_result.get('message', '')}"
                }
            else:
                response = {
                    "message": "Position Keeper was not running"
                }

        connection.close()

        return {
            "statusCode": 201,
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
