
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


def get_valid_portfolio_entity_ids_for_current_user(connection, current_user_id):
    """
    Get all portfolio entity IDs that the current user is authorized to view/modify.
    This includes all portfolio entities in the same client groups as the current user.
    Returns a list of portfolio_entity_ids.
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

        # Get all portfolio entity IDs that are in any of the current user's client groups
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT DISTINCT entity_id 
                FROM client_group_entities 
                WHERE client_group_id IN ({})
            """.format(','.join(['%s'] * len(user_client_groups))),
                user_client_groups)
            results = cursor.fetchall()
            return [row[0] for row in results]
    except Exception as e:
        print(f"Error getting valid portfolio entity IDs: {e}")
        return []


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


def get_entity_name_by_id(connection, entity_id):
    """Get entity_name from entity_id."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT name FROM entities WHERE entity_id = %s", (entity_id,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting entity name by ID: {e}")
        return None


def get_transaction_type_id_by_name(connection, transaction_type_name):
    """Get transaction_type_id from transaction_type_name."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT transaction_type_id FROM transaction_types WHERE name = %s", (transaction_type_name,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting transaction type ID by name: {e}")
        return None


def get_transaction_status_id_by_name(connection, transaction_status_name):
    """Get transaction_status_id from transaction_status_name."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT transaction_status_id FROM transaction_statuses WHERE name = %s", (transaction_status_name,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting transaction status ID by name: {e}")
        return None


def get_transaction_type_name_by_id(connection, transaction_type_id):
    """Get transaction_type_name from transaction_type_id."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT name FROM transaction_types WHERE transaction_type_id = %s", (transaction_type_id,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting transaction type name by ID: {e}")
        return None


def get_transaction_status_name_by_id(connection, transaction_status_id):
    """Get transaction_status_name from transaction_status_id."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT name FROM transaction_statuses WHERE transaction_status_id = %s", (transaction_status_id,))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting transaction status name by ID: {e}")
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


def lambda_handler(event, context):
    """
    Handle transaction operations for V2 API.
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

        # Get valid portfolio entity IDs for authorization
        valid_portfolio_entity_ids = get_valid_portfolio_entity_ids_for_current_user(
            connection, current_user_id)
        if not valid_portfolio_entity_ids:
            return {
                "statusCode": 403,
                "body": json.dumps({"error": "User has no client group affiliations or access denied"}),
                "headers": {"Content-Type": "application/json"}
            }

        # Handle different operations based on HTTP method and path
        response = handle_transaction_operations(
            connection, http_method, path, path_parameters,
            query_parameters, body, current_user_id, valid_portfolio_entity_ids
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


def handle_transaction_operations(connection, http_method, path, path_parameters, query_parameters, body, current_user_id, valid_portfolio_entity_ids):
    """Handle all transaction operations based on HTTP method and path."""

    if http_method == 'GET':
        return handle_get_operations(connection, path, path_parameters, query_parameters, valid_portfolio_entity_ids)
    elif http_method == 'POST':
        return handle_post_operations(connection, path, path_parameters, body, current_user_id, valid_portfolio_entity_ids)
    elif http_method == 'PUT':
        return handle_put_operations(connection, path, path_parameters, body, current_user_id, valid_portfolio_entity_ids)
    elif http_method == 'DELETE':
        return handle_delete_operations(connection, path, path_parameters, current_user_id, valid_portfolio_entity_ids)
    else:
        return {"error": f"Method {http_method} not allowed for transactions"}


def handle_get_operations(connection, path, path_parameters, query_parameters, valid_portfolio_entity_ids):
    """Handle GET operations."""
    if 'transaction_id' in path_parameters:
        # Get single transaction by ID: /transactions/{transaction_id}
        transaction_id = path_parameters['transaction_id']

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT t.transaction_id, t.portfolio_entity_id, t.contra_entity_id, t.instrument_entity_id,
                       t.properties, t.transaction_status_id, t.transaction_type_id, t.update_date, t.updated_user_id,
                       pe.name as portfolio_entity_name, ce.name as contra_entity_name, ie.name as instrument_entity_name,
                       ts.name as transaction_status_name, tt.name as transaction_type_name
                FROM transactions t
                LEFT JOIN entities pe ON t.portfolio_entity_id = pe.entity_id
                LEFT JOIN entities ce ON t.contra_entity_id = ce.entity_id
                LEFT JOIN entities ie ON t.instrument_entity_id = ie.entity_id
                LEFT JOIN transaction_statuses ts ON t.transaction_status_id = ts.transaction_status_id
                LEFT JOIN transaction_types tt ON t.transaction_type_id = tt.transaction_type_id
                WHERE t.transaction_id = %s AND t.portfolio_entity_id IN ({})
            """.format(','.join(['%s'] * len(valid_portfolio_entity_ids))),
                [transaction_id] + valid_portfolio_entity_ids)
            result = cursor.fetchone()

            if not result:
                return {"error": "Transaction not found or access denied"}

            # Map database fields to OpenAPI schema
            properties = json.loads(result[4]) if result[4] else {}
            updated_by_user_name = get_user_name_by_id(
                connection, result[8]) if result[8] else None

            return {
                "transaction_id": result[0],
                "portfolio_entity_name": result[9],
                "contra_entity_name": result[10],
                "instrument_entity_name": result[11],
                "transaction_status_name": result[12],
                "transaction_type_name": result[13],
                "properties": properties,
                "update_date": result[7].isoformat() + "Z" if result[7] else None,
                "updated_by_user_name": updated_by_user_name
            }
    else:
        # List all transactions: /transactions
        return handle_list_transactions(connection, query_parameters, valid_portfolio_entity_ids)


def handle_list_transactions(connection, query_parameters, valid_portfolio_entity_ids):
    """Handle listing transactions with optional filters and pagination."""
    # Apply query filters
    portfolio_entity_name_filter = query_parameters.get(
        'portfolio_entity_name')
    contra_entity_name_filter = query_parameters.get('contra_entity_name')
    instrument_entity_name_filter = query_parameters.get(
        'instrument_entity_name')
    transaction_status_name_filter = query_parameters.get(
        'transaction_status_name')
    transaction_type_name_filter = query_parameters.get(
        'transaction_type_name')
    count_only = query_parameters.get('count', 'false').lower() == 'true'
    limit = int(query_parameters.get('limit', 100))
    offset = int(query_parameters.get('offset', 0))

    # Build base query
    base_query = """
        FROM transactions t
        LEFT JOIN entities pe ON t.portfolio_entity_id = pe.entity_id
        LEFT JOIN entities ce ON t.contra_entity_id = ce.entity_id
        LEFT JOIN entities ie ON t.instrument_entity_id = ie.entity_id
        LEFT JOIN transaction_statuses ts ON t.transaction_status_id = ts.transaction_status_id
        LEFT JOIN transaction_types tt ON t.transaction_type_id = tt.transaction_type_id
        WHERE t.portfolio_entity_id IN ({})
    """.format(','.join(['%s'] * len(valid_portfolio_entity_ids)))

    params = valid_portfolio_entity_ids.copy()

    # Add filters
    if portfolio_entity_name_filter:
        base_query += " AND pe.name = %s"
        params.append(portfolio_entity_name_filter)

    if contra_entity_name_filter:
        base_query += " AND ce.name = %s"
        params.append(contra_entity_name_filter)

    if instrument_entity_name_filter:
        base_query += " AND ie.name = %s"
        params.append(instrument_entity_name_filter)

    if transaction_status_name_filter:
        base_query += " AND ts.name = %s"
        params.append(transaction_status_name_filter)

    if transaction_type_name_filter:
        base_query += " AND tt.name = %s"
        params.append(transaction_type_name_filter)

    if count_only:
        # Return count only
        count_query = f"SELECT COUNT(*) as count {base_query}"
        with connection.cursor() as cursor:
            cursor.execute(count_query, params)
            result = cursor.fetchone()
            return {"count": result[0]}

    # Get transactions with pagination
    query = f"""
        SELECT t.transaction_id, t.portfolio_entity_id, t.contra_entity_id, t.instrument_entity_id,
               t.properties, t.transaction_status_id, t.transaction_type_id, t.update_date, t.updated_user_id,
               pe.name as portfolio_entity_name, ce.name as contra_entity_name, ie.name as instrument_entity_name,
               ts.name as transaction_status_name, tt.name as transaction_type_name
        {base_query}
        ORDER BY t.transaction_id DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])

    with connection.cursor() as cursor:
        cursor.execute(query, params)
        results = cursor.fetchall()

        # Get total count for pagination
        count_query = f"SELECT COUNT(*) as count {base_query}"
        cursor.execute(count_query, valid_portfolio_entity_ids +
                       params[len(valid_portfolio_entity_ids):-2])
        count_result = cursor.fetchone()
        total_count = count_result[0]

        data = []
        for result in results:
            # Map database fields to OpenAPI schema
            properties = json.loads(result[4]) if result[4] else {}
            updated_by_user_name = get_user_name_by_id(
                connection, result[8]) if result[8] else None

            data.append({
                "transaction_id": result[0],
                "portfolio_entity_name": result[9],
                "contra_entity_name": result[10],
                "instrument_entity_name": result[11],
                "transaction_status_name": result[12],
                "transaction_type_name": result[13],
                "properties": properties,
                "update_date": result[7].isoformat() + "Z" if result[7] else None,
                "updated_by_user_name": updated_by_user_name
            })

        return {
            "data": data,
            "count": total_count,
            "limit": limit,
            "offset": offset
        }


def handle_post_operations(connection, path, path_parameters, body, current_user_id, valid_portfolio_entity_ids):
    """Handle POST operations."""
    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in request body"}

    # Validate required fields
    portfolio_entity_name = request_data.get('portfolio_entity_name')
    transaction_status_name = request_data.get('transaction_status_name')
    transaction_type_name = request_data.get('transaction_type_name')

    if not portfolio_entity_name or not transaction_status_name or not transaction_type_name:
        return {"error": "portfolio_entity_name, transaction_status_name, and transaction_type_name are required"}

    # Get user ID for tracking
    user_id = get_user_id_from_sub(connection, current_user_id)

    # Get entity IDs
    portfolio_entity_id = get_entity_id_by_name(
        connection, portfolio_entity_name)
    if not portfolio_entity_id:
        return {"error": f"Portfolio entity '{portfolio_entity_name}' not found"}

    # Check if user has access to this portfolio
    if portfolio_entity_id not in valid_portfolio_entity_ids:
        return {"error": "Access denied - cannot create transactions for this portfolio"}

    contra_entity_id = None
    contra_entity_name = request_data.get('contra_entity_name')
    if contra_entity_name:
        contra_entity_id = get_entity_id_by_name(
            connection, contra_entity_name)
        if not contra_entity_id:
            return {"error": f"Contra entity '{contra_entity_name}' not found"}

    instrument_entity_id = None
    instrument_entity_name = request_data.get('instrument_entity_name')
    if instrument_entity_name:
        instrument_entity_id = get_entity_id_by_name(
            connection, instrument_entity_name)
        if not instrument_entity_id:
            return {"error": f"Instrument entity '{instrument_entity_name}' not found"}

    # Get transaction type and status IDs
    transaction_type_id = get_transaction_type_id_by_name(
        connection, transaction_type_name)
    if not transaction_type_id:
        return {"error": f"Transaction type '{transaction_type_name}' not found"}

    transaction_status_id = get_transaction_status_id_by_name(
        connection, transaction_status_name)
    if not transaction_status_id:
        return {"error": f"Transaction status '{transaction_status_name}' not found"}

    # Extract properties from request
    properties = request_data.get('properties', {})
    properties_json = json.dumps(properties) if properties else None

    with connection.cursor() as cursor:
        # Insert new transaction
        cursor.execute("""
            INSERT INTO transactions (portfolio_entity_id, contra_entity_id, instrument_entity_id, 
                                    properties, transaction_status_id, transaction_type_id, updated_user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (portfolio_entity_id, contra_entity_id, instrument_entity_id, properties_json,
              transaction_status_id, transaction_type_id, user_id))

        new_transaction_id = cursor.lastrowid
        connection.commit()

        return {"message": "Transaction created successfully", "transaction_id": new_transaction_id}


def handle_put_operations(connection, path, path_parameters, body, current_user_id, valid_portfolio_entity_ids):
    """Handle PUT operations."""
    if 'transaction_id' not in path_parameters:
        return {"error": "transaction_id is required in path"}

    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in request body"}

    transaction_id = path_parameters['transaction_id']

    # Get user ID for tracking
    user_id = get_user_id_from_sub(connection, current_user_id)

    with connection.cursor() as cursor:
        # Check if transaction exists and current user can modify it
        cursor.execute("""
            SELECT portfolio_entity_id FROM transactions 
            WHERE transaction_id = %s AND portfolio_entity_id IN ({})
        """.format(','.join(['%s'] * len(valid_portfolio_entity_ids))),
            [transaction_id] + valid_portfolio_entity_ids)
        existing = cursor.fetchone()

        if not existing:
            return {"error": "Transaction not found or access denied"}

        # Update transaction (only update provided fields)
        update_fields = []
        update_params = []

        # Handle portfolio entity
        portfolio_entity_name = request_data.get('portfolio_entity_name')
        if portfolio_entity_name:
            portfolio_entity_id = get_entity_id_by_name(
                connection, portfolio_entity_name)
            if not portfolio_entity_id:
                return {"error": f"Portfolio entity '{portfolio_entity_name}' not found"}
            if portfolio_entity_id not in valid_portfolio_entity_ids:
                return {"error": "Access denied - cannot move transaction to this portfolio"}
            update_fields.append("portfolio_entity_id = %s")
            update_params.append(portfolio_entity_id)

        # Handle contra entity
        contra_entity_name = request_data.get('contra_entity_name')
        if contra_entity_name is not None:
            if contra_entity_name:
                contra_entity_id = get_entity_id_by_name(
                    connection, contra_entity_name)
                if not contra_entity_id:
                    return {"error": f"Contra entity '{contra_entity_name}' not found"}
                update_fields.append("contra_entity_id = %s")
                update_params.append(contra_entity_id)
            else:
                update_fields.append("contra_entity_id = NULL")

        # Handle instrument entity
        instrument_entity_name = request_data.get('instrument_entity_name')
        if instrument_entity_name is not None:
            if instrument_entity_name:
                instrument_entity_id = get_entity_id_by_name(
                    connection, instrument_entity_name)
                if not instrument_entity_id:
                    return {"error": f"Instrument entity '{instrument_entity_name}' not found"}
                update_fields.append("instrument_entity_id = %s")
                update_params.append(instrument_entity_id)
            else:
                update_fields.append("instrument_entity_id = NULL")

        # Handle transaction type
        transaction_type_name = request_data.get('transaction_type_name')
        if transaction_type_name:
            transaction_type_id = get_transaction_type_id_by_name(
                connection, transaction_type_name)
            if not transaction_type_id:
                return {"error": f"Transaction type '{transaction_type_name}' not found"}
            update_fields.append("transaction_type_id = %s")
            update_params.append(transaction_type_id)

        # Handle transaction status
        transaction_status_name = request_data.get('transaction_status_name')
        if transaction_status_name:
            transaction_status_id = get_transaction_status_id_by_name(
                connection, transaction_status_name)
            if not transaction_status_id:
                return {"error": f"Transaction status '{transaction_status_name}' not found"}
            update_fields.append("transaction_status_id = %s")
            update_params.append(transaction_status_id)

        # Handle properties
        properties = request_data.get('properties')
        if properties is not None:
            properties_json = json.dumps(properties) if properties else None
            update_fields.append("properties = %s")
            update_params.append(properties_json)

        if user_id is not None:
            update_fields.append("updated_user_id = %s")
            update_params.append(user_id)

        update_fields.append("update_date = NOW()")

        if update_fields:
            update_params.append(transaction_id)
            cursor.execute(f"""
                UPDATE transactions 
                SET {', '.join(update_fields)}
                WHERE transaction_id = %s
            """, update_params)

        connection.commit()
        return {"message": "Transaction updated successfully"}


def handle_delete_operations(connection, path, path_parameters, current_user_id, valid_portfolio_entity_ids):
    """Handle DELETE operations."""
    if 'transaction_id' not in path_parameters:
        return {"error": "transaction_id is required in path"}

    transaction_id = path_parameters['transaction_id']

    with connection.cursor() as cursor:
        # Check if transaction exists and current user can modify it
        cursor.execute("""
            SELECT portfolio_entity_id FROM transactions 
            WHERE transaction_id = %s AND portfolio_entity_id IN ({})
        """.format(','.join(['%s'] * len(valid_portfolio_entity_ids))),
            [transaction_id] + valid_portfolio_entity_ids)
        existing = cursor.fetchone()

        if not existing:
            return {"error": "Transaction not found or access denied"}

        # Delete transaction
        cursor.execute(
            "DELETE FROM transactions WHERE transaction_id = %s", (transaction_id,))
        connection.commit()
        return {"message": "Transaction deleted successfully"}
