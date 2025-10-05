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


def get_user_primary_client_group(connection, user_id):
    """
    Get the primary client group ID for a user.
    Returns the client_group_id or None if not set.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT primary_client_group_id FROM users WHERE user_id = %s", (user_id,))
            result = cursor.fetchone()
            return result[0] if result and result[0] else None
    except Exception as e:
        print(f"Error getting user primary client group: {e}")
        return None


def get_valid_entity_ids_for_current_user(connection, current_user_id):
    """
    Get all entity IDs that the current user is authorized to view/modify.
    This includes all entities in the same client groups as the current user.
    Returns a list of entity_ids.
    """
    try:
        # Get current user's client groups
        current_user_id_db = get_user_id_from_sub(connection, current_user_id)
        if not current_user_id_db:
            return []

        user_client_groups = get_user_client_groups(
            connection, current_user_id_db)
        if not user_client_groups:
            return []

        # Get all entity IDs that are in any of the current user's client groups
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT DISTINCT entity_id 
                FROM client_group_entities 
                WHERE client_group_id IN ({})
            """.format(','.join(['%s'] * len(user_client_groups))),
                user_client_groups)
            results = cursor.fetchall()
            entity_ids = [row[0] for row in results]
            return entity_ids
    except Exception as e:
        print(f"Error getting valid entity IDs: {e}")
        return []


def get_client_group_id_by_name(connection, client_group_name):
    """Get client_group_id from client_group_name."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT client_group_id FROM client_groups WHERE name = %s", (client_group_name,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting client group ID by name: {e}")
        return None


def get_entity_type_id_by_name(connection, entity_type_name):
    """Get entity_type_id from entity_type_name."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT entity_type_id FROM entity_types WHERE name = %s", (entity_type_name,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting entity type ID by name: {e}")
        return None


def get_entity_id_by_name(connection, entity_name):
    """Get entity_id from entity_name."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT entity_id FROM entities WHERE name = %s", (entity_name,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting entity ID by name: {e}")
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
        print(f"Error getting user name by ID: {e}")
        return None


def handle_entity_operations(connection, http_method, path, path_parameters, query_parameters, body, current_user_id, valid_entity_ids):
    """Handle all entity operations based on HTTP method and path."""

    if http_method == 'GET':
        return handle_get_operations(connection, path, path_parameters, query_parameters, valid_entity_ids)
    elif http_method == 'POST':
        return handle_post_operations(connection, path, path_parameters, body, current_user_id, valid_entity_ids)
    elif http_method == 'PUT':
        return handle_put_operations(connection, path, path_parameters, body, current_user_id, valid_entity_ids)
    elif http_method == 'DELETE':
        return handle_delete_operations(connection, path, path_parameters, current_user_id, valid_entity_ids)
    else:
        return {"error": f"Method {http_method} not allowed for entities"}


def handle_get_operations(connection, path, path_parameters, query_parameters, valid_entity_ids):
    """Handle GET operations."""
    if '/entities:set' in path and path.startswith('/entities/'):
        return {"error": "Method not allowed. Use POST for setting entities."}
    elif 'entity_name' in path_parameters:
        # Get single entity by name: /entities/{entity_name}
        entity_name = unquote(path_parameters['entity_name'])

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT e.entity_id, e.name, e.entity_type_id, e.attributes, e.update_date, e.updated_user_id,
                       et.name as entity_type_name
                FROM entities e
                JOIN entity_types et ON e.entity_type_id = et.entity_type_id
                WHERE e.name = %s AND e.entity_id IN ({})
            """.format(','.join(['%s'] * len(valid_entity_ids))),
                [entity_name] + valid_entity_ids)
            result = cursor.fetchone()

            if not result:
                return {"error": "Entity not found or access denied"}

            # Map database fields to OpenAPI schema
            attributes = json.loads(result[3]) if result[3] else {}
            updated_by_user_name = get_user_name_by_id(
                connection, result[5]) if result[5] else None

            return {
                "entity_name": result[1],
                "entity_type_name": result[6],
                "attributes": attributes,
                "update_date": result[4].isoformat() + "Z" if result[4] else None,
                "updated_by_user_name": updated_by_user_name
            }
    else:
        # List all entities: /entities
        return handle_list_entities(connection, query_parameters, valid_entity_ids)


def handle_list_entities(connection, query_parameters, valid_entity_ids):
    """Handle listing entities with optional filters and pagination."""
    # Apply query filters (removed user_name_filter for security - users should only see entities they have access to)
    entity_type_name_filter = query_parameters.get('entity_type_name')
    client_group_name_filter = query_parameters.get('client_group_name')
    count_only = query_parameters.get('count', 'false').lower() == 'true'

    # Build base query using only entities the current user has access to
    base_query = """
        FROM entities e
        JOIN entity_types et ON e.entity_type_id = et.entity_type_id
        WHERE e.entity_id IN ({})
    """.format(','.join(['%s'] * len(valid_entity_ids)))

    params = valid_entity_ids.copy()

    # Add filters
    if entity_type_name_filter:
        base_query += " AND et.name = %s"
        params.append(entity_type_name_filter)

    if client_group_name_filter:
        base_query += """ AND e.entity_id IN (
            SELECT cge.entity_id 
            FROM client_group_entities cge 
            JOIN client_groups cg ON cge.client_group_id = cg.client_group_id 
            WHERE cg.name = %s
        )"""
        params.append(client_group_name_filter)

    # SECURITY: Removed user_name_filter to prevent users from querying other users' entities
    # Users can only see entities they have access to through their client groups

    if count_only:
        # Return count only
        count_query = f"SELECT COUNT(*) as count {base_query}"
        with connection.cursor() as cursor:
            cursor.execute(count_query, params)
            result = cursor.fetchone()
            return {"count": result[0]}

    # Get entities with pagination
    query = f"""
        SELECT DISTINCT e.entity_id, e.name, e.entity_type_id, e.attributes, e.update_date, e.updated_user_id,
               et.name as entity_type_name
        {base_query}
        ORDER BY e.name
    """

    with connection.cursor() as cursor:
        cursor.execute(query, params)
        results = cursor.fetchall()

        data = []
        for result in results:
            # Map database fields to OpenAPI schema
            attributes = json.loads(result[3]) if result[3] else {}
            updated_by_user_name = get_user_name_by_id(
                connection, result[5]) if result[5] else None

            data.append({
                "entity_id": result[0],  # Include entity_id for DataGrid
                "entity_name": result[1],
                "entity_type_name": result[6],
                "attributes": attributes,
                "update_date": result[4].isoformat() + "Z" if result[4] else None,
                "updated_by_user_name": updated_by_user_name
            })

            return data


def handle_post_operations(connection, path, path_parameters, body, current_user_id, valid_entity_ids):
    """Handle POST operations."""
    if '/entities:set' in path and path.startswith('/entities/'):
        return handle_set_client_group_entities(connection, path_parameters, body, current_user_id)
    else:
        return handle_create_entity(connection, body, current_user_id)


def handle_set_client_group_entities(connection, path_parameters, body, current_user_id):
    """Handle setting entities for a client group."""
    client_group_name = unquote(path_parameters['client_group_name'])

    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in request body"}

    # Get entities from request
    entity_names = request_data.get('entity_names', [])
    entity_ids = request_data.get('entity_ids', [])

    # Check if both are missing (not provided in request)
    if 'entity_names' not in request_data and 'entity_ids' not in request_data:
        return {"error": "Either entity_names or entity_ids is required"}

    # Empty arrays are valid (means clear all entities from client group)

    # Get client_group_id for the target client group
    client_group_id = get_client_group_id_by_name(
        connection, client_group_name)
    if not client_group_id:
        return {"error": "Client group not found"}

    # Check if current user has access to this client group
    current_user_id_db = get_user_id_from_sub(connection, current_user_id)
    if current_user_id_db:
        user_client_groups = get_user_client_groups(
            connection, current_user_id_db)
        if client_group_id not in user_client_groups:
            return {"error": "Access denied - cannot modify this client group"}

    # Convert entity names to IDs if needed
    final_entity_ids = []
    if entity_names:
        for name in entity_names:
            entity_id = get_entity_id_by_name(connection, name)
            if entity_id:
                final_entity_ids.append(entity_id)
            else:
                return {"error": f"Entity '{name}' not found"}
    else:
        final_entity_ids = entity_ids

    # Update client_group_entities table (delete existing, insert new)
    with connection.cursor() as cursor:
        # Delete existing relationships
        cursor.execute(
            "DELETE FROM client_group_entities WHERE client_group_id = %s", (client_group_id,))

        # Insert new relationships
        for entity_id in final_entity_ids:
            cursor.execute("""
                INSERT INTO client_group_entities (client_group_id, entity_id, updated_user_id)
                VALUES (%s, %s, %s)
            """, (client_group_id, entity_id, current_user_id_db))

        connection.commit()
        return {"message": "Entity associations updated successfully"}


def handle_create_entity(connection, body, current_user_id):
    """Handle creating a new entity."""
    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in request body"}

    # Validate required fields
    entity_name = request_data.get('entity_name')
    entity_type_name = request_data.get('entity_type_name')
    if not entity_name or not entity_type_name:
        return {"error": "entity_name and entity_type_name are required"}

    # Get user ID for tracking
    user_id = get_user_id_from_sub(connection, current_user_id)

    # Get entity type ID
    entity_type_id = get_entity_type_id_by_name(connection, entity_type_name)
    if not entity_type_id:
        return {"error": f"Entity type '{entity_type_name}' not found"}

    # Extract attributes from request
    attributes = request_data.get('attributes', {})
    attributes_json = json.dumps(attributes) if attributes else None

    with connection.cursor() as cursor:
        # Check if entity already exists
        cursor.execute(
            "SELECT entity_id FROM entities WHERE name = %s", (entity_name,))
        existing = cursor.fetchone()

        if existing:
            # Update existing entity
            cursor.execute("""
                UPDATE entities 
                SET entity_type_id = %s, attributes = %s, update_date = NOW(), updated_user_id = %s
                WHERE entity_id = %s
            """, (entity_type_id, attributes_json, user_id, existing[0]))

            # Ensure the entity is still associated with the user's primary client group
            if user_id:
                primary_client_group_id = get_user_primary_client_group(
                    connection, user_id)
                if primary_client_group_id:
                    cursor.execute("""
                        INSERT IGNORE INTO client_group_entities (client_group_id, entity_id, updated_user_id)
                        VALUES (%s, %s, %s)
                    """, (primary_client_group_id, existing[0], user_id))

            connection.commit()
            return {"message": "Entity updated successfully"}
        else:
            # Insert new entity
            cursor.execute("""
                INSERT INTO entities (name, entity_type_id, attributes, updated_user_id)
                VALUES (%s, %s, %s, %s)
            """, (entity_name, entity_type_id, attributes_json, user_id))

            new_entity_id = cursor.lastrowid

            # CRITICAL: Associate entity with user's primary client group
            if not user_id:
                connection.rollback()
                return {"error": "User ID not found. Cannot create entity."}

            primary_client_group_id = get_user_primary_client_group(
                connection, user_id)
            if not primary_client_group_id:
                connection.rollback()
                return {"error": "User has no primary client group set. Cannot create entity. Please set a primary client group first."}

            # Insert into client_group_entities table
            try:
                cursor.execute("""
                    INSERT INTO client_group_entities (client_group_id, entity_id, updated_user_id)
                    VALUES (%s, %s, %s)
                """, (primary_client_group_id, new_entity_id, user_id))

                # Verify the insertion was successful
                cursor.execute("""
                    SELECT COUNT(*) FROM client_group_entities 
                    WHERE client_group_id = %s AND entity_id = %s
                """, (primary_client_group_id, new_entity_id))
                count = cursor.fetchone()[0]

                if count == 0:
                    connection.rollback()
                    return {"error": "Failed to associate entity with client group. Entity not accessible."}

            except Exception as e:
                connection.rollback()
                return {"error": f"Failed to associate entity with client group: {str(e)}"}

            connection.commit()
            return {"message": "Entity created successfully"}


def handle_put_operations(connection, path, path_parameters, body, current_user_id, valid_entity_ids):
    """Handle PUT operations."""
    if 'entity_name' not in path_parameters:
        return {"error": "entity_name is required in path"}

    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in request body"}

    entity_name = unquote(path_parameters['entity_name'])

    # Get user ID for tracking
    user_id = get_user_id_from_sub(connection, current_user_id)

    # Extract fields from request
    entity_type_name = request_data.get('entity_type_name')
    attributes = request_data.get('attributes', {})
    attributes_json = json.dumps(attributes) if attributes else None

    # Get entity type ID if entity_type_name is provided
    entity_type_id = None
    if entity_type_name:
        entity_type_id = get_entity_type_id_by_name(
            connection, entity_type_name)
        if not entity_type_id:
            return {"error": f"Entity type '{entity_type_name}' not found"}

    with connection.cursor() as cursor:
        # Check if entity exists and current user can modify it
        cursor.execute("""
            SELECT entity_id FROM entities 
            WHERE name = %s AND entity_id IN ({})
        """.format(','.join(['%s'] * len(valid_entity_ids))),
            [entity_name] + valid_entity_ids)
        existing = cursor.fetchone()

        if not existing:
            return {"error": "Entity not found or access denied"}

        target_entity_id = existing[0]

        # Update entity (only update provided fields)
        update_fields = []
        update_params = []

        if entity_type_id is not None:
            update_fields.append("entity_type_id = %s")
            update_params.append(entity_type_id)

        if attributes_json is not None:
            update_fields.append("attributes = %s")
            update_params.append(attributes_json)

        if user_id is not None:
            update_fields.append("updated_user_id = %s")
            update_params.append(user_id)

        update_fields.append("update_date = NOW()")

        if update_fields:
            update_params.append(target_entity_id)
            cursor.execute(f"""
                UPDATE entities 
                SET {', '.join(update_fields)}
                WHERE entity_id = %s
            """, update_params)

        connection.commit()
        return {"message": "Entity updated successfully"}


def handle_delete_operations(connection, path, path_parameters, current_user_id, valid_entity_ids):
    """Handle DELETE operations."""
    if 'entity_name' not in path_parameters:
        return {"error": "entity_name is required in path"}

    entity_name = unquote(path_parameters['entity_name'])

    with connection.cursor() as cursor:
        # Check if entity exists and current user can modify it
        cursor.execute("""
            SELECT entity_id FROM entities 
            WHERE name = %s AND entity_id IN ({})
        """.format(','.join(['%s'] * len(valid_entity_ids))),
            [entity_name] + valid_entity_ids)
        existing = cursor.fetchone()

        if not existing:
            return {"error": "Entity not found or access denied"}

        target_entity_id = existing[0]

        # Get current user's client groups
        current_user_id_db = get_user_id_from_sub(connection, current_user_id)
        user_client_groups = get_user_client_groups(
            connection, current_user_id_db) if current_user_id_db else []

        # Check if entity is affiliated with other client groups outside user's scope
        cursor.execute("""
            SELECT client_group_id 
            FROM client_group_entities 
            WHERE entity_id = %s AND client_group_id NOT IN ({})
        """.format(','.join(['%s'] * len(user_client_groups)) if user_client_groups else 'NULL'),
            [target_entity_id] + (user_client_groups if user_client_groups else []))

        external_affiliations = cursor.fetchall()

        if external_affiliations:
            # Entity is affiliated with other client groups - only remove affiliations for user's client groups
            if user_client_groups:
                cursor.execute("""
                    DELETE FROM client_group_entities 
                    WHERE entity_id = %s AND client_group_id IN ({})
                """.format(','.join(['%s'] * len(user_client_groups))),
                    [target_entity_id] + user_client_groups)
            connection.commit()
            return {"message": "Entity affiliations removed from accessible client groups"}
        else:
            # Entity is only affiliated with user's client groups - safe to delete the entity
            cursor.execute(
                "DELETE FROM entities WHERE entity_id = %s", (target_entity_id,))
            connection.commit()
            return {"message": "Entity deleted successfully"}


def lambda_handler(event, context):
    """
    Handle entity operations for V2 API.
    Returns data compliant with OpenAPI specification.
    """
    # Debug logging to see if this handler is being called
    path = event.get('path', '')
    print(f"DEBUG: EntitiesHandler called for path: {path}")

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

        # Get valid entity IDs for authorization
        valid_entity_ids = get_valid_entity_ids_for_current_user(
            connection, current_user_id)
        if not valid_entity_ids:
            return {
                "statusCode": 403,
                "body": json.dumps({"error": "User has no client group affiliations or access denied"}),
                "headers": {"Content-Type": "application/json"}
            }

        # Handle different operations based on HTTP method and path
        response = handle_entity_operations(
            connection, http_method, path, path_parameters,
            query_parameters, body, current_user_id, valid_entity_ids
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
