import json
import boto3
import pymysql
import os
from datetime import datetime
from botocore.exceptions import ClientError
from urllib.parse import unquote
import cors_helper
# Data consistency functions (inline to avoid import issues)


def ensure_primary_client_group_consistency(connection, user_id, primary_client_group_id):
    """Ensure that if a user has a primary_client_group_id, there's a corresponding row in client_group_users table."""
    try:
        with connection.cursor() as cursor:
            if primary_client_group_id:
                # Check if the client group exists
                cursor.execute(
                    "SELECT client_group_id FROM client_groups WHERE client_group_id = %s",
                    (primary_client_group_id,)
                )
                if not cursor.fetchone():
                    # Client group doesn't exist, set primary_client_group_id to NULL
                    cursor.execute(
                        "UPDATE users SET primary_client_group_id = NULL WHERE user_id = %s",
                        (user_id,)
                    )
                    return False

                # Ensure there's a row in client_group_users
                cursor.execute(
                    "SELECT 1 FROM client_group_users WHERE client_group_id = %s AND user_id = %s",
                    (primary_client_group_id, user_id)
                )
                if not cursor.fetchone():
                    # Add the missing relationship
                    cursor.execute(
                        "INSERT INTO client_group_users (client_group_id, user_id) VALUES (%s, %s)",
                        (primary_client_group_id, user_id)
                    )
            return True
    except Exception as e:
        print(f"Error ensuring primary client group consistency: {e}")
        return False


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


def get_valid_user_ids_for_current_user(connection, current_user_id):
    """
    Get all user IDs that the current user is authorized to view/modify.
    This includes all users in the same client groups as the current user.
    Returns a list of user_ids.
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

        # Get all user IDs that are in any of the current user's client groups
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT DISTINCT user_id 
                FROM client_group_users 
                WHERE client_group_id IN ({})
            """.format(','.join(['%s'] * len(user_client_groups))),
                user_client_groups)
            results = cursor.fetchall()
            return [row[0] for row in results]
    except Exception as e:
        print(f"Error getting valid user IDs: {e}")
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
        print(f"Error getting client_group_name by ID: {e}")
        return None


def lambda_handler(event, context):
    """
    Handle user operations for V2 API.
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

        # Get valid user IDs for authorization
        valid_user_ids = get_valid_user_ids_for_current_user(
            connection, current_user_id)
        if not valid_user_ids:
            return {
                "statusCode": 403,
                "body": json.dumps({"error": "User has no client group affiliations or access denied"}),
                "headers": cors_helper.get_cors_headers()
            }

        if http_method == 'GET':
            # Handle GET operations
            if '/client-groups:set' in path:
                # This should be a POST operation, return 405
                return {
                    "statusCode": 405,
                    "body": json.dumps({"error": "Method not allowed. Use POST for setting client groups."}),
                    "headers": cors_helper.get_cors_headers()
                }
            elif 'sub' in path_parameters:
                # Get single user by sub: /users/{sub}
                sub = unquote(path_parameters['sub'])

                with connection.cursor() as cursor:
                    # Find user by sub (Cognito user ID)
                    cursor.execute("""
                        SELECT u.user_id, u.sub, u.email, u.preferences, u.primary_client_group_id, u.update_date
                        FROM users u
                        WHERE u.sub = %s AND u.user_id IN ({})
                    """.format(','.join(['%s'] * len(valid_user_ids))),
                        [sub] + valid_user_ids)
                    result = cursor.fetchone()

                    if not result:
                        return {
                            "statusCode": 404,
                            "body": json.dumps({"error": "User not found or access denied"}),
                            "headers": cors_helper.get_cors_headers()
                        }

                    # Map database fields to OpenAPI schema
                    preferences = json.loads(result[3]) if result[3] else {}

                    response = {
                        "user_id": result[0],
                        "sub": result[1],
                        "email": result[2],
                        "preferences": preferences,
                        "primary_client_group_id": result[4],
                        "update_date": result[5].isoformat() + "Z" if result[5] else None
                    }
            else:
                # List users with optional filters: /users?email=...&client_group_name=...&count=true
                count_only = query_parameters.get(
                    'count', 'false').lower() == 'true'
                email_filter = query_parameters.get('email')
                client_group_name_filter = query_parameters.get(
                    'client_group_name')

                with connection.cursor() as cursor:
                    if count_only:
                        # Return count only
                        if client_group_name_filter:
                            cursor.execute("""
                                SELECT COUNT(*) as count
                                FROM users u
                                INNER JOIN client_group_users cgu ON u.user_id = cgu.user_id
                                INNER JOIN client_groups cg ON cgu.client_group_id = cg.client_group_id
                                WHERE u.user_id IN ({}) AND cg.client_group_name = %s
                            """.format(','.join(['%s'] * len(valid_user_ids))),
                                valid_user_ids + [client_group_name_filter])
                        elif email_filter:
                            cursor.execute("""
                                SELECT COUNT(*) as count
                                FROM users u
                                WHERE u.user_id IN ({}) AND u.email = %s
                            """.format(','.join(['%s'] * len(valid_user_ids))),
                                valid_user_ids + [email_filter])
                        else:
                            cursor.execute("""
                                SELECT COUNT(*) as count
                                FROM users u
                                WHERE u.user_id IN ({})
                            """.format(','.join(['%s'] * len(valid_user_ids))),
                                valid_user_ids)
                        result = cursor.fetchone()
                        response = {"count": result[0]}
                    else:
                        # Return users data with filters
                        where_conditions = ["u.user_id IN ({})".format(
                            ','.join(['%s'] * len(valid_user_ids)))]
                        query_params = list(valid_user_ids)

                        if email_filter:
                            where_conditions.append("u.email = %s")
                            query_params.append(email_filter)

                        if client_group_name_filter:
                            where_conditions.append(
                                "cg.client_group_name = %s")
                            # Join with client groups for filtering
                            join_clause = """
                                INNER JOIN client_group_users cgu ON u.user_id = cgu.user_id
                                INNER JOIN client_groups cg ON cgu.client_group_id = cg.client_group_id
                            """
                        else:
                            join_clause = """
                                LEFT JOIN client_groups cg ON u.primary_client_group_id = cg.client_group_id
                            """

                        cursor.execute(f"""
                            SELECT u.user_id, u.sub, u.email, u.preferences, u.primary_client_group_id, u.update_date
                            FROM users u
                            {join_clause}
                            WHERE {' AND '.join(where_conditions)}
                            ORDER BY u.email
                        """, query_params)

                        results = cursor.fetchall()

                        response = []
                        for result in results:
                            # Map database fields to OpenAPI schema
                            preferences = json.loads(
                                result[3]) if result[3] else {}

                            response.append({
                                "user_id": result[0],
                                "sub": result[1],
                                "email": result[2],
                                "preferences": preferences,
                                "primary_client_group_id": result[4],
                                "update_date": result[5].isoformat() + "Z" if result[5] else None
                            })

        elif http_method == 'POST':
            # Handle POST operations
            if path == '/users' or path.endswith('/users'):
                # Create new user: POST /users
                try:
                    request_data = json.loads(body) if body else {}
                except json.JSONDecodeError:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "Invalid JSON in request body"}),
                        "headers": cors_helper.get_cors_headers()
                    }

                # Validate required fields
                sub = request_data.get('sub')
                email = request_data.get('email')
                if not sub or not email:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "sub and email are required"}),
                        "headers": cors_helper.get_cors_headers()
                    }

                # Extract optional fields
                preferences = request_data.get('preferences', {})
                preferences_json = json.dumps(
                    preferences) if preferences else None
                primary_client_group_id = request_data.get(
                    'primary_client_group_id')

                with connection.cursor() as cursor:
                    # Check if user already exists
                    cursor.execute(
                        "SELECT user_id FROM users WHERE sub = %s", (sub,))
                    existing = cursor.fetchone()

                    if existing:
                        # Update existing user
                        cursor.execute("""
                            UPDATE users 
                            SET email = %s, preferences = %s, primary_client_group_id = %s, update_date = NOW()
                            WHERE user_id = %s
                        """, (email, preferences_json, primary_client_group_id, existing[0]))

                        # Update primary client group relationship if needed
                        if primary_client_group_id:
                            cursor.execute("""
                                INSERT IGNORE INTO client_group_users (client_group_id, user_id)
                                VALUES (%s, %s)
                            """, (primary_client_group_id, existing[0]))

                        # Ensure primary client group consistency
                        if not ensure_primary_client_group_consistency(connection, existing[0], primary_client_group_id):
                            connection.rollback()
                            return {
                                "statusCode": 500,
                                "body": json.dumps({"error": "Failed to establish primary client group relationship"}),
                                "headers": cors_helper.get_cors_headers()
                            }

                        connection.commit()
                        response = {"message": "User updated successfully"}
                    else:
                        # Insert new user
                        cursor.execute("""
                            INSERT INTO users (sub, email, preferences, primary_client_group_id)
                            VALUES (%s, %s, %s, %s)
                        """, (sub, email, preferences_json, primary_client_group_id))

                        new_user_id = cursor.lastrowid

                        # Add primary client group relationship if specified
                        if primary_client_group_id:
                            cursor.execute("""
                                INSERT INTO client_group_users (client_group_id, user_id)
                                VALUES (%s, %s)
                            """, (primary_client_group_id, new_user_id))

                        # Ensure primary client group consistency
                        if primary_client_group_id:
                            if not ensure_primary_client_group_consistency(connection, new_user_id, primary_client_group_id):
                                connection.rollback()
                                return {
                                    "statusCode": 500,
                                    "body": json.dumps({"error": "Failed to establish primary client group relationship"}),
                                    "headers": cors_helper.get_cors_headers()
                                }

                        connection.commit()
                        response = {"message": "User created successfully"}

            elif '/client-groups:set' in path:
                # Set client groups for user: /users/{user_name}/client-groups:set
                user_name = unquote(path_parameters['user_name'])

                try:
                    request_data = json.loads(body) if body else {}
                except json.JSONDecodeError:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "Invalid JSON in request body"}),
                        "headers": cors_helper.get_cors_headers()
                    }

                # Get client groups from request
                client_group_names = request_data.get('client_group_names', [])
                client_group_ids = request_data.get('client_group_ids', [])

                if not client_group_names and not client_group_ids:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "Either client_group_names or client_group_ids is required"}),
                        "headers": cors_helper.get_cors_headers()
                    }

                # Get user_id for the target user
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT user_id FROM users WHERE email = %s", (user_name,))
                    user_result = cursor.fetchone()
                    if not user_result:
                        return {
                            "statusCode": 404,
                            "body": json.dumps({"error": "User not found"}),
                            "headers": cors_helper.get_cors_headers()
                        }

                    target_user_id = user_result[0]

                    # Check if current user can modify this user
                    if target_user_id not in valid_user_ids:
                        return {
                            "statusCode": 403,
                            "body": json.dumps({"error": "Access denied - cannot modify this user"}),
                            "headers": cors_helper.get_cors_headers()
                        }

                # Convert client group names to IDs if needed
                final_client_group_ids = []
                if client_group_names:
                    for client_group_name in client_group_names:
                        cg_id = get_client_group_id_by_name(
                            connection, client_group_name)
                        if cg_id:
                            final_client_group_ids.append(cg_id)
                        else:
                            return {
                                "statusCode": 400,
                                "body": json.dumps({"error": f"Client group '{client_group_name}' not found"}),
                                "headers": cors_helper.get_cors_headers()
                            }
                else:
                    final_client_group_ids = client_group_ids

                # Update client_group_users table (delete existing, insert new)
                with connection.cursor() as cursor:
                    # Delete existing relationships
                    cursor.execute(
                        "DELETE FROM client_group_users WHERE user_id = %s", (target_user_id,))

                    # Insert new relationships
                    for cg_id in final_client_group_ids:
                        cursor.execute("""
                            INSERT INTO client_group_users (client_group_id, user_id)
                            VALUES (%s, %s)
                        """, (cg_id, target_user_id))

                    connection.commit()
                    response = {
                        "message": "Client groups updated successfully"}

        elif http_method == 'PUT':
            # Handle PUT operations: /users/{sub} (update)
            if 'sub' not in path_parameters:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "sub is required in path"}),
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

            sub = unquote(path_parameters['sub'])

            # Get user ID for tracking
            user_id = get_user_id_from_sub(connection, current_user_id)

            # Extract fields from request
            preferences = request_data.get('preferences', {})
            preferences_json = json.dumps(preferences) if preferences else None

            # Support both primary_client_group_id (direct) and primary_client_group_name (lookup)
            primary_client_group_id = request_data.get(
                'primary_client_group_id')
            primary_client_group_name = request_data.get(
                'primary_client_group_name')

            # If name is provided but not ID, look up the ID
            if primary_client_group_name and not primary_client_group_id:
                primary_client_group_id = get_client_group_id_by_name(
                    connection, primary_client_group_name)
                if not primary_client_group_id:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": f"Primary client group '{primary_client_group_name}' not found"}),
                        "headers": cors_helper.get_cors_headers()
                    }

            with connection.cursor() as cursor:
                # Check if user exists and current user can modify it
                cursor.execute("""
                    SELECT user_id FROM users 
                    WHERE sub = %s AND user_id IN ({})
                """.format(','.join(['%s'] * len(valid_user_ids))),
                    [sub] + valid_user_ids)
                existing = cursor.fetchone()

                if not existing:
                    return {
                        "statusCode": 404,
                        "body": json.dumps({"error": "User not found or access denied"}),
                        "headers": cors_helper.get_cors_headers()
                    }

                target_user_id = existing[0]

                # Update user
                cursor.execute("""
                    UPDATE users 
                    SET preferences = %s, primary_client_group_id = %s, update_date = NOW()
                    WHERE user_id = %s
                """, (preferences_json, primary_client_group_id, target_user_id))

                # Update primary client group relationship if needed
                if primary_client_group_id:
                    cursor.execute("""
                        INSERT IGNORE INTO client_group_users (client_group_id, user_id)
                        VALUES (%s, %s)
                    """, (primary_client_group_id, target_user_id))

                # Ensure primary client group consistency
                if not ensure_primary_client_group_consistency(connection, target_user_id, primary_client_group_id):
                    connection.rollback()
                    return {
                        "statusCode": 500,
                        "body": json.dumps({"error": "Failed to establish primary client group relationship"}),
                        "headers": cors_helper.get_cors_headers()
                    }

                connection.commit()
                response = {"message": "User updated successfully"}

        elif http_method == 'DELETE':
            # Handle DELETE operations: /users/{sub}
            if 'sub' not in path_parameters:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "sub is required in path"}),
                    "headers": cors_helper.get_cors_headers()
                }

            sub = unquote(path_parameters['sub'])

            with connection.cursor() as cursor:
                # Check if user exists and current user can modify it
                cursor.execute("""
                    SELECT user_id FROM users 
                    WHERE sub = %s AND user_id IN ({})
                """.format(','.join(['%s'] * len(valid_user_ids))),
                    [sub] + valid_user_ids)
                existing = cursor.fetchone()

                if not existing:
                    return {
                        "statusCode": 404,
                        "body": json.dumps({"error": "User not found or access denied"}),
                        "headers": cors_helper.get_cors_headers()
                    }

                # Delete user (CASCADE will handle client_group_users)
                cursor.execute(
                    "DELETE FROM users WHERE user_id = %s", (existing[0],))
                connection.commit()
                response = {"message": "User deleted successfully"}

        else:
            # Handle unsupported methods
            return {
                "statusCode": 405,
                "body": json.dumps({"error": f"Method {http_method} not allowed for users"}),
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
