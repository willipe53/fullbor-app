#!/usr/bin/env python3
"""
Quick API testing script using boto3 and Cognito authentication.
Usage: ./test-api.py <api_url>
Example: ./test-api.py https://api.fullbor.ai/v2/transaction-statuses
"""

import sys
import json
import requests
import boto3
import os
import base64
from dotenv import load_dotenv
from urllib.parse import urlparse


def get_auth_token():
    """Get JWT token from Cognito User Pool."""
    try:
        # Load environment variables
        load_dotenv()

        username = os.getenv('TEST_USERNAME')
        password = os.getenv('TEST_PASSWORD')
        user_pool_id = os.getenv('USER_POOL_ID', 'us-east-2_IJ1C0mWXW')
        client_id = os.getenv('CLIENT_ID', '1lntksiqrqhmjea6obrrrrnmh1')

        if not username or not password:
            print("❌ Error: TEST_USERNAME and TEST_PASSWORD must be set in .env file")
            sys.exit(1)

        # Initialize Cognito client
        cognito = boto3.client('cognito-idp', region_name='us-east-2')

        # Authenticate with Cognito using admin_initiate_auth
        response = cognito.admin_initiate_auth(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters={
                'USERNAME': username,
                'PASSWORD': password
            }
        )

        return response['AuthenticationResult']['IdToken']

    except Exception as e:
        print(f"❌ Authentication failed: {e}")
        sys.exit(1)


def get_user_id_from_token(token):
    """Extract user ID (sub) from JWT token."""
    try:
        # Decode JWT payload
        payload = token.split('.')[1]
        # Add padding if needed
        payload += '=' * (4 - len(payload) % 4)
        decoded = base64.b64decode(payload)
        data = json.loads(decoded)
        return data.get('sub')
    except Exception as e:
        print(f"❌ Failed to extract user ID from token: {e}")
        return None


def test_api_endpoint(url):
    """Test the given API endpoint."""
    try:
        # Get authentication token
        token = get_auth_token()

        # Extract user ID from token
        user_id = get_user_id_from_token(token)
        if not user_id:
            print("❌ Could not extract user ID from token")
            sys.exit(1)

        # Parse URL to determine method
        parsed_url = urlparse(url)
        path = parsed_url.path

        # Determine HTTP method based on path
        if 'position-keeper' in path:
            method = 'POST'
            data = {"command": "start"}
        else:
            method = 'GET'
            data = None

        # Prepare headers
        headers = {
            'Authorization': f'Bearer {token}',
            'X-Current-User-Id': user_id,
            'Content-Type': 'application/json'
        }

        # Make the request
        print(f"🔍 Testing {method} {url}")
        print(
            f"📋 Headers: {json.dumps({k: v for k, v in headers.items() if k != 'Authorization'}, indent=2)}")

        if method == 'POST' and data:
            print(f"📤 Request Body: {json.dumps(data, indent=2)}")
            response = requests.post(
                url, headers=headers, json=data, timeout=30)
        else:
            response = requests.get(url, headers=headers, timeout=30)

        # Print results
        print(f"\n📊 Response Status: {response.status_code}")
        print(f"⏱️  Response Time: {response.elapsed.total_seconds():.2f}s")

        # Try to parse JSON response
        try:
            response_json = response.json()
            print(f"\n📄 Response Body:")
            print(json.dumps(response_json, indent=2))
        except json.JSONDecodeError:
            print(f"\n📄 Response Body (raw):")
            print(response.text)

        # Print headers if there are any interesting ones
        interesting_headers = ['content-type',
                               'content-length', 'x-amzn-requestid']
        response_headers = {k: v for k, v in response.headers.items()
                            if k.lower() in interesting_headers}
        if response_headers:
            print(f"\n📋 Response Headers:")
            print(json.dumps(response_headers, indent=2))

        # Success/failure indicator
        if 200 <= response.status_code < 300:
            print(f"\n✅ Success!")
        else:
            print(f"\n❌ Error!")

    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)


def main():
    """Main function."""
    if len(sys.argv) != 2:
        print("Usage: ./test-api.py <api_url>")
        print("Example: ./test-api.py https://api.fullbor.ai/v2/transaction-statuses")
        sys.exit(1)

    url = sys.argv[1]

    # Validate URL
    if not url.startswith(('http://', 'https://')):
        print("❌ Error: URL must start with http:// or https://")
        sys.exit(1)

    test_api_endpoint(url)


if __name__ == "__main__":
    main()
