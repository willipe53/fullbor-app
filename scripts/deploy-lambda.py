#!/usr/bin/env python3
"""
AWS Lambda Deployment Script with OpenAPI Compliance Validation and API Testing

This script deploys Lambda functions to AWS, validates them against
the OpenAPI documentation, and tests the deployed API endpoints.

Usage: python deploy-lambda.py <lambda_file.py>
Example: python deploy-lambda.py ClientGroupsHandler.py
"""

import sys
import os
import json
import zipfile
import tempfile
import argparse
import logging
import time
from pathlib import Path
from typing import Dict, List, Any, Optional

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
import requests
from dotenv import load_dotenv


# Configuration constants
REGION = "us-east-2"
ACCOUNT_ID = "316490106381"
ROLE_NAME = "FullBorLambdaAPIRole"
LAYER_ARNS = ["arn:aws:lambda:us-east-2:316490106381:layer:PyMySql112Layer:2"]
TIMEOUT = 30
VPC_SUBNETS = [
    "subnet-0192ac9f05f3f701c",
    "subnet-057c823728ef78117",
    "subnet-0dc1aed15b037a940",
]
VPC_SECURITY_GROUPS = ["sg-0a5a4038d1f4307f2"]
ENV_VARS = {
    "SECRET_ARN": "arn:aws:secretsmanager:us-east-2:316490106381:secret:PandaDbSecretCache-pdzjei"
}
REST_API_ID = "nkdrongg4e"  # Updated to new V2 API Gateway
AUTH_TYPE = "COGNITO_USER_POOLS"
AUTHORIZER_ID = "1v90ju"
STAGE_NAME = "test"  # Updated to match the deployed stage

# Note: We'll deploy to the actual function names that match our handler files
# If API Gateway uses different names, we'll need to update the API Gateway configuration

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class APITester:
    """Handles API testing with authentication."""

    def __init__(self, username: str, password: str, api_base_url: str):
        """Initialize API tester with credentials."""
        self.username = username
        self.password = password
        self.api_base_url = api_base_url.rstrip('/')
        self.session = requests.Session()
        self.auth_token = None

    def authenticate(self) -> bool:
        """Authenticate with Cognito User Pool and get auth token."""
        try:
            logger.info("Authenticating with Cognito User Pool...")

            # Use Cognito directly for authentication
            import boto3
            cognito_client = boto3.client(
                'cognito-idp', region_name='us-east-2')

            # Get client ID from environment
            client_id = os.getenv('CLIENT_ID', '1lntksiqrqhmjea6obrrrrnmh1')

            try:
                # Try ADMIN_NO_SRP_AUTH flow first (more common for server-side auth)
                try:
                    response = cognito_client.admin_initiate_auth(
                        UserPoolId=os.getenv(
                            'USER_POOL_ID', 'us-east-2_IJ1C0mWXW'),
                        ClientId=client_id,
                        AuthFlow='ADMIN_NO_SRP_AUTH',
                        AuthParameters={
                            'USERNAME': self.username,
                            'PASSWORD': self.password
                        }
                    )
                except Exception:
                    # Fallback to USER_PASSWORD_AUTH if ADMIN_NO_SRP_AUTH fails
                    response = cognito_client.initiate_auth(
                        ClientId=client_id,
                        AuthFlow='USER_PASSWORD_AUTH',
                        AuthParameters={
                            'USERNAME': self.username,
                            'PASSWORD': self.password
                        }
                    )

                # Extract the ID token (preferred for API Gateway)
                auth_result = response.get('AuthenticationResult', {})
                self.auth_token = auth_result.get(
                    'IdToken') or auth_result.get('AccessToken')

                if self.auth_token:
                    # Set authorization header for future requests
                    self.session.headers.update({
                        'Authorization': f'Bearer {self.auth_token}'
                    })
                    logger.info("Successfully authenticated with Cognito")
                    return True
                else:
                    logger.error("No access token received from Cognito")
                    return False

            except cognito_client.exceptions.NotAuthorizedException as e:
                logger.error(
                    f"Cognito authentication failed: Invalid credentials")
                return False
            except cognito_client.exceptions.UserNotFoundException as e:
                logger.error(f"Cognito authentication failed: User not found")
                return False
            except Exception as e:
                logger.error(f"Cognito authentication error: {e}")
                return False

        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False

    def test_endpoint(self, endpoint: str, method: str = 'GET', data: Optional[Dict] = None) -> Dict[str, Any]:
        """Test a specific API endpoint."""
        url = f"{self.api_base_url}{endpoint}"

        try:
            logger.info(f"Testing {method} {endpoint}")

            if method.upper() == 'GET':
                response = self.session.get(url)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            result = {
                'endpoint': endpoint,
                'method': method,
                'status_code': response.status_code,
                'success': 200 <= response.status_code < 300,
                'response_time': response.elapsed.total_seconds(),
                'headers': dict(response.headers)
            }

            try:
                result['response_body'] = response.json()
            except:
                result['response_body'] = response.text

            if result['success']:
                logger.info(
                    f"✅ {method} {endpoint} - {response.status_code} ({result['response_time']:.2f}s)")
            else:
                logger.warning(
                    f"❌ {method} {endpoint} - {response.status_code}")
                # Log detailed error information for debugging
                logger.warning(f"   Response body: {result['response_body']}")
                if response.status_code >= 500:
                    logger.warning(
                        f"   This appears to be a Lambda function error (5xx)")
                elif response.status_code == 401:
                    logger.warning(
                        f"   This appears to be an authentication error")
                elif response.status_code == 403:
                    logger.warning(
                        f"   This appears to be an authorization error")

            return result

        except Exception as e:
            logger.error(f"Error testing {method} {endpoint}: {e}")
            return {
                'endpoint': endpoint,
                'method': method,
                'status_code': 0,
                'success': False,
                'error': str(e),
                'response_time': 0
            }

    def test_lambda_endpoints(self, lambda_name: str, openapi_spec: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Test endpoints related to a specific Lambda function."""
        logger.info(f"Testing endpoints for Lambda: {lambda_name}")

        # Map Lambda functions to their corresponding API Gateway endpoints
        endpoint_mapping = {
            'ClientGroupsHandler': [
                'client-groups',
                'client-groups/{client_group_name}',
                'client-groups/{client_group_name}/users:set'
            ],
            'UsersHandler': [
                'users',
                'users/{user_name}',
                'users/{user_name}/client-groups:set'
            ],
            'EntitiesHandler': [
                'entities',
                'entities/{entity_name}',
                'client-groups/{client_group_name}/entities:set'
            ],
            'TransactionsHandler': [
                'transactions',
                'transactions/{transaction_id}'
            ],
            'EntityTypesHandler': [
                'entity-types',
                'entity-types/{entity_type_name}'
            ],
            'TransactionTypesHandler': [
                'transaction-types',
                'transaction-types/{transaction_type_name}'
            ],
            'TransactionStatusesHandler': [
                'transaction-statuses'
            ],
            'InvitationsHandler': [
                'invitations',
                'invitations/{invitation_id}',
                'client-groups/{client_group_name}/invitations',
                'invitations/redeem/{code}'
            ],
            'PositionKeeper': [
                'position-keeper'
            ]
        }

        # Get the endpoints for this specific Lambda
        lambda_endpoints = endpoint_mapping.get(lambda_name, [])
        if not lambda_endpoints:
            logger.warning(f"No endpoint mapping found for {lambda_name}")
            return []

        # Extract relevant endpoints from OpenAPI spec
        paths = openapi_spec.get('paths', {})
        test_results = []

        for path, path_item in paths.items():
            # Remove leading slash for comparison
            path_key = path.lstrip('/')

            # Check if this path belongs to our Lambda
            if path_key in lambda_endpoints:
                for method, operation in path_item.items():
                    if method.lower() in ['get', 'post', 'put', 'delete', 'patch']:
                        # Generate appropriate test data based on the endpoint
                        test_data = None
                        if method.upper() in ['POST', 'PUT', 'PATCH']:
                            test_data = self.generate_test_data(
                                path, method.upper(), operation)

                        # Test the endpoint
                        result = self.test_endpoint(
                            path, method.upper(), test_data)
                        test_results.append(result)

        return test_results

    def generate_test_data(self, path: str, method: str, operation: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate appropriate test data for the endpoint."""
        # Special handling for PositionKeeper endpoint
        if 'position-keeper' in path.lower():
            return {"command": "start"}

        # For other endpoints, generate basic test data
        request_body = operation.get('requestBody', {})
        if not request_body:
            return None

        content = request_body.get('content', {})
        json_schema = content.get('application/json', {}).get('schema', {})

        if not json_schema:
            return None

        # Generate basic test data based on schema
        test_data = {}
        properties = json_schema.get('properties', {})

        for prop_name, prop_schema in properties.items():
            prop_type = prop_schema.get('type', 'string')

            if prop_type == 'string':
                test_data[prop_name] = f"test_{prop_name}"
            elif prop_type == 'integer':
                test_data[prop_name] = 1
            elif prop_type == 'boolean':
                test_data[prop_name] = True
            elif prop_type == 'array':
                test_data[prop_name] = []
            elif prop_type == 'object':
                test_data[prop_name] = {}

        return test_data


class LambdaDeployer:
    """Handles Lambda deployment, OpenAPI validation, and API testing."""

    def __init__(self):
        """Initialize AWS clients and configuration."""
        self.region = REGION
        self.account_id = ACCOUNT_ID
        self.role_name = ROLE_NAME
        self.rest_api_id = REST_API_ID
        self.stage_name = STAGE_NAME

        # Initialize AWS clients
        try:
            self.lambda_client = boto3.client(
                'lambda', region_name=self.region)
            self.iam_client = boto3.client('iam', region_name=self.region)
            self.apigateway_client = boto3.client(
                'apigateway', region_name=self.region)
            self.sts_client = boto3.client('sts', region_name=self.region)
        except NoCredentialsError:
            logger.error(
                "AWS credentials not found. Please configure your AWS credentials.")
            sys.exit(1)

    def get_role_arn(self) -> str:
        """Get the IAM role ARN for Lambda execution."""
        try:
            response = self.iam_client.get_role(RoleName=self.role_name)
            return response['Role']['Arn']
        except ClientError as e:
            logger.error(f"Failed to get IAM role {self.role_name}: {e}")
            raise

    def create_zip_package(self, lambda_file_path: str) -> bytes:
        """Create a zip package for the Lambda function."""
        lambda_path = Path(lambda_file_path)

        if not lambda_path.exists():
            raise FileNotFoundError(
                f"Lambda file not found: {lambda_file_path}")

        # Create temporary zip file
        with tempfile.NamedTemporaryFile() as temp_file:
            with zipfile.ZipFile(temp_file.name, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                # Add the lambda function file
                zip_file.write(lambda_path, lambda_path.name)

            # Read the zip content
            temp_file.seek(0)
            return temp_file.read()

    def get_openapi_spec(self) -> Dict[str, Any]:
        """Fetch OpenAPI specification from local YAML file."""
        try:
            import yaml
            # Use local YAML file instead of API Gateway export
            script_dir = Path(__file__).parent
            project_root = script_dir.parent
            spec_path = project_root / 'api-config' / 'openapi.yaml'

            if not spec_path.exists():
                raise FileNotFoundError(
                    f"OpenAPI spec not found at: {spec_path}")

            with open(spec_path, 'r') as f:
                return yaml.safe_load(f)
        except Exception as e:
            logger.error(f"Failed to load OpenAPI spec: {e}")
            raise

    def get_api_base_url(self) -> str:
        """Get the API Gateway base URL."""
        try:
            response = self.apigateway_client.get_rest_api(
                restApiId=self.rest_api_id)
            api_name = response['name']

            # Construct the API URL
            base_url = f"https://{self.rest_api_id}.execute-api.{self.region}.amazonaws.com/{self.stage_name}"
            logger.info(f"API Base URL: {base_url}")
            return base_url

        except ClientError as e:
            logger.error(f"Failed to get API base URL: {e}")
            raise

    def validate_lambda_compliance(self, lambda_file_path: str, openapi_spec: Dict[str, Any]) -> bool:
        """Validate Lambda function compliance with OpenAPI specification."""
        lambda_name = Path(lambda_file_path).stem

        logger.info(
            f"Validating {lambda_name} against OpenAPI specification...")

        # Extract paths and methods from OpenAPI spec
        paths = openapi_spec.get('paths', {})

        # Map Lambda functions to their corresponding API Gateway endpoints
        endpoint_mapping = {
            'ClientGroupsHandler': [
                'client-groups',
                'client-groups/{client_group_name}',
                'client-groups/{client_group_name}/users:set'
            ],
            'UsersHandler': [
                'users',
                'users/{user_name}',
                'users/{user_name}/client-groups:set'
            ],
            'EntitiesHandler': [
                'entities',
                'entities/{entity_name}',
                'client-groups/{client_group_name}/entities:set'
            ],
            'TransactionsHandler': [
                'transactions',
                'transactions/{transaction_id}'
            ],
            'EntityTypesHandler': [
                'entity-types',
                'entity-types/{entity_type_name}'
            ],
            'TransactionTypesHandler': [
                'transaction-types',
                'transaction-types/{transaction_type_name}'
            ],
            'TransactionStatusesHandler': [
                'transaction-statuses'
            ],
            'InvitationsHandler': [
                'invitations',
                'invitations/{invitation_id}',
                'client-groups/{client_group_name}/invitations',
                'invitations/redeem/{code}'
            ],
            'PositionKeeper': [
                'position-keeper'
            ]
        }

        # Get expected endpoints for this Lambda function
        expected_endpoints = endpoint_mapping.get(lambda_name, [])

        if not expected_endpoints:
            logger.warning(f"No endpoint mapping found for {lambda_name}")
            return True

        logger.info(
            f"Expected endpoints for {lambda_name}: {expected_endpoints}")

        # Find actual endpoints in OpenAPI spec
        lambda_endpoints = []
        found_endpoints = []

        for path, path_item in paths.items():
            for method, operation in path_item.items():
                if method.lower() in ['get', 'post', 'put', 'delete', 'patch']:
                    # Check if this operation corresponds to our lambda
                    operation_id = operation.get('operationId', '')
                    path_part = path.strip('/')

                    if path_part in expected_endpoints:
                        lambda_endpoints.append({
                            'path': path,
                            'method': method.upper(),
                            'operation': operation,
                            'operation_id': operation_id
                        })
                        found_endpoints.append(path_part)

        # Check compliance
        compliance_issues = []

        # Check if all expected endpoints are found
        missing_endpoints = set(expected_endpoints) - set(found_endpoints)
        if missing_endpoints:
            compliance_issues.append(f"Missing endpoints: {missing_endpoints}")

        # Validate each found endpoint
        for endpoint in lambda_endpoints:
            operation = endpoint['operation']
            responses = operation.get('responses', {})

            # Check required response codes
            required_codes = []
            if endpoint['method'] == 'GET':
                required_codes = ['200']  # GET should return 200
            elif endpoint['method'] == 'POST':
                required_codes = ['201']  # POST should return 201
            elif endpoint['method'] in ['PUT', 'PATCH']:
                required_codes = ['200']  # PUT/PATCH should return 200
            elif endpoint['method'] == 'DELETE':
                required_codes = ['204']  # DELETE should return 204

            # Add common error responses for all methods
            required_codes.extend(['400', '401', '403'])

            missing_codes = []
            for code in required_codes:
                if code not in responses:
                    missing_codes.append(code)

            if missing_codes:
                compliance_issues.append(
                    f"Endpoint {endpoint['path']} missing response codes: {missing_codes}")

            # Validate 200 response structure
            if '200' in responses:
                response_200 = responses['200']
                content = response_200.get('content', {})

                if 'application/json' not in content:
                    compliance_issues.append(
                        f"Endpoint {endpoint['path']} 200 response should have application/json content type")
                else:
                    schema = content['application/json'].get('schema', {})
                    if not schema:
                        compliance_issues.append(
                            f"Endpoint {endpoint['path']} 200 response missing JSON schema")

            # Check for proper error responses
            error_responses = ['400', '401', '403', '500']
            for error_code in error_responses:
                if error_code in responses:
                    error_response = responses[error_code]
                    if 'description' not in error_response:
                        compliance_issues.append(
                            f"Endpoint {endpoint['path']} {error_code} response missing description")

        # Log results
        if compliance_issues:
            logger.warning(
                f"OpenAPI compliance issues found for {lambda_name}:")
            for issue in compliance_issues:
                logger.warning(f"  - {issue}")
            return False
        else:
            logger.info(
                f"✅ {lambda_name} is compliant with OpenAPI specification")
            logger.info(
                f"   Found {len(lambda_endpoints)} endpoints: {found_endpoints}")
            return True

    def check_permissions(self, function_name: str) -> bool:
        """Check if Lambda has necessary permissions."""
        logger.info(f"Checking permissions for {function_name}...")

        try:
            # Check if function exists
            self.lambda_client.get_function(FunctionName=function_name)
            logger.info("Basic permission checks passed")
            return True

        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                logger.info(
                    f"Function {function_name} does not exist yet - will be created")
                return True
            else:
                logger.error(f"Permission check failed: {e}")
                return False

    def wait_for_function_ready(self, function_name: str, max_wait_time: int = 300) -> bool:
        """Wait for Lambda function to be ready for updates."""
        logger.info(f"Waiting for function {function_name} to be ready...")

        start_time = time.time()
        while time.time() - start_time < max_wait_time:
            try:
                response = self.lambda_client.get_function(
                    FunctionName=function_name)
                state = response['Configuration']['State']

                if state == 'Active':
                    logger.info(f"Function {function_name} is ready")
                    return True
                elif state == 'Pending':
                    logger.info(
                        f"Function {function_name} is still pending, waiting...")
                    time.sleep(5)
                else:
                    logger.warning(
                        f"Function {function_name} is in state: {state}")
                    time.sleep(5)

            except ClientError as e:
                if e.response['Error']['Code'] == 'ResourceConflictException':
                    logger.info("Function is being updated, waiting...")
                    time.sleep(5)
                else:
                    logger.error(f"Error checking function state: {e}")
                    return False

        logger.error(
            f"Function {function_name} did not become ready within {max_wait_time} seconds")
        return False

    def deploy_lambda(self, lambda_file_path: str, code_only: bool = False) -> bool:
        """Deploy Lambda function to AWS with retry logic."""
        lambda_path = Path(lambda_file_path)
        handler_file = lambda_path.stem

        function_name = handler_file

        logger.info(f"Deploying Lambda function: {function_name}")

        try:
            # Get role ARN
            role_arn = self.get_role_arn()
            logger.info(f"Using IAM role: {role_arn}")

            # Create zip package
            zip_bytes = self.create_zip_package(lambda_file_path)
            logger.info(f"Created zip package ({len(zip_bytes)} bytes)")

            # Check if function exists
            function_exists = False
            try:
                self.lambda_client.get_function(FunctionName=function_name)
                function_exists = True
                logger.info(
                    f"Function {function_name} already exists - updating")
            except ClientError as e:
                if e.response['Error']['Code'] == 'ResourceNotFoundException':
                    logger.info(
                        f"Function {function_name} does not exist - creating")
                else:
                    raise

            # Deploy function with retry logic
            max_retries = 3
            retry_delay = 10

            for attempt in range(max_retries):
                try:
                    if function_exists:
                        # Wait for function to be ready if it exists
                        if not self.wait_for_function_ready(function_name):
                            logger.error("Function did not become ready")
                            return False

                        # Update existing function - code first
                        logger.info(
                            f"Updating function code (attempt {attempt + 1}/{max_retries})")
                        response = self.lambda_client.update_function_code(
                            FunctionName=function_name,
                            ZipFile=zip_bytes
                        )

                        # Wait for code update to complete
                        logger.info("Waiting for code update to complete...")
                        time.sleep(10)

                        # Update function configuration only if not code-only mode
                        if not code_only:
                            # Check if function is ready for configuration update
                            if not self.wait_for_function_ready(function_name, max_wait_time=60):
                                logger.error(
                                    "Function not ready for configuration update")
                                return False

                            # Update function configuration
                            logger.info("Updating function configuration")
                            self.lambda_client.update_function_configuration(
                                FunctionName=function_name,
                                Runtime="python3.12",
                                Role=role_arn,
                                Handler=f"{handler_file}.lambda_handler",
                                Description=f"v2 function {function_name}",
                                Timeout=TIMEOUT,
                                MemorySize=128,
                                Layers=LAYER_ARNS,
                                Environment={"Variables": ENV_VARS},
                                VpcConfig={
                                    "SubnetIds": VPC_SUBNETS,
                                    "SecurityGroupIds": VPC_SECURITY_GROUPS,
                                }
                            )
                        else:
                            logger.info(
                                "Skipping configuration update (code-only mode)")
                    else:
                        # Create new function
                        logger.info(
                            f"Creating new function (attempt {attempt + 1}/{max_retries})")
                        response = self.lambda_client.create_function(
                            FunctionName=function_name,
                            Runtime="python3.12",
                            Role=role_arn,
                            Handler=f"{handler_file}.lambda_handler",
                            Code={"ZipFile": zip_bytes},
                            Description=f"v2 function {function_name}",
                            Timeout=TIMEOUT,
                            MemorySize=128,
                            Publish=True,
                            Layers=LAYER_ARNS,
                            Environment={"Variables": ENV_VARS},
                            VpcConfig={
                                "SubnetIds": VPC_SUBNETS,
                                "SecurityGroupIds": VPC_SECURITY_GROUPS,
                            },
                            PackageType="Zip"
                        )

                    logger.info(f"Successfully deployed {function_name}")
                    logger.info(f"Function ARN: {response['FunctionArn']}")
                    return True

                except ClientError as e:
                    error_code = e.response['Error']['Code']

                    if error_code == 'ResourceConflictException':
                        if attempt < max_retries - 1:
                            logger.warning(
                                f"Resource conflict detected, retrying in {retry_delay} seconds...")
                            time.sleep(retry_delay)
                            retry_delay *= 2  # Exponential backoff
                            continue
                        else:
                            logger.error(
                                f"Resource conflict persists after {max_retries} attempts")
                            return False
                    else:
                        logger.error(f"Failed to deploy Lambda function: {e}")
                        return False

            return False

        except Exception as e:
            logger.error(f"Unexpected error during deployment: {e}")
            return False

    def grant_api_gateway_permission(self, lambda_function_name: str) -> bool:
        """Grant API Gateway permission to invoke the Lambda function."""
        try:
            logger.info(
                f"Granting API Gateway permission to invoke {lambda_function_name}")

            # Create the permission statement
            source_arn = f"arn:aws:execute-api:{self.region}:{self.account_id}:{self.rest_api_id}/*/*"

            try:
                self.lambda_client.add_permission(
                    FunctionName=lambda_function_name,
                    StatementId=f"api-gateway-{self.rest_api_id}",
                    Action='lambda:InvokeFunction',
                    Principal='apigateway.amazonaws.com',
                    SourceArn=source_arn
                )
                logger.info(
                    f"✅ Granted API Gateway permission for {lambda_function_name}")
                return True
            except ClientError as e:
                if e.response['Error']['Code'] == 'ResourceConflictException':
                    logger.info(
                        f"Permission already exists for {lambda_function_name}")
                    return True
                else:
                    logger.error(f"Failed to grant permission: {e}")
                    return False

        except Exception as e:
            logger.error(f"Error granting API Gateway permission: {e}")
            return False

    def update_api_gateway_integration(self, lambda_function_name: str) -> bool:
        """Update API Gateway integration to use the correct Lambda function."""
        try:
            logger.info(
                f"Updating API Gateway integration for {lambda_function_name}")

            # First grant API Gateway permission to invoke the Lambda function
            if not self.grant_api_gateway_permission(lambda_function_name):
                logger.error("Failed to grant API Gateway permission")
                return False

            # Get all resources
            resources = self.apigateway_client.get_resources(
                restApiId=self.rest_api_id)

            # Map Lambda functions to their corresponding API Gateway endpoints
            endpoint_mapping = {
                'ClientGroupsHandler': [
                    'client-groups',
                    'client-groups/{client_group_name}',
                    'client-groups/{client_group_name}/users:set'
                ],
                'UsersHandler': [
                    'users',
                    'users/{user_name}',
                    'users/{user_name}/client-groups:set'
                ],
                'EntitiesHandler': [
                    'entities',
                    'entities/{entity_name}'
                ],
                'TransactionsHandler': [
                    'transactions',
                    'transactions/{transaction_id}'
                ],
                'EntityTypesHandler': [
                    'entity-types',
                    'entity-types/{entity_type_name}'
                ],
                'TransactionTypesHandler': [
                    'transaction-types',
                    'transaction-types/{transaction_type_name}'
                ],
                'TransactionStatusesHandler': [
                    'transaction-statuses',
                    'transaction-statuses/{transaction_status_name}'
                ],
                'InvitationsHandler': [
                    'invitations',
                    'invitations/{invitation_id}',
                    'client-groups/{client_group_name}/invitations',
                    'invitations/redeem/{code}'
                ],
                'PositionKeeper': [
                    'position-keeper'
                ]
            }

            target_endpoints = endpoint_mapping.get(lambda_function_name, [])

            updated_count = 0
            for resource in resources['items']:
                if resource.get('pathPart') in target_endpoints:
                    resource_id = resource['id']
                    logger.info(
                        f"Updating integration for resource: {resource.get('pathPart')}")

                    # Update the integration URI to point to our Lambda function
                    lambda_uri = f"arn:aws:apigateway:{self.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:{self.region}:{self.account_id}:function:{lambda_function_name}/invocations"

                    try:
                        self.apigateway_client.put_integration(
                            restApiId=self.rest_api_id,
                            resourceId=resource_id,
                            httpMethod='POST',
                            type='AWS_PROXY',
                            integrationHttpMethod='POST',
                            uri=lambda_uri
                        )
                        updated_count += 1
                        logger.info(
                            f"✅ Updated {resource.get('pathPart')} to use {lambda_function_name}")
                    except ClientError as e:
                        logger.warning(
                            f"Could not update {resource.get('pathPart')}: {e}")

            if updated_count > 0:
                logger.info(
                    f"Updated {updated_count} API Gateway integrations")
                return True
            else:
                logger.warning("No API Gateway integrations were updated")
                return True

        except Exception as e:
            logger.error(f"Failed to update API Gateway integration: {e}")
            return False

    def deploy_api_stage(self) -> bool:
        """Deploy API Gateway stage."""
        try:
            logger.info(f"Deploying API Gateway stage: {self.stage_name}")

            response = self.apigateway_client.create_deployment(
                restApiId=self.rest_api_id,
                stageName=self.stage_name,
                description=f"Deployment for Lambda functions - {self.stage_name}"
            )

            logger.info(f"Successfully deployed API stage: {self.stage_name}")
            logger.info(f"Deployment ID: {response['id']}")

            return True

        except ClientError as e:
            logger.error(f"Failed to deploy API stage: {e}")
            return False

    def test_api(self, lambda_file_path: str, openapi_spec: Dict[str, Any]) -> bool:
        """Test the deployed API endpoints."""
        lambda_name = Path(lambda_file_path).stem

        # Get test credentials from environment
        test_username = os.getenv('TEST_USERNAME')
        test_password = os.getenv('TEST_PASSWORD')

        if not test_username or not test_password:
            logger.warning(
                "TEST_USERNAME or TEST_PASSWORD not found in environment. Skipping API tests.")
            return True

        try:
            # Get API base URL
            api_base_url = self.get_api_base_url()

            # Initialize API tester
            api_tester = APITester(test_username, test_password, api_base_url)

            # Authenticate
            if not api_tester.authenticate():
                logger.error("Failed to authenticate for API testing")
                return False

            # Wait a moment for deployment to propagate
            logger.info("Waiting for deployment to propagate...")
            time.sleep(5)

            # Test endpoints
            test_results = api_tester.test_lambda_endpoints(
                lambda_name, openapi_spec)

            if not test_results:
                logger.warning(f"No endpoints found to test for {lambda_name}")
                return True

            # Analyze results
            successful_tests = sum(
                1 for result in test_results if result['success'])
            total_tests = len(test_results)

            logger.info(
                f"API Test Results: {successful_tests}/{total_tests} tests passed")

            # Log detailed results
            for result in test_results:
                if result['success']:
                    logger.info(
                        f"✅ {result['method']} {result['endpoint']} - {result['status_code']}")
                else:
                    logger.warning(
                        f"❌ {result['method']} {result['endpoint']} - {result['status_code']}")
                    if 'error' in result:
                        logger.warning(f"   Error: {result['error']}")

            return successful_tests == total_tests

        except Exception as e:
            logger.error(f"API testing failed: {e}")
            return False

    def deploy(self, lambda_file_path: str, test_api: bool = True, code_only: bool = False, test_only: bool = False, update_api: bool = False) -> bool:
        """Main deployment method."""
        if test_only:
            logger.info(f"Starting API testing process for {lambda_file_path}")
        else:
            logger.info(f"Starting deployment process for {lambda_file_path}")

        # Validate file exists
        if not Path(lambda_file_path).exists():
            logger.error(f"Lambda file not found: {lambda_file_path}")
            return False

        # Get OpenAPI specification
        try:
            openapi_spec = self.get_openapi_spec()
            logger.info("Successfully retrieved OpenAPI specification")
        except Exception as e:
            logger.error(f"Failed to get OpenAPI spec: {e}")
            return False

        if test_only:
            # Test-only mode: skip deployment and validation, just test API
            logger.info(
                "Test-only mode: skipping Lambda deployment and validation")
            if not self.test_api(lambda_file_path, openapi_spec):
                logger.error("API testing failed")
                return False
            logger.info("API testing completed successfully!")
            return True

        # Check permissions
        function_name = Path(lambda_file_path).stem
        if not self.check_permissions(function_name):
            logger.error("Permission checks failed")
            return False

        # Deploy Lambda function
        if not self.deploy_lambda(lambda_file_path, code_only=code_only):
            logger.error("Lambda deployment failed")
            return False

        # Update API Gateway integration if requested
        if update_api:
            function_name = Path(lambda_file_path).stem
            if not self.update_api_gateway_integration(function_name):
                logger.error("API Gateway integration update failed")
                return False

            # Deploy the API Gateway changes
            if not self.deploy_api_stage():
                logger.error("API Gateway deployment failed")
                return False

        # Validate compliance
        if not self.validate_lambda_compliance(lambda_file_path, openapi_spec):
            logger.error("OpenAPI compliance validation failed")
            return False

        # Test API if requested
        if test_api:
            if not self.test_api(lambda_file_path, openapi_spec):
                logger.error("API testing failed")
                return False

        logger.info("Deployment completed successfully!")
        return True

    def test_and_validate_only(self, lambda_file_path: str) -> bool:
        """Test and validate Lambda function without deploying."""
        logger.info(
            f"Testing and validating {lambda_file_path} (no deployment)")

        # Validate file exists
        if not Path(lambda_file_path).exists():
            logger.error(f"Lambda file not found: {lambda_file_path}")
            return False

        # Get OpenAPI specification
        try:
            openapi_spec = self.get_openapi_spec()
            logger.info("Successfully retrieved OpenAPI specification")
        except Exception as e:
            logger.error(f"Failed to get OpenAPI spec: {e}")
            return False

        # Validate OpenAPI compliance
        if not self.validate_lambda_compliance(lambda_file_path, openapi_spec):
            logger.error("OpenAPI compliance validation failed")
            return False

        # Test API endpoints
        if not self.test_api(lambda_file_path, openapi_spec):
            logger.error("API testing failed")
            return False

        logger.info("✅ Testing and validation completed successfully!")
        return True


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Deploy Lambda function to AWS with OpenAPI compliance validation and API testing"
    )
    parser.add_argument(
        'lambda_file',
        nargs='?',  # Make it optional
        help='Path to the Lambda function Python file (not needed with --deploy-all)'
    )
    parser.add_argument(
        '--skip-validation',
        action='store_true',
        help='Skip OpenAPI compliance validation'
    )
    parser.add_argument(
        '--skip-tests',
        action='store_true',
        help='Skip API testing'
    )
    parser.add_argument(
        '--deploy-stage',
        action='store_true',
        help='Deploy API Gateway stage after Lambda deployment'
    )
    parser.add_argument(
        '--code-only',
        action='store_true',
        help='Only update Lambda code, skip configuration updates'
    )
    parser.add_argument(
        '--test-only',
        action='store_true',
        help='Skip Lambda deployment, only run API tests'
    )
    parser.add_argument(
        '--update-api',
        action='store_true',
        help='Update API Gateway integration to use the deployed Lambda function'
    )
    parser.add_argument(
        '--deploy-all',
        action='store_true',
        help='Deploy all 8 Lambda functions and configure API Gateway'
    )
    parser.add_argument(
        '--test-and-validate-only',
        action='store_true',
        help='Test and validate all Lambda functions without deploying (use with --deploy-all)'
    )

    args = parser.parse_args()

    # Validate conflicting options
    if args.test_only and args.code_only:
        logger.error("Cannot use --test-only and --code-only together")
        sys.exit(1)

    if args.test_only and args.skip_tests:
        logger.error("Cannot use --test-only and --skip-tests together")
        sys.exit(1)

    if args.deploy_all and args.lambda_file:
        logger.error(
            "Cannot specify both --deploy-all and a specific lambda file")
        sys.exit(1)

    if not args.deploy_all and not args.lambda_file:
        logger.error("Must specify either a lambda file or use --deploy-all")
        sys.exit(1)

    if args.test_and_validate_only and not args.deploy_all:
        logger.error(
            "--test-and-validate-only can only be used with --deploy-all")
        sys.exit(1)

    if args.test_and_validate_only and args.code_only:
        logger.error("Cannot use --test-and-validate-only with --code-only")
        sys.exit(1)

    # Handle deploy-all option
    if args.deploy_all:
        if args.test_and_validate_only:
            logger.info(
                "Testing and validating all 9 Lambda functions (no deployment)...")
        else:
            logger.info(
                "Deploying all 9 Lambda functions and configuring API Gateway...")

        lambda_functions = [
            'ClientGroupsHandler.py',
            'UsersHandler.py',
            'EntitiesHandler.py',
            'TransactionsHandler.py',
            'EntityTypesHandler.py',
            'TransactionTypesHandler.py',
            'TransactionStatusesHandler.py',
            'InvitationsHandler.py',
            'PositionKeeper.py'  # Updated to PositionKeeper
        ]

        deployer = LambdaDeployer()
        success_count = 0
        total_issues = 0

        for lambda_file in lambda_functions:
            lambda_file_path = Path(
                __file__).parent.parent / 'lambdas' / lambda_file

            if not lambda_file_path.exists():
                logger.warning(f"Lambda file not found: {lambda_file_path}")
                continue

            logger.info(f"\n{'='*60}")
            if args.test_and_validate_only:
                logger.info(f"Testing and validating {lambda_file}")
            else:
                logger.info(f"Deploying {lambda_file}")
            logger.info(f"{'='*60}")

            try:
                if args.test_and_validate_only:
                    # Test and validate only mode
                    success = deployer.test_and_validate_only(
                        str(lambda_file_path))
                else:
                    # Normal deployment mode
                    success = deployer.deploy(
                        str(lambda_file_path),
                        test_api=False,  # Skip individual tests during bulk deployment
                        code_only=args.code_only,
                        test_only=False,
                        update_api=True  # Always update API Gateway for bulk deployment
                    )

                if success:
                    success_count += 1
                    logger.info(f"✅ Successfully processed {lambda_file}")
                else:
                    logger.error(f"❌ Failed to process {lambda_file}")
                    total_issues += 1
            except Exception as e:
                logger.error(f"❌ Error processing {lambda_file}: {e}")
                total_issues += 1

        logger.info(f"\n{'='*60}")
        if args.test_and_validate_only:
            logger.info(
                f"Test and validation completed: {success_count}/{len(lambda_functions)} functions passed")
            if total_issues > 0:
                logger.warning(
                    f"Found {total_issues} issues that need attention")
        else:
            logger.info(
                f"Bulk deployment completed: {success_count}/{len(lambda_functions)} functions deployed successfully")
        logger.info(f"{'='*60}")

        if success_count == len(lambda_functions):
            if args.test_and_validate_only:
                logger.info(
                    "🎉 All Lambda functions passed testing and validation!")
            else:
                logger.info("🎉 All Lambda functions deployed successfully!")
            sys.exit(0)
        else:
            if args.test_and_validate_only:
                logger.error("Some functions failed testing or validation!")
            else:
                logger.error("Some deployments failed!")
            sys.exit(1)

    # Convert relative path to absolute if needed
    lambda_file_path = args.lambda_file
    if not Path(lambda_file_path).is_absolute():
        # Assume it's relative to the lambdas directory
        lambda_file_path = Path(__file__).parent.parent / \
            'lambdas' / lambda_file_path

    # Validate file exists
    if not Path(lambda_file_path).exists():
        logger.error(f"Lambda file not found: {lambda_file_path}")
        sys.exit(1)

    # Create deployer and run deployment
    deployer = LambdaDeployer()

    try:
        success = deployer.deploy(
            str(lambda_file_path), test_api=not args.skip_tests, code_only=args.code_only, test_only=args.test_only, update_api=args.update_api)
        if success:
            logger.info("Deployment completed successfully!")
            sys.exit(0)
        else:
            logger.error("Deployment failed!")
            sys.exit(1)
    except KeyboardInterrupt:
        logger.info("Deployment cancelled by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
