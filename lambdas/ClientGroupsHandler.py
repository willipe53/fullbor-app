import json
import boto3
import pymysql
import os
from datetime import datetime
from botocore.exceptions import ClientError
from urllib.parse import unquote
import cors_helper
# Data consistency functions (inline to avoid import issues)


def validate_client_group_deletion(connection, client_group_id):
    """Validate if a client group can be safely deleted."""
    try:
        with connection.cursor() as cursor:
            # Check if any users have this as their primary client group
            cursor.execute(
                "SELECT COUNT(*) FROM users WHERE primary_client_group_id = %s",
                (client_group_id,)
            )
            result = cursor.fetchone()
            primary_count = result[0] if result else 0

            error_messages = []
            if primary_count > 0:
                error_messages.append(
                    f"Cannot delete client group: {primary_count} user(s) have this as their primary client group")

            return len(error_messages) == 0, error_messages

    except Exception as e:
        print(f"Error validating client group deletion: {e}")
        return False, [f"Database error: {str(e)}"]


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


def get_user_client_groups(connection, user_id):
    """
    Get all client group IDs that the user is affiliated with.
    Returns a list of client_group_ids.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT DISTINCT client_group_id 
                FROM client_group_users 
                WHERE user_id = %s
            """, (user_id,))
            results = cursor.fetchall()
            return [row[0] for row in results]
    except Exception as e:
        print(f"Error getting user client groups: {e}")
        return []


def get_client_group_id_by_name(connection, client_group_name):
    """Get client_group_id from client_group_name."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT client_group_id FROM client_groups WHERE client_group_name = %s", (client_group_name,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting client group ID by client_group_name: {e}")
        return None


def get_client_group_name_by_id(connection, client_group_id):
    """Get client_group_name from client_group_id."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT client_group_name FROM client_groups WHERE client_group_id = %s", (client_group_id,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting client group client_group_name by ID: {e}")
        return None


def get_entity_id_by_name(connection, entity_name):
    """Get entity_id from entity_name."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT entity_id FROM entities WHERE entity_name = %s", (entity_name,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting entity ID by entity_name: {e}")
        return None


def get_entity_name_by_id(connection, entity_id):
    """Get entity_name from entity_id."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT entity_name FROM entities WHERE entity_id = %s", (entity_id,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting entity_name by ID: {e}")
        return None


def get_user_id_by_name(connection, user_name):
    """Get user_id from user_name (email)."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT user_id FROM users WHERE email = %s", (user_name,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting user ID by entity_name: {e}")
        return None


def get_user_name_by_id(connection, user_id):
    """Get user email (user_name) from user_id."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT email FROM users WHERE user_id = %s", (user_id,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting user entity_name by ID: {e}")
        return None


def lambda_handler(event, context):
    """
    Handle client group operations for V2 API.
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

        # Get current user's client groups for authorization
        current_user_id_db = get_user_id_from_sub(connection, current_user_id)
        if current_user_id_db:
            user_client_groups = get_user_client_groups(
                connection, current_user_id_db)
        else:
            user_client_groups = []

        # Handle different operations based on HTTP method and path
        response = handle_client_group_operations(
            connection, http_method, path, path_parameters,
            query_parameters, body, current_user_id, current_user_id_db, user_client_groups
        )

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


def handle_client_group_operations(connection, http_method, path, path_parameters, query_parameters, body, current_user_id, current_user_id_db, user_client_groups):
    """Handle all client group operations based on HTTP method and path."""

    if http_method == 'GET':
        return handle_get_operations(connection, path, path_parameters, query_parameters, user_client_groups)
    elif http_method == 'POST':
        return handle_post_operations(connection, path, path_parameters, body, current_user_id, current_user_id_db, user_client_groups)
    elif http_method == 'PUT':
        return handle_put_operations(connection, path, path_parameters, body, current_user_id, current_user_id_db, user_client_groups)
    elif http_method == 'DELETE':
        return handle_delete_operations(connection, path, path_parameters, current_user_id_db, user_client_groups)
    else:
        return {"error": f"Method {http_method} not allowed for client groups"}


def handle_get_operations(connection, path, path_parameters, query_parameters, user_client_groups):
    """Handle GET operations."""
    if 'client_group_name' in path_parameters:
        client_group_name = unquote(path_parameters['client_group_name'])

        # Check if this is a request for entities in the client group
        if path.endswith('/entities'):
            return handle_get_client_group_entities(connection, client_group_name, query_parameters, user_client_groups)
        elif path.endswith('/users'):
            return handle_get_client_group_users(connection, client_group_name, query_parameters, user_client_groups)
        else:
            # Get single client group by client_group_name: /client-groups/{client_group_name}
            # Check if user has access to this client group
            client_group_id = get_client_group_id_by_name(
                connection, client_group_name)
            if not client_group_id or client_group_id not in user_client_groups:
                return {"error": "Client group not found or access denied"}

            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT client_group_id, client_group_name, preferences, update_date, updated_user_id
                    FROM client_groups
                    WHERE client_group_id = %s
                """, (client_group_id,))
                result = cursor.fetchone()

                if not result:
                    return {"error": "Client group not found"}

                # Map database fields to OpenAPI schema
                preferences = json.loads(result[2]) if result[2] else {}
                updated_by_user_name = get_user_name_by_id(
                    connection, result[4]) if result[4] else None

                return {
                    "client_group_id": result[0],
                    "client_group_name": result[1],
                    "preferences": preferences,
                    "update_date": result[3].isoformat() + "Z" if result[3] else None,
                    "updated_by_user_name": updated_by_user_name
                }
    else:
        # List all client groups: /client-groups
        return handle_list_client_groups(connection, query_parameters, user_client_groups)


def handle_get_client_group_entities(connection, client_group_name, query_parameters, user_client_groups):
    """Handle getting entities for a specific client group."""
    # Get client group ID (no authorization check - users can query any group's entities)
    client_group_id = get_client_group_id_by_name(
        connection, client_group_name)
    if not client_group_id:
        return {"error": "Client group not found"}

    # Get query parameters
    count_only = query_parameters.get('count', 'false').lower() == 'true'

    with connection.cursor() as cursor:
        if count_only:
            # Return only count
            cursor.execute("""
                SELECT COUNT(DISTINCT e.entity_id)
                FROM entities e
                INNER JOIN client_group_entities cge ON e.entity_id = cge.entity_id
                WHERE cge.client_group_id = %s
            """, (client_group_id,))
            result = cursor.fetchone()
            count = result[0] if result else 0
            return {"count": count}
        else:
            # Return entities with pagination
            cursor.execute("""
                SELECT e.entity_id, e.entity_name, et.entity_type_name, et.entity_category,
                       e.update_date, e.updated_user_id
                FROM entities e
                INNER JOIN client_group_entities cge ON e.entity_id = cge.entity_id
                INNER JOIN entity_types et ON e.entity_type_id = et.entity_type_id
                WHERE cge.client_group_id = %s
                ORDER BY e.entity_name
            """, (client_group_id))
            entities = cursor.fetchall()

            # Get total count
            cursor.execute("""
                SELECT COUNT(DISTINCT e.entity_id)
                FROM entities e
                INNER JOIN client_group_entities cge ON e.entity_id = cge.entity_id
                WHERE cge.client_group_id = %s
            """, (client_group_id,))
            count_result = cursor.fetchone()
            total_count = count_result[0] if count_result else 0

            # Format entities
            entity_list = []
            for entity in entities:
                updated_by_user_name = get_user_name_by_id(
                    connection, entity[5]) if entity[5] else None
                entity_list.append({
                    "entity_id": entity[0],
                    "entity_name": entity[1],
                    "entity_type_name": entity[2],
                    "entity_category": entity[3],
                    "update_date": entity[4].isoformat() + "Z" if entity[4] else None,
                    "updated_by_user_name": updated_by_user_name
                })

            return {
                "data": entity_list,
                "count": total_count
            }


def handle_get_client_group_users(connection, client_group_name, query_parameters, user_client_groups):
    """Handle getting users for a specific client group."""
    # Get client group ID (no authorization check - users can query any group's members)
    client_group_id = get_client_group_id_by_name(
        connection, client_group_name)
    if not client_group_id:
        return {"error": "Client group not found"}

    # Get query parameters
    count_only = query_parameters.get('count', 'false').lower() == 'true'

    with connection.cursor() as cursor:
        if count_only:
            # Return only count
            cursor.execute("""
                SELECT COUNT(DISTINCT u.user_id)
                FROM users u
                INNER JOIN client_group_users cgu ON u.user_id = cgu.user_id
                WHERE cgu.client_group_id = %s
            """, (client_group_id,))
            result = cursor.fetchone()
            count = result[0] if result else 0
            return {"count": count}
        else:
            # Return users with pagination
            cursor.execute("""
                SELECT u.user_id, u.sub, u.email, u.preferences, u.primary_client_group_id,
                       u.update_date
                FROM users u
                INNER JOIN client_group_users cgu ON u.user_id = cgu.user_id
                WHERE cgu.client_group_id = %s
                ORDER BY u.email
            """, (client_group_id))
            users = cursor.fetchall()

            # Get total count
            cursor.execute("""
                SELECT COUNT(DISTINCT u.user_id)
                FROM users u
                INNER JOIN client_group_users cgu ON u.user_id = cgu.user_id
                WHERE cgu.client_group_id = %s
            """, (client_group_id,))
            count_result = cursor.fetchone()
            total_count = count_result[0] if count_result else 0

            # Format users
            user_list = []
            for user in users:
                user_list.append({
                    "user_id": user[0],
                    "sub": user[1],
                    "email": user[2],
                    "preferences": json.loads(user[3]) if user[3] else {},
                    "primary_client_group_id": user[4],
                    "update_date": user[5].isoformat() + "Z" if user[5] else None
                })

            return {
                "data": user_list,
                "count": total_count
            }


def handle_list_client_groups(connection, query_parameters, user_client_groups):
    """Handle listing client groups with optional filters and pagination."""
    # Apply query filters
    entity_name_filter = query_parameters.get('entity_name')
    count_only = query_parameters.get('count', 'false').lower() == 'true'

    # Build base query
    if user_client_groups:
        base_query = """
            FROM client_groups cg
            WHERE cg.client_group_id IN ({})
        """.format(','.join(['%s'] * len(user_client_groups)))
        params = user_client_groups.copy()
    else:
        # User has no client groups - return empty result
        if count_only:
            return {"count": 0}
        return {
            "data": [],
            "count": 0
        }

    # Add entity filter
    if entity_name_filter:
        entity_id_filter = get_entity_id_by_name(
            connection, entity_name_filter)
        if entity_id_filter:
            base_query += """
                AND cg.client_group_id IN (
                    SELECT client_group_id FROM client_group_entities WHERE entity_id = %s
                )
            """
            params.append(entity_id_filter)
        else:
            # Entity not found - return empty result
            if count_only:
                return {"count": 0}
            return {
                "data": [],
                "count": 0
            }

    if count_only:
        # Return count only
        count_query = f"SELECT COUNT(*) as count {base_query}"
        with connection.cursor() as cursor:
            cursor.execute(count_query, params)
            result = cursor.fetchone()
            return {"count": result[0] if result else 0}

    # Get client groups with pagination
    query = f"""
        SELECT DISTINCT cg.client_group_id, cg.client_group_name, cg.preferences, cg.update_date, cg.updated_user_id
        {base_query}
        ORDER BY cg.client_group_name
    """

    with connection.cursor() as cursor:
        cursor.execute(query, params)
        results = cursor.fetchall()

        # Get total count for pagination
        count_query = f"SELECT COUNT(*) as count {base_query}"
        cursor.execute(count_query, params)
        count_result = cursor.fetchone()
        total_count = count_result[0] if count_result else 0

        data = []
        for result in results:
            # Map database fields to OpenAPI schema
            preferences = json.loads(result[2]) if result[2] else {}
            updated_by_user_name = get_user_name_by_id(
                connection, result[4]) if result[4] else None

            data.append({
                "client_group_id": result[0],
                "client_group_name": result[1],
                "preferences": preferences,
                "update_date": result[3].isoformat() + "Z" if result[3] else None,
                "updated_by_user_name": updated_by_user_name
            })

        return {
            "data": data,
            "count": total_count}


def handle_post_operations(connection, path, path_parameters, body, current_user_id, current_user_id_db, user_client_groups):
    """Handle POST operations."""
    if 'entities:set' in path:
        # Set entities for client group: /client-groups/{client_group_name}/entities:set
        return handle_set_entities(connection, path_parameters, body, current_user_id_db, user_client_groups)
    elif 'users:set' in path:
        # Set users for client group: /client-groups/{client_group_name}/users:set
        return handle_set_users(connection, path_parameters, body, current_user_id_db, user_client_groups)
    else:
        # Create client group: /client-groups
        return handle_create_client_group(connection, body, current_user_id_db)


def handle_create_client_group(connection, body, current_user_id_db):
    """Handle creating a new client group."""
    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in request body"}

    # Validate required fields
    client_group_name = request_data.get('client_group_name')
    if not client_group_name:
        return {"error": "client_group_name is required"}

    # Check if client group already exists
    existing_id = get_client_group_id_by_name(connection, client_group_name)
    if existing_id:
        return {"error": f"Client group '{client_group_name}' already exists"}

    # Validate we have a current user to associate
    if current_user_id_db is None:
        print("WARNING: Creating client group without current_user_id_db - no user association will be created")
        return {"error": "Unable to determine current user. Please ensure you are properly authenticated."}

    # Extract preferences
    preferences = request_data.get('preferences', {})
    preferences_json = json.dumps(preferences) if preferences else None

    with connection.cursor() as cursor:
        # Insert new client group
        cursor.execute("""
            INSERT INTO client_groups (client_group_name, preferences, updated_user_id)
            VALUES (%s, %s, %s)
        """, (client_group_name, preferences_json, current_user_id_db))

        new_client_group_id = cursor.lastrowid
        print(
            f"Created client group {client_group_name} with ID {new_client_group_id}")

        # Associate the creating user with the new client group
        cursor.execute("""
            INSERT INTO client_group_users (client_group_id, user_id)
            VALUES (%s, %s)
        """, (new_client_group_id, current_user_id_db))
        print(
            f"Associated user {current_user_id_db} with client group {new_client_group_id}")

        connection.commit()

        return {"message": "Client group created successfully", "client_group_id": new_client_group_id}


def handle_put_operations(connection, path, path_parameters, body, current_user_id, current_user_id_db, user_client_groups):
    """Handle PUT operations."""
    if 'client_group_name' not in path_parameters:
        return {"error": "client_group_name is required in path"}

    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in request body"}

    client_group_name = unquote(path_parameters['client_group_name'])

    # Check if user has access to this client group
    client_group_id = get_client_group_id_by_name(
        connection, client_group_name)
    if not client_group_id or client_group_id not in user_client_groups:
        return {"error": "Client group not found or access denied"}

    # Handle entities:set endpoint
    if 'entities:set' in path:
        return handle_set_entities(connection, path_parameters, body, current_user_id_db, user_client_groups)
    elif 'users:set' in path:
        return handle_set_users(connection, path_parameters, body, current_user_id_db, user_client_groups)

    # Update client group (only update provided fields)
    update_fields = []
    update_params = []

    # Handle client_group_name change
    new_name = request_data.get('client_group_name')
    if new_name and new_name != client_group_name:
        # Check if new client_group_name already exists
        existing_id = get_client_group_id_by_name(connection, new_name)
        if existing_id:
            return {"error": f"Client group '{new_name}' already exists"}
        update_fields.append("client_group_name = %s")
        update_params.append(new_name)

    # Handle preferences
    preferences = request_data.get('preferences')
    if preferences is not None:
        preferences_json = json.dumps(preferences) if preferences else None
        update_fields.append("preferences = %s")
        update_params.append(preferences_json)

    if current_user_id_db is not None:
        update_fields.append("updated_user_id = %s")
        update_params.append(current_user_id_db)

    update_fields.append("update_date = NOW()")

    if update_fields:
        update_params.append(client_group_id)
        with connection.cursor() as cursor:
            cursor.execute(f"""
                UPDATE client_groups 
                SET {', '.join(update_fields)}
                WHERE client_group_id = %s
            """, update_params)
            connection.commit()

    return {"message": "Client group updated successfully"}


def handle_delete_operations(connection, path, path_parameters, current_user_id_db, user_client_groups):
    """Handle DELETE operations."""
    if 'client_group_name' not in path_parameters:
        return {"error": "client_group_name is required in path"}

    client_group_name = unquote(path_parameters['client_group_name'])

    # Check if user has access to this client group
    client_group_id = get_client_group_id_by_name(
        connection, client_group_name)
    if not client_group_id or client_group_id not in user_client_groups:
        return {"error": "Client group not found or access denied"}

    # Validate that client group can be safely deleted
    can_delete, error_messages = validate_client_group_deletion(
        connection, client_group_id)
    if not can_delete:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "; ".join(error_messages)}),
            "headers": cors_helper.get_cors_headers()
        }

    with connection.cursor() as cursor:
        # Delete client group (cascade will handle related records)
        cursor.execute(
            "DELETE FROM client_groups WHERE client_group_id = %s", (client_group_id,))
        connection.commit()
        return {"message": "Client group deleted successfully"}


def handle_set_entities(connection, path_parameters, body, current_user_id_db, user_client_groups):
    """Handle setting entities for a client group."""
    if 'client_group_name' not in path_parameters:
        return {"error": "client_group_name is required in path"}

    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in request body"}

    client_group_name = unquote(path_parameters['client_group_name'])

    # Check if user has access to this client group
    client_group_id = get_client_group_id_by_name(
        connection, client_group_name)
    if not client_group_id or client_group_id not in user_client_groups:
        return {"error": "Client group not found or access denied"}

    # Get entity IDs from request
    entity_names = request_data.get('entity_names', [])
    entity_ids = request_data.get('entity_ids', [])

    # Convert entity names to IDs
    for entity_name in entity_names:
        entity_id = get_entity_id_by_name(connection, entity_name)
        if entity_id and entity_id not in entity_ids:
            entity_ids.append(entity_id)
        elif not entity_id:
            return {"error": f"Entity '{entity_name}' not found"}

    with connection.cursor() as cursor:
        # Delete existing entity associations for this client group
        cursor.execute(
            "DELETE FROM client_group_entities WHERE client_group_id = %s", (client_group_id,))

        # Insert new entity associations
        for entity_id in entity_ids:
            cursor.execute("""
                INSERT INTO client_group_entities (client_group_id, entity_id, updated_user_id)
                VALUES (%s, %s, %s)
            """, (client_group_id, entity_id, current_user_id_db))

        connection.commit()
        return {"message": "Entity associations updated successfully"}


def handle_set_users(connection, path_parameters, body, current_user_id_db, user_client_groups):
    """Handle setting users for a client group."""
    if 'client_group_name' not in path_parameters:
        return {"error": "client_group_name is required in path"}

    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in request body"}

    client_group_name = unquote(path_parameters['client_group_name'])

    # Check if user has access to this client group
    client_group_id = get_client_group_id_by_name(
        connection, client_group_name)
    if not client_group_id or client_group_id not in user_client_groups:
        return {"error": "Client group not found or access denied"}

    # Get user IDs from request
    user_names = request_data.get('user_names', [])
    user_ids = request_data.get('user_ids', [])

    # Convert user names to IDs
    for user_name in user_names:
        user_id = get_user_id_by_name(connection, user_name)
        if user_id and user_id not in user_ids:
            user_ids.append(user_id)
        elif not user_id:
            return {"error": f"User '{user_name}' not found"}

    with connection.cursor() as cursor:
        # Delete existing user associations for this client group
        cursor.execute(
            "DELETE FROM client_group_users WHERE client_group_id = %s", (client_group_id,))

        # Insert new user associations
        for user_id in user_ids:
            cursor.execute("""
                INSERT INTO client_group_users (client_group_id, user_id)
                VALUES (%s, %s)
            """, (client_group_id, user_id))

        connection.commit()
        return {"message": "User associations updated successfully"}
