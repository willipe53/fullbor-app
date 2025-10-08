"""
CORS Helper for Lambda Functions

This module provides helper functions to add CORS headers to Lambda responses.
"""


def get_cors_headers(origin='https://app.fullbor.ai'):
    """
    Get CORS headers for Lambda response.

    Args:
        origin: The allowed origin (default: https://app.fullbor.ai)

    Returns:
        dict: Headers dictionary with CORS settings
    """
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }


def cors_response(status_code, body, origin='https://app.fullbor.ai'):
    """
    Create a Lambda response with CORS headers.

    Args:
        status_code: HTTP status code
        body: Response body (will be JSON encoded if dict/list)
        origin: The allowed origin (default: https://app.fullbor.ai)

    Returns:
        dict: Lambda response with CORS headers
    """
    import json

    if isinstance(body, (dict, list)):
        body = json.dumps(body)

    return {
        'statusCode': status_code,
        'headers': get_cors_headers(origin),
        'body': body
    }
