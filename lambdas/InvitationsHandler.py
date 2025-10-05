import json
import boto3
import pymysql
import os
from datetime import datetime, timedelta
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


def get_user_id_from_sub(connection, current_user_id):
    """
    Get the user_id from the database based on the sub (Cognito user ID).
    Returns None if user not found.
    """
    try:
        print(f"Looking for user with sub: {current_user_id}")
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT user_id FROM users WHERE sub = %s", (current_user_id,))
            result = cursor.fetchone()
            print(f"User lookup result: {result}")
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


def lambda_handler(event, context):
    """
    Handle invitation operations for V2 API.
    Returns data compliant with OpenAPI specification.
    """

    # Extract current user from headers (required by OpenAPI spec)
    print(f"Event headers: {event.get('headers', {})}")
    headers = event.get('headers', {})

    # Case-insensitive header lookup
    current_user_id = 'system'  # default
    for key, value in headers.items():
        if key.lower() == 'x-current-user-id':
            current_user_id = value
            break

    print(f"Extracted current_user_id: {current_user_id}")

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
            if '/invitations/redeem/' in path:
                # This should be a POST operation, return 405
                return {
                    "statusCode": 405,
                    "body": json.dumps({"error": "Method not allowed. Use POST for redemption."}),
                    "headers": {"Content-Type": "application/json"}
                }
            elif 'invitation_id' in path_parameters:
                # Get invitation by ID: /invitations/{invitation_id}
                invitation_id = path_parameters['invitation_id']

                # Get user's client groups for authorization
                user_id = get_user_id_from_sub(connection, current_user_id)
                if not user_id:
                    return {
                        "statusCode": 403,
                        "body": json.dumps({"error": "User not found"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                user_client_groups = get_user_client_groups(
                    connection, user_id)
                if not user_client_groups:
                    return {
                        "statusCode": 403,
                        "body": json.dumps({"error": "User has no client group affiliations"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                with connection.cursor() as cursor:
                    cursor.execute("""
                        SELECT i.invitation_id, i.code, i.expires_at, i.email_sent_to, 
                               cg.name as client_group_name, i.updated_user_id
                        FROM invitations i
                        JOIN client_groups cg ON i.client_group_id = cg.client_group_id
                        WHERE i.invitation_id = %s AND i.client_group_id IN ({})
                    """.format(','.join(['%s'] * len(user_client_groups))),
                        [invitation_id] + user_client_groups)
                    result = cursor.fetchone()

                    if not result:
                        return {
                            "statusCode": 404,
                            "body": json.dumps({"error": "Invitation not found or access denied"}),
                            "headers": {"Content-Type": "application/json"}
                        }

                    response = {
                        "invitation_id": result[0],
                        "code": result[1],
                        "expires_at": result[2].isoformat() + "Z" if result[2] else None,
                        "client_group_name": result[4],
                        "email_sent_to": result[3],
                        "updated_by_user_name": str(result[5]) if result[5] else None
                    }
            else:
                # List invitations: /invitations or /client-groups/{client_group_name}/invitations
                client_group_name = query_parameters.get('client_group_name')
                filter_param = query_parameters.get('filter')

                if '/client-groups/' in path and '/invitations' in path:
                    # Get invitations for a specific client group
                    client_group_name = path_parameters.get(
                        'client_group_name')

                # Get user's client groups for authorization
                user_id = get_user_id_from_sub(connection, current_user_id)
                if not user_id:
                    return {
                        "statusCode": 403,
                        "body": json.dumps({"error": "User not found"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                user_client_groups = get_user_client_groups(
                    connection, user_id)
                if not user_client_groups:
                    return {
                        "statusCode": 403,
                        "body": json.dumps({"error": "User has no client group affiliations"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                with connection.cursor() as cursor:
                    # Check for count parameter
                    count_only = query_parameters.get(
                        'count', 'false').lower() == 'true'

                    # Build the base query
                    base_query = """
                        FROM invitations i
                        JOIN client_groups cg ON i.client_group_id = cg.client_group_id
                        WHERE i.client_group_id IN ({})
                    """.format(','.join(['%s'] * len(user_client_groups)))

                    query_params = user_client_groups.copy()

                    # Add client group filter if specified
                    if client_group_name:
                        base_query += " AND cg.name = %s"
                        query_params.append(client_group_name)

                    # Add expiration filter if specified
                    if filter_param == 'unexpired':
                        base_query += " AND i.expires_at > NOW()"

                    if count_only:
                        # Return count only
                        count_query = f"SELECT COUNT(*) as count {base_query}"
                        cursor.execute(count_query, query_params)
                        result = cursor.fetchone()
                        response = {"count": result[0]}
                    else:
                        # Return invitations data
                        data_query = f"""
                            SELECT i.invitation_id, i.code, i.expires_at, i.email_sent_to,
                                   cg.name as client_group_name, i.updated_user_id
                            {base_query}
                            ORDER BY i.invitation_id DESC
                        """
                        cursor.execute(data_query, query_params)

                        results = cursor.fetchall()
                        response = []
                        for result in results:
                            response.append({
                                "invitation_id": result[0],
                                "code": result[1],
                                "expires_at": result[2].isoformat() + "Z" if result[2] else None,
                                "client_group_name": result[4],
                                "email_sent_to": result[3],
                                "updated_by_user_name": str(result[5]) if result[5] else None
                            })

        elif http_method == 'POST':
            # Handle POST operations
            if '/invitations/redeem/' in path:
                # Redeem invitation: /invitations/redeem/{code}
                code = path_parameters.get('code')
                if not code:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "Invitation code is required"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                with connection.cursor() as cursor:
                    # Update expires_at to now() (effectively expiring the invitation)
                    cursor.execute("""
                        UPDATE invitations 
                        SET expires_at = NOW(), updated_user_id = %s
                        WHERE code = %s AND expires_at > NOW()
                    """, (current_user_id, code))

                    if cursor.rowcount == 0:
                        return {
                            "statusCode": 404,
                            "body": json.dumps({"error": "Invitation not found or already expired"}),
                            "headers": {"Content-Type": "application/json"}
                        }

                    connection.commit()
                    response = {"message": "Invitation redeemed successfully"}
            else:
                # Create new invitation: /invitations
                try:
                    request_data = json.loads(body) if body else {}
                except json.JSONDecodeError:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "Invalid JSON in request body"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                # Validate required fields
                email_sent_to = request_data.get('email_sent_to')
                client_group_name = request_data.get('client_group_name')
                expires_at = request_data.get('expires_at')

                if not email_sent_to:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "email_sent_to is required"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                if not client_group_name:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "client_group_name is required"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                # Get user's client groups for authorization
                user_id = get_user_id_from_sub(connection, current_user_id)
                if not user_id:
                    return {
                        "statusCode": 403,
                        "body": json.dumps({"error": "User not found"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                user_client_groups = get_user_client_groups(
                    connection, user_id)
                if not user_client_groups:
                    return {
                        "statusCode": 403,
                        "body": json.dumps({"error": "User has no client group affiliations"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                with connection.cursor() as cursor:
                    # Get client_group_id from client_group_name and verify user has access
                    cursor.execute("""
                        SELECT client_group_id FROM client_groups 
                        WHERE name = %s AND client_group_id IN ({})
                    """.format(','.join(['%s'] * len(user_client_groups))),
                        [client_group_name] + user_client_groups)
                    client_group_result = cursor.fetchone()

                    if not client_group_result:
                        return {
                            "statusCode": 403,
                            "body": json.dumps({"error": f"Client group '{client_group_name}' not found or access denied"}),
                            "headers": {"Content-Type": "application/json"}
                        }

                    client_group_id = client_group_result[0]

                    # Set default expires_at to 24 hours from now if not provided
                    if not expires_at:
                        expires_at = (datetime.now() +
                                      timedelta(hours=24)).isoformat() + "Z"

                    # Insert new invitation
                    cursor.execute("""
                        INSERT INTO invitations (expires_at, client_group_id, email_sent_to, updated_user_id)
                        VALUES (%s, %s, %s, %s)
                    """, (expires_at, client_group_id, email_sent_to, current_user_id))

                    invitation_id = cursor.lastrowid
                    connection.commit()

                    # Get the created invitation with generated code
                    cursor.execute("""
                        SELECT i.invitation_id, i.code, i.expires_at, i.email_sent_to,
                               cg.name as client_group_name, i.updated_user_id
                        FROM invitations i
                        JOIN client_groups cg ON i.client_group_id = cg.client_group_id
                        WHERE i.invitation_id = %s
                    """, (invitation_id,))
                    result = cursor.fetchone()

                    response = {
                        "invitation_id": result[0],
                        "code": result[1],
                        "expires_at": result[2].isoformat() + "Z" if result[2] else None,
                        "client_group_name": result[4],
                        "email_sent_to": result[3],
                        "updated_by_user_name": str(result[5]) if result[5] else None
                    }

        elif http_method == 'DELETE':
            # Handle DELETE operations: /invitations/{invitation_id}
            if 'invitation_id' not in path_parameters:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "invitation_id is required for deletion"}),
                    "headers": {"Content-Type": "application/json"}
                }

            invitation_id = path_parameters['invitation_id']

            # Get user's client groups for authorization
            user_id = get_user_id_from_sub(connection, current_user_id)
            if not user_id:
                return {
                    "statusCode": 403,
                    "body": json.dumps({"error": "User not found"}),
                    "headers": {"Content-Type": "application/json"}
                }

            user_client_groups = get_user_client_groups(connection, user_id)
            if not user_client_groups:
                return {
                    "statusCode": 403,
                    "body": json.dumps({"error": "User has no client group affiliations"}),
                    "headers": {"Content-Type": "application/json"}
                }

            with connection.cursor() as cursor:
                cursor.execute("""
                    DELETE FROM invitations 
                    WHERE invitation_id = %s AND client_group_id IN ({})
                """.format(','.join(['%s'] * len(user_client_groups))),
                    [invitation_id] + user_client_groups)

                if cursor.rowcount == 0:
                    return {
                        "statusCode": 404,
                        "body": json.dumps({"error": "Invitation not found or access denied"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                connection.commit()
                response = {"message": "Invitation deleted successfully"}

        elif http_method == 'PUT':
            # Handle PUT operations: /invitations/{invitation_id}
            if 'invitation_id' not in path_parameters:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "invitation_id is required for update"}),
                    "headers": {"Content-Type": "application/json"}
                }

            invitation_id = path_parameters['invitation_id']

            # Get user's client groups for authorization
            user_id = get_user_id_from_sub(connection, current_user_id)
            if not user_id:
                return {
                    "statusCode": 403,
                    "body": json.dumps({"error": "User not found"}),
                    "headers": {"Content-Type": "application/json"}
                }

            # Parse request body
            try:
                request_data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "Invalid JSON in request body"}),
                    "headers": {"Content-Type": "application/json"}
                }

            # Check if invitation exists and user has access
            with connection.cursor() as cursor:
                # Get invitation details and check access
                access_query = """
                    SELECT i.invitation_id, cg.name as client_group_name
                    FROM invitations i
                    JOIN client_groups cg ON i.client_group_id = cg.client_group_id
                    JOIN client_group_users cgu ON cg.client_group_id = cgu.client_group_id
                    WHERE i.invitation_id = %s AND cgu.user_id = %s
                """
                cursor.execute(access_query, (invitation_id, user_id))
                result = cursor.fetchone()

                if not result:
                    return {
                        "statusCode": 403,
                        "body": json.dumps({"error": "Invitation not found or access denied"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                # Build update query dynamically based on provided fields
                update_fields = []
                update_values = []

                if 'expires_at' in request_data:
                    try:
                        # Parse the expires_at date
                        expires_at_str = request_data['expires_at']
                        if expires_at_str:
                            # Handle both ISO format and other formats
                            if 'T' in expires_at_str:
                                expires_at = datetime.fromisoformat(
                                    expires_at_str.replace('Z', '+00:00'))
                            else:
                                expires_at = datetime.strptime(
                                    expires_at_str, '%Y-%m-%d %H:%M:%S')
                            update_fields.append("expires_at = %s")
                            update_values.append(expires_at)
                    except (ValueError, TypeError) as e:
                        return {
                            "statusCode": 400,
                            "body": json.dumps({"error": f"Invalid expires_at format: {str(e)}"}),
                            "headers": {"Content-Type": "application/json"}
                        }

                if 'client_group_name' in request_data:
                    # Validate client group exists and user has access
                    client_group_name = request_data['client_group_name']
                    cg_access_query = """
                        SELECT cg.client_group_id 
                        FROM client_groups cg
                        JOIN client_group_users cgu ON cg.client_group_id = cgu.client_group_id
                        WHERE cg.name = %s AND cgu.user_id = %s
                    """
                    cursor.execute(cg_access_query,
                                   (client_group_name, user_id))
                    cg_result = cursor.fetchone()

                    if not cg_result:
                        return {
                            "statusCode": 403,
                            "body": json.dumps({"error": "Client group not found or access denied"}),
                            "headers": {"Content-Type": "application/json"}
                        }

                    update_fields.append("client_group_id = %s")
                    update_values.append(cg_result[0])

                if 'email_sent_to' in request_data:
                    email_sent_to = request_data['email_sent_to']
                    update_fields.append("email_sent_to = %s")
                    update_values.append(email_sent_to)

                if not update_fields:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "No valid fields provided for update"}),
                        "headers": {"Content-Type": "application/json"}
                    }

                # Add updated_user_id
                update_fields.append("updated_user_id = %s")
                update_values.append(user_id)

                # Execute update
                update_query = f"""
                    UPDATE invitations 
                    SET {', '.join(update_fields)}
                    WHERE invitation_id = %s
                """
                update_values.append(invitation_id)

                cursor.execute(update_query, update_values)
                connection.commit()

                response = {"message": "Invitation updated successfully"}

        else:
            # Handle unsupported methods
            return {
                "statusCode": 405,
                "body": json.dumps({"error": f"Method {http_method} not allowed"}),
                "headers": {"Content-Type": "application/json"}
            }

        connection.close()

        # Return appropriate status code based on operation
        status_code = 200
        if http_method == 'POST':
            status_code = 201
        elif http_method == 'PUT':
            status_code = 200
        elif http_method == 'DELETE':
            status_code = 204

        return {
            "statusCode": status_code,
            "body": json.dumps(response),
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
