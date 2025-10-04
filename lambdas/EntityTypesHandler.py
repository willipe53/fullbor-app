import json
import boto3
import pymysql
import os
from datetime import datetime
from botocore.exceptions import ClientError
from urllib.parse import unquote


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


def lambda_handler(event, context):
    """
    Handle entity type operations for V2 API.
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
        # Get database connection
        connection = get_db_connection()

        if http_method == 'GET':
            # Handle GET operations
            if 'entity_type_name' in path_parameters:
                # Get single entity type by name: /entity-types/{entity_type_name}
                entity_type_name = unquote(path_parameters['entity_type_name'])

                with connection.cursor() as cursor:
                    cursor.execute("""
                        SELECT name, attributes_schema, short_label, label_color, 
                               entity_category, update_date, updated_user_id
                        FROM entity_types
                        WHERE name = %s
                    """, (entity_type_name,))
                    result = cursor.fetchone()

                    if not result:
                        return {
                            "statusCode": 404,
                            "body": json.dumps({"error": "Entity type not found"}),
                            "headers": {"Content-Type": "application/json"}
                        }

                    # Map database fields to OpenAPI schema
                    attributes_schema = json.loads(
                        result[1]) if result[1] else {}

                    response = {
                        "entity_type_name": result[0],
                        "attributes_schema": attributes_schema,
                        "short_label": result[2],
                        "label_color": result[3],
                        "entity_category": result[4],
                        "update_date": result[5].isoformat() + "Z" if result[5] else None,
                        "updated_by_user_name": str(result[6]) if result[6] else None
                    }
            else:
                # List all entity types: /entity-types
                # Check for entity_category filter and count parameter
                entity_category_filter = query_parameters.get(
                    'entity_category')
                count_only = query_parameters.get(
                    'count', 'false').lower() == 'true'

                with connection.cursor() as cursor:
                    if count_only:
                        # Return count only
                        if entity_category_filter:
                            cursor.execute("""
                                SELECT COUNT(*) as count
                                FROM entity_types
                                WHERE entity_category = %s
                            """, (entity_category_filter,))
                        else:
                            cursor.execute(
                                "SELECT COUNT(*) as count FROM entity_types")
                        result = cursor.fetchone()
                        response = {"count": result[0]}
                    else:
                        # Return entity types data
                        if entity_category_filter:
                            # Filter by entity_category
                            cursor.execute("""
                                SELECT entity_type_id, name, attributes_schema, short_label, label_color, 
                                       entity_category, update_date, updated_user_id
                                FROM entity_types
                                WHERE entity_category = %s
                                ORDER BY name
                            """, (entity_category_filter,))
                        else:
                            # Get all entity types
                            cursor.execute("""
                                SELECT entity_type_id, name, attributes_schema, short_label, label_color, 
                                       entity_category, update_date, updated_user_id
                                FROM entity_types
                                ORDER BY name
                            """)

                        results = cursor.fetchall()

                        response = []
                        for result in results:
                            # Map database fields to OpenAPI schema
                            attributes_schema = json.loads(
                                result[2]) if result[2] else {}

                            response.append({
                                "entity_type_id": result[0],
                                "entity_type_name": result[1],
                                "attributes_schema": attributes_schema,
                                "short_label": result[3],
                                "label_color": result[4],
                                "entity_category": result[5],
                                "update_date": result[6].isoformat() + "Z" if result[6] else None,
                                "updated_by_user_name": str(result[7]) if result[7] else None
                            })

        elif http_method == 'POST':
            # Handle POST operations: /entity-types (create or upsert)
            try:
                request_data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "Invalid JSON in request body"}),
                    "headers": {"Content-Type": "application/json"}
                }

            # Validate required fields
            entity_type_name = request_data.get('entity_type_name')
            if not entity_type_name:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "entity_type_name is required"}),
                    "headers": {"Content-Type": "application/json"}
                }

            # Get user ID for tracking (required for POST/PUT/DELETE)
            user_id = get_user_id_from_sub(connection, current_user_id)

            # Extract fields from request
            attributes_schema = request_data.get('attributes_schema', {})
            attributes_schema_json = json.dumps(
                attributes_schema) if attributes_schema else None
            short_label = request_data.get('short_label')
            label_color = request_data.get('label_color')
            entity_category = request_data.get('entity_category')

            with connection.cursor() as cursor:
                # Check if entity type already exists
                cursor.execute(
                    "SELECT entity_type_id FROM entity_types WHERE name = %s", (entity_type_name,))
                existing = cursor.fetchone()

                if existing:
                    # Update existing entity type
                    cursor.execute("""
                        UPDATE entity_types 
                        SET attributes_schema = %s, short_label = %s, label_color = %s, 
                            entity_category = %s, update_date = NOW(), updated_user_id = %s
                        WHERE name = %s
                    """, (attributes_schema_json, short_label, label_color, entity_category, user_id, entity_type_name))
                    connection.commit()
                    response = {"message": "Entity type updated successfully"}
                else:
                    # Insert new entity type
                    cursor.execute("""
                        INSERT INTO entity_types (name, attributes_schema, short_label, label_color, 
                                                entity_category, updated_user_id)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (entity_type_name, attributes_schema_json, short_label, label_color, entity_category, user_id))
                    connection.commit()
                    response = {"message": "Entity type created successfully"}

        elif http_method == 'PUT':
            # Handle PUT operations: /entity-types/{entity_type_name} (update)
            if 'entity_type_name' not in path_parameters:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "entity_type_name is required in path"}),
                    "headers": {"Content-Type": "application/json"}
                }

            try:
                request_data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "Invalid JSON in request body"}),
                    "headers": {"Content-Type": "application/json"}
                }

            entity_type_name = unquote(path_parameters['entity_type_name'])

            # Get user ID for tracking
            user_id = get_user_id_from_sub(connection, current_user_id)

            # Extract fields from request
            attributes_schema = request_data.get('attributes_schema', {})
            attributes_schema_json = json.dumps(
                attributes_schema) if attributes_schema else None
            short_label = request_data.get('short_label')
            label_color = request_data.get('label_color')
            entity_category = request_data.get('entity_category')

            with connection.cursor() as cursor:
                # Check if entity type exists
                cursor.execute(
                    "SELECT entity_type_id FROM entity_types WHERE name = %s", (entity_type_name,))
                existing = cursor.fetchone()

                if not existing:
                    return {
                        "statusCode": 404,
                        "body": json.dumps({"error": "Entity type not found"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                # Update entity type
                cursor.execute("""
                    UPDATE entity_types 
                    SET attributes_schema = %s, short_label = %s, label_color = %s, 
                        entity_category = %s, update_date = NOW(), updated_user_id = %s
                    WHERE name = %s
                """, (attributes_schema_json, short_label, label_color, entity_category, user_id, entity_type_name))
                connection.commit()
                response = {"message": "Entity type updated successfully"}

        elif http_method == 'DELETE':
            # Handle DELETE operations: /entity-types/{entity_type_name}
            if 'entity_type_name' not in path_parameters:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "entity_type_name is required in path"}),
                    "headers": {"Content-Type": "application/json"}
                }

            entity_type_name = unquote(path_parameters['entity_type_name'])

            # Get user ID for tracking
            user_id = get_user_id_from_sub(connection, current_user_id)

            with connection.cursor() as cursor:
                # Check if entity type exists
                cursor.execute(
                    "SELECT entity_type_id FROM entity_types WHERE name = %s", (entity_type_name,))
                existing = cursor.fetchone()

                if not existing:
                    return {
                        "statusCode": 404,
                        "body": json.dumps({"error": "Entity type not found"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                # Delete entity type
                cursor.execute(
                    "DELETE FROM entity_types WHERE name = %s", (entity_type_name,))
                connection.commit()
                response = {"message": "Entity type deleted successfully"}

        else:
            # Handle unsupported methods
            return {
                "statusCode": 405,
                "body": json.dumps({"error": f"Method {http_method} not allowed for entity types"}),
                "headers": {"Content-Type": "application/json"}
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
            "headers": {"Content-Type": "application/json"}
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
            "headers": {"Content-Type": "application/json"}
        }
