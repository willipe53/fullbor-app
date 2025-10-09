"""
CORS helper module for Lambda functions.
Provides consistent CORS headers across all API endpoints.
"""


def get_cors_headers():
    """
    Get standard CORS headers for API responses.

    Returns:
        dict: CORS headers including Access-Control-Allow-Origin, 
              Access-Control-Allow-Headers, and Access-Control-Allow-Methods
    """
    return {
        'Access-Control-Allow-Origin': 'https://app.fullbor.ai',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }

