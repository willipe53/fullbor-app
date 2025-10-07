
import json
import boto3
import pymysql
import os
from datetime import datetime
from botocore.exceptions import ClientError


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


def lambda_handler(event, context):
    """
    Handle transaction status operations for V2 API.
    Returns data compliant with OpenAPI specification.
    """

    # Extract current user from headers (required by OpenAPI spec)
    current_user_id = event.get('headers', {}).get(
        'X-Current-User-Id', 'system')

    # Determine operation based on HTTP method
    http_method = event.get('httpMethod', 'GET')
    query_parameters = event.get('queryStringParameters') or {}

    try:
        # Get database connection
        connection = get_db_connection()

        if http_method == 'GET':
            # Handle GET operations - list transaction statuses
            count_only = query_parameters.get(
                'count', 'false').lower() == 'true'

            with connection.cursor() as cursor:
                if count_only:
                    # Return count only
                    cursor.execute(
                        "SELECT COUNT(*) as count FROM transaction_statuses")
                    result = cursor.fetchone()
                    response = {"count": result[0]}
                else:
                    # List all transaction statuses
                    cursor.execute(
                        "SELECT transaction_status_name, update_date, updated_user_id FROM transaction_statuses ORDER BY transaction_status_name"
                    )
                    results = cursor.fetchall()

                    response = []
                    for result in results:
                        response.append({
                            "transaction_status_name": result[0],
                            "update_date": result[1].isoformat() + "Z" if result[1] else None,
                            "updated_by_user_name": str(result[2]) if result[2] else None
                        })
        else:
            # Handle unsupported methods
            return {
                "statusCode": 405,
                "body": json.dumps({"error": f"Method {http_method} not allowed for transaction statuses"}),
                "headers": {"Content-Type": "application/json"}
            }

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
