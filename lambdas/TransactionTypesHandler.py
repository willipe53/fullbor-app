import json
import boto3
import pymysql
import os
import uuid
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from urllib.parse import unquote
from typing import Dict, Any
import cors_helper


def get_secret():
    """Get secret from AWS Secrets Manager. Called once per Lambda invocation."""
    try:
        secrets_client = boto3.client(
            'secretsmanager', region_name='us-east-2')
        secret_arn = os.environ.get('SECRET_ARN')

        if not secret_arn:
            raise Exception("SECRET_ARN environment variable not set")

        response = secrets_client.get_secret_value(SecretId=secret_arn)
        return json.loads(response['SecretString'])
    except Exception as e:
        raise Exception(f"Failed to retrieve secret: {str(e)}")


def get_db_connection(secret):
    """Get database connection using provided secret."""
    try:
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


def get_user_id_from_sub(connection, current_user_id):
    """
    Get the user_id from the database based on the sub (Cognito user ID).
    Returns None if user not found.
    """
    try:
        if current_user_id == 'system':
            return None

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT user_id FROM users WHERE sub = %s", (current_user_id,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting user_id from sub: {e}")
        return None


def send_cache_refresh_to_sqs(secret: Dict[str, Any], table: str) -> bool:
    """Send cache refresh message to SQS FIFO queue."""
    try:
        # Get queue URL from secret
        queue_url = secret.get('QUEUE_URL')

        if not queue_url:
            raise Exception("QUEUE_URL not found in secrets")

        sqs = boto3.client('sqs', region_name='us-east-2')

        # Prepare message body
        message_body = {
            "operation": "refresh_cache",
            "table": table
        }

        # Generate unique message group ID and deduplication ID
        message_group_id = f"cache-refresh-{table}"
        message_deduplication_id = f"refresh-{table}-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:8]}"

        print(
            f"DEBUG: Sending cache refresh to SQS - Table: {table}, Group ID: {message_group_id}")

        response = sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(message_body),
            MessageGroupId=message_group_id,
            MessageDeduplicationId=message_deduplication_id
        )

        print(
            f"DEBUG: Cache refresh SQS message sent successfully: {response['MessageId']}")
        return True

    except Exception as e:
        print(f"ERROR: Failed to send cache refresh message to SQS: {str(e)}")
        return False


def lambda_handler(event, context):
    """
    Handle transaction type operations for V2 API.
    Returns data compliant with OpenAPI specification.
    """

    # Extract current user from headers (case-insensitive lookup)
    headers = event.get('headers', {})
    current_user_id = 'system'  # default
    for key, value in headers.items():
        if key.lower() == 'x-current-user-id':
            current_user_id = value
            break

    # Determine operation based on HTTP method and path
    http_method = event.get('httpMethod', 'GET')
    path = event.get('path', '')
    path_parameters = event.get('pathParameters') or {}
    query_parameters = event.get('queryStringParameters') or {}
    body = event.get('body', '{}')

    connection = None
    try:
        # Get secret from Secrets Manager (called once per invocation)
        secret = get_secret()

        # Get database connection
        connection = get_db_connection(secret)

        if http_method == 'GET':
            # Handle GET operations
            if 'transaction_type_name' in path_parameters:
                # Get single transaction type by transaction_type_name: /transaction-types/{transaction_type_name}
                transaction_type_name = unquote(
                    path_parameters['transaction_type_name'])

                with connection.cursor() as cursor:
                    cursor.execute("""
                        SELECT tt.transaction_type_id, tt.transaction_type_name, tt.properties, tt.update_date, u.email
                        FROM transaction_types tt
                        LEFT JOIN users u ON tt.updated_user_id = u.user_id
                        WHERE tt.transaction_type_name = %s
                    """, (transaction_type_name,))
                    result = cursor.fetchone()

                    if not result:
                        return {
                            "statusCode": 404,
                            "body": json.dumps({"error": "Transaction type not found"}),
                            "headers": cors_helper.get_cors_headers()
                        }

                    # Map database fields to OpenAPI schema
                    properties = json.loads(result[2]) if result[2] else {}

                    response = {
                        "transaction_type_id": result[0],
                        "transaction_type_name": result[1],
                        "properties": properties,
                        "update_date": result[3].isoformat() + "Z" if result[3] else None,
                        "updated_by_user_name": result[4] if result[4] else None
                    }
            else:
                # List all transaction types: /transaction-types
                count_only = query_parameters.get(
                    'count', 'false').lower() == 'true'

                with connection.cursor() as cursor:
                    if count_only:
                        # Return count only
                        cursor.execute(
                            "SELECT COUNT(*) as count FROM transaction_types")
                        result = cursor.fetchone()
                        response = {"count": result[0]}
                    else:
                        # Return transaction types data
                        cursor.execute("""
                            SELECT tt.transaction_type_id, tt.transaction_type_name, tt.properties, tt.update_date, u.email
                            FROM transaction_types tt
                            LEFT JOIN users u ON tt.updated_user_id = u.user_id
                            ORDER BY tt.transaction_type_name
                        """)
                        results = cursor.fetchall()

                        response = []
                        for result in results:
                            # Map database fields to OpenAPI schema
                            properties = json.loads(
                                result[2]) if result[2] else {}

                            response.append({
                                "transaction_type_id": result[0],
                                "transaction_type_name": result[1],
                                "properties": properties,
                                "update_date": result[3].isoformat() + "Z" if result[3] else None,
                                "updated_by_user_name": result[4] if result[4] else None
                            })

        elif http_method == 'POST':
            # Handle POST operations: /transaction-types (create or upsert)
            try:
                request_data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "Invalid JSON in request body"}),
                    "headers": cors_helper.get_cors_headers()
                }

            # Validate required fields
            transaction_type_name = request_data.get('transaction_type_name')
            if not transaction_type_name:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "transaction_type_name is required"}),
                    "headers": cors_helper.get_cors_headers()
                }

            # Get user ID for tracking (optional for GET, required for POST/PUT/DELETE)
            user_id = get_user_id_from_sub(connection, current_user_id)

            properties = request_data.get('properties', {})
            properties_json = json.dumps(properties) if properties else None

            with connection.cursor() as cursor:
                # Check if transaction type already exists
                cursor.execute(
                    "SELECT transaction_type_id FROM transaction_types WHERE transaction_type_name = %s", (transaction_type_name,))
                existing = cursor.fetchone()

                if existing:
                    # Update existing transaction type
                    cursor.execute("""
                        UPDATE transaction_types 
                        SET properties = %s, update_date = NOW(), updated_user_id = %s
                        WHERE transaction_type_name = %s
                    """, (properties_json, user_id, transaction_type_name))
                    connection.commit()

                    # Send cache refresh notification
                    send_cache_refresh_to_sqs(secret, "transaction_types")

                    response = {
                        "message": "Transaction type updated successfully"}
                else:
                    # Insert new transaction type
                    cursor.execute("""
                        INSERT INTO transaction_types (transaction_type_name, properties, updated_user_id)
                        VALUES (%s, %s, %s)
                    """, (transaction_type_name, properties_json, user_id))
                    connection.commit()

                    # Send cache refresh notification
                    send_cache_refresh_to_sqs(secret, "transaction_types")

                    response = {
                        "message": "Transaction type created successfully"}

        elif http_method == 'PUT':
            # Handle PUT operations: /transaction-types/{transaction_type_name} (update)
            if 'transaction_type_name' not in path_parameters:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "transaction_type_name is required in path"}),
                    "headers": cors_helper.get_cors_headers()
                }

            try:
                request_data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "Invalid JSON in request body"}),
                    "headers": cors_helper.get_cors_headers()
                }

            transaction_type_name = unquote(
                path_parameters['transaction_type_name'])

            # Get user ID for tracking
            user_id = get_user_id_from_sub(connection, current_user_id)

            properties = request_data.get('properties', {})
            properties_json = json.dumps(properties) if properties else None

            # Get the new transaction_type_name if it's being changed
            new_transaction_type_name = request_data.get(
                'transaction_type_name')

            with connection.cursor() as cursor:
                # Check if transaction type exists
                cursor.execute(
                    "SELECT transaction_type_id FROM transaction_types WHERE transaction_type_name = %s", (transaction_type_name,))
                existing = cursor.fetchone()

                if not existing:
                    return {
                        "statusCode": 404,
                        "body": json.dumps({"error": "Transaction type not found"}),
                        "headers": cors_helper.get_cors_headers()
                    }

                # Update transaction type (including transaction_type_name if provided)
                if new_transaction_type_name and new_transaction_type_name != transaction_type_name:
                    cursor.execute("""
                        UPDATE transaction_types 
                        SET transaction_type_name = %s, properties = %s, update_date = NOW(), updated_user_id = %s
                        WHERE transaction_type_name = %s
                    """, (new_transaction_type_name, properties_json, user_id, transaction_type_name))
                else:
                    cursor.execute("""
                        UPDATE transaction_types 
                        SET properties = %s, update_date = NOW(), updated_user_id = %s
                        WHERE transaction_type_name = %s
                    """, (properties_json, user_id, transaction_type_name))
                connection.commit()

                # Send cache refresh notification
                send_cache_refresh_to_sqs(secret, "transaction_types")

                response = {"message": "Transaction type updated successfully"}

        elif http_method == 'DELETE':
            # Handle DELETE operations: /transaction-types/{transaction_type_name}
            if 'transaction_type_name' not in path_parameters:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "transaction_type_name is required in path"}),
                    "headers": cors_helper.get_cors_headers()
                }

            transaction_type_name = unquote(
                path_parameters['transaction_type_name'])

            # Get user ID for tracking
            user_id = get_user_id_from_sub(connection, current_user_id)

            with connection.cursor() as cursor:
                # Check if transaction type exists
                cursor.execute(
                    "SELECT transaction_type_id FROM transaction_types WHERE transaction_type_name = %s", (transaction_type_name,))
                existing = cursor.fetchone()

                if not existing:
                    return {
                        "statusCode": 404,
                        "body": json.dumps({"error": "Transaction type not found"}),
                        "headers": cors_helper.get_cors_headers()
                    }

                # Delete transaction type
                cursor.execute(
                    "DELETE FROM transaction_types WHERE transaction_type_name = %s", (transaction_type_name,))
                connection.commit()
                response = {"message": "Transaction type deleted successfully"}

        else:
            # Handle unsupported methods
            return {
                "statusCode": 405,
                "body": json.dumps({"error": f"Method {http_method} not allowed for transaction types"}),
                "headers": cors_helper.get_cors_headers()
            }

        connection.close()

        # Return appropriate status code based on operation
        status_code = 200
        if http_method == 'POST':
            status_code = 201
        elif http_method == 'DELETE':
            status_code = 204

        return {
            "statusCode": status_code,
            "body": json.dumps(response) if response is not None else "",
            "headers": cors_helper.get_cors_headers()
        }

    except Exception as e:
        # Try to close connection if it exists
        try:
            if connection:
                connection.close()
        except:
            pass

        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"}),
            "headers": cors_helper.get_cors_headers()
        }
