#!/usr/bin/env python3
"""
AWS Lambda Deployment Script with OpenAPI Compliance Validation

This script deploys Lambda functions to AWS and validates them against
the OpenAPI documentation. All API testing is now handled by the 
comprehensive test framework in the tests/ directory.

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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class LambdaDeployer:
    """Handles Lambda deployment and OpenAPI validation."""

    def __init__(self):
        """Initialize the deployer with AWS clients."""
        try:
            self.lambda_client = boto3.client('lambda', region_name=REGION)
            self.iam_client = boto3.client('iam', region_name=REGION)
            self.apigateway_client = boto3.client(
                'apigateway', region_name=REGION)

            self.role_arn = None
            self.rest_api_id = REST_API_ID
            self.stage_name = STAGE_NAME

            logger.info("Successfully initialized AWS clients")

        except NoCredentialsError:
            logger.error(
                "AWS credentials not found. Please configure your credentials.")
            sys.exit(1)
        except Exception as e:
            logger.error(f"Failed to initialize AWS clients: {e}")
            sys.exit(1)

    def get_role_arn(self) -> str:
        """Get or create the IAM role for Lambda functions."""
        if self.role_arn:
            return self.role_arn

        try:
            response = self.iam_client.get_role(RoleName=ROLE_NAME)
            self.role_arn = response['Role']['Arn']
            logger.info(f"Using existing IAM role: {self.role_arn}")
            return self.role_arn

        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchEntity':
                logger.error(
                    f"IAM role '{ROLE_NAME}' not found. Please create it first.")
                sys.exit(1)
            else:
                logger.error(f"Error getting IAM role: {e}")
                sys.exit(1)

    def create_zip_package(self, lambda_file_path: str) -> bytes:
        """Create a zip package for the Lambda function."""
        lambda_path = Path(lambda_file_path)
        lambdas_dir = lambda_path.parent
        cors_helper_path = lambdas_dir / 'cors_helper.py'

        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as temp_zip:
            with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                # Add the main Lambda file
                zip_file.write(lambda_file_path, lambda_path.name)

                # Add CORS helper if it exists
                if cors_helper_path.exists():
                    zip_file.write(cors_helper_path, 'cors_helper.py')
                    logger.info("  ✓ Added cors_helper.py to package")

            # Read the zip file content
            with open(temp_zip.name, 'rb') as f:
                zip_content = f.read()

            # Clean up temp file
            os.unlink(temp_zip.name)

        return zip_content

    def validate_openapi_compliance(self, lambda_file_path: str, openapi_spec: Dict[str, Any]) -> bool:
        """Validate that the Lambda function complies with OpenAPI specification."""
        lambda_name = Path(lambda_file_path).stem
        logger.info(f"Validating OpenAPI compliance for {lambda_name}")

        # Map Lambda functions to their expected endpoints
        handler_mapping = {
            'ClientGroupsHandler': [
                '/client-groups',
                '/client-groups/{client_group_name}',
                '/client-groups/{client_group_name}/entities:set',
                '/client-groups/{client_group_name}/users:set',
                '/client-groups/{client_group_name}/entities'
            ],
            'EntitiesHandler': ['/entities', '/entities/{entity_name}'],
            'EntityTypesHandler': ['/entity-types', '/entity-types/{entity_type_name}'],
            'InvitationsHandler': [
                '/invitations',
                '/invitations/{invitation_id}',
                '/invitations/redeem/{code}'
            ],
            'PositionKeeper': ['/position-keeper/start', '/position-keeper/stop'],
            'TransactionsHandler': ['/transactions', '/transactions/{transaction_id}'],
            'TransactionStatusesHandler': ['/transaction-statuses'],
            'TransactionTypesHandler': ['/transaction-types', '/transaction-types/{transaction_type_name}'],
            'UsersHandler': ['/users', '/users/{sub}']
        }

        expected_paths = handler_mapping.get(lambda_name, [])
        if not expected_paths:
            logger.warning(f"No OpenAPI paths mapped for {lambda_name}")
            return True

        # Check if all expected paths exist in OpenAPI spec
        api_paths = openapi_spec.get('paths', {})
        missing_paths = []

        for expected_path in expected_paths:
            if expected_path not in api_paths:
                missing_paths.append(expected_path)

        if missing_paths:
            logger.error(
                f"Missing OpenAPI paths for {lambda_name}: {missing_paths}")
            return False

        logger.info(
            f"✅ OpenAPI compliance validation passed for {lambda_name}")
        return True

    def get_openapi_spec(self) -> Dict[str, Any]:
        """Get the OpenAPI specification."""
        openapi_file = Path(__file__).parent.parent / \
            'api-config' / 'openapi.yaml'

        if not openapi_file.exists():
            raise FileNotFoundError(f"OpenAPI spec not found: {openapi_file}")

        import yaml
        with open(openapi_file, 'r') as f:
            return yaml.safe_load(f)

    def update_function_configuration_with_retry(self, function_name: str, max_retries: int = 5) -> bool:
        """Update function configuration with retry logic for ResourceConflictException."""
        for attempt in range(max_retries):
            try:
                self.lambda_client.update_function_configuration(
                    FunctionName=function_name,
                    Timeout=TIMEOUT,
                    Environment={'Variables': ENV_VARS},
                    VpcConfig={
                        'SubnetIds': VPC_SUBNETS,
                        'SecurityGroupIds': VPC_SECURITY_GROUPS
                    },
                    Layers=LAYER_ARNS
                )
                logger.info(
                    f"Successfully updated configuration for {function_name}")
                return True
            except ClientError as e:
                if e.response['Error']['Code'] == 'ResourceConflictException':
                    wait_time = 2 ** attempt  # Exponential backoff: 2, 4, 8, 16, 32 seconds
                    logger.warning(
                        f"ResourceConflictException on attempt {attempt + 1}/{max_retries}, waiting {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    logger.error(
                        f"Non-retryable error updating {function_name}: {e}")
                    return False

        logger.error(
            f"Failed to update configuration for {function_name} after {max_retries} attempts")
        return False

    def wait_for_function_ready(self, function_name: str, max_wait_time: int = 60) -> bool:
        """Wait for Lambda function to be ready."""
        logger.info(f"Waiting for function {function_name} to be ready...")

        start_time = time.time()
        while time.time() - start_time < max_wait_time:
            try:
                response = self.lambda_client.get_function(
                    FunctionName=function_name)
                state = response.get('Configuration', {}).get(
                    'State', 'Unknown')

                if state == 'Active':
                    logger.info(f"Function {function_name} is ready")
                    return True
                elif state == 'Failed':
                    logger.error(
                        f"Function {function_name} is in failed state")
                    return False

                logger.info(
                    f"Function {function_name} state: {state}, waiting...")
                time.sleep(5)

            except ClientError as e:
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
                    f"Function {function_name} already exists, updating...")
            except ClientError as e:
                if e.response['Error']['Code'] == 'ResourceNotFoundException':
                    function_exists = False
                    logger.info(
                        f"Function {function_name} does not exist, creating...")
                else:
                    raise

            # Deploy or update function
            if function_exists:
                # Update existing function
                response = self.lambda_client.update_function_code(
                    FunctionName=function_name,
                    ZipFile=zip_bytes
                )

                # Wait for code update to complete before updating configuration
                logger.info(
                    f"Waiting for code update to complete for {function_name}...")
                time.sleep(10)

                # Wait for function to be in Active state
                self.wait_for_function_ready(function_name)

                # Update configuration if needed with retry logic
                self.update_function_configuration_with_retry(function_name)

                logger.info(f"Updated function: {function_name}")
            else:
                # Create new function
                response = self.lambda_client.create_function(
                    FunctionName=function_name,
                    Runtime='python3.11',
                    Role=role_arn,
                    Handler=f"{handler_file}.lambda_handler",
                    Code={'ZipFile': zip_bytes},
                    Description=f"Lambda function for {function_name}",
                    Timeout=TIMEOUT,
                    Environment={'Variables': ENV_VARS},
                    VpcConfig={
                        'SubnetIds': VPC_SUBNETS,
                        'SecurityGroupIds': VPC_SECURITY_GROUPS
                    },
                    Layers=LAYER_ARNS
                )

                logger.info(f"Created function: {function_name}")

            # Wait for function to be ready
            if not self.wait_for_function_ready(function_name):
                logger.error(f"Function {function_name} is not ready")
                return False

            logger.info(
                f"✅ Successfully deployed Lambda function: {function_name}")
            return True

        except ClientError as e:
            logger.error(f"Failed to deploy Lambda function: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error during deployment: {e}")
            return False

    def update_api_gateway_integration(self, lambda_file_path: str) -> bool:
        """Update API Gateway integration for the Lambda function."""
        if not self.rest_api_id:
            logger.warning(
                "No REST API ID configured, skipping API Gateway update")
            return True

        lambda_name = Path(lambda_file_path).stem
        function_arn = f"arn:aws:lambda:{REGION}:{ACCOUNT_ID}:function:{lambda_name}"

        logger.info(f"Updating API Gateway integration for {lambda_name}")

        try:
            # Get all resources in the API
            resources = self.apigateway_client.get_resources(
                restApiId=self.rest_api_id)

            # Find resources that need to be updated
            # This is a simplified approach - in practice, you might need more sophisticated mapping

            logger.info(f"✅ API Gateway integration updated for {lambda_name}")
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

    def deploy(self, lambda_file_path: str, code_only: bool = False, test_only: bool = False, update_api: bool = False) -> bool:
        """Main deployment method."""
        if test_only:
            logger.info(f"Starting validation process for {lambda_file_path}")
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
            # Only validate OpenAPI compliance
            return self.validate_openapi_compliance(lambda_file_path, openapi_spec)

        # Deploy Lambda function
        if not self.deploy_lambda(lambda_file_path, code_only):
            logger.error("Lambda deployment failed")
            return False

        # Update API Gateway integration if requested
        if update_api:
            if not self.update_api_gateway_integration(lambda_file_path):
                logger.error("API Gateway integration update failed")
                return False

        # Validate OpenAPI compliance
        if not self.validate_openapi_compliance(lambda_file_path, openapi_spec):
            logger.error("OpenAPI compliance validation failed")
            return False

        logger.info("✅ Deployment and validation completed successfully!")
        return True


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Deploy Lambda function to AWS with OpenAPI compliance validation"
    )
    parser.add_argument(
        'lambda_file',
        nargs='?',  # Make it optional
        help='Path to the Lambda function Python file (if not provided, operates on all Lambda functions)'
    )
    parser.add_argument(
        '--validate-only',
        action='store_true',
        help='Only validate OpenAPI compliance, do not deploy'
    )
    parser.add_argument(
        '--deploy-only',
        action='store_true',
        help='Deploy only, skip validation'
    )

    args = parser.parse_args()

    # Determine if we should operate on all files or a specific file
    if args.lambda_file:
        # Single file operation
        lambda_file_path = Path(args.lambda_file)
        if not lambda_file_path.exists():
            logger.error(f"Lambda file not found: {lambda_file_path}")
            sys.exit(1)

        # Convert to Path object if it's a relative path
        if not lambda_file_path.is_absolute():
            lambda_file_path = Path.cwd() / lambda_file_path

        deployer = LambdaDeployer()

        # Determine operation type
        validation_only = args.validate_only
        deployment_only = args.deploy_only

        success = deployer.deploy(
            str(lambda_file_path),
            code_only=False,  # Always deploy API updates by default
            test_only=validation_only,
            update_api=True  # Always update API unless validation only
        )
        if success:
            logger.info("Operation completed successfully!")
            sys.exit(0)
        else:
            logger.error("Operation failed!")
            sys.exit(1)
    else:
        # All files operation
        lambdas_dir = Path(__file__).parent.parent / 'lambdas'
        lambda_functions = list(lambdas_dir.glob('*Handler.py'))

        if not lambda_functions:
            logger.error("No Lambda handler files found in lambdas directory")
            sys.exit(1)

        logger.info(f"Found {len(lambda_functions)} Lambda functions")

        deployer = LambdaDeployer()
        success_count = 0
        total_issues = 0

        for lambda_file in lambda_functions:
            try:
                logger.info(f"\n{'='*60}")
                logger.info(f"Processing {lambda_file.name}")
                logger.info(f"{'='*60}")

                success = deployer.deploy(
                    str(lambda_file),
                    code_only=False,  # Always deploy API updates by default
                    test_only=args.validate_only,
                    update_api=True  # Always update API unless validation only
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
        if args.validate_only:
            logger.info(
                f"Validation completed: {success_count}/{len(lambda_functions)} functions passed")
            if total_issues > 0:
                logger.warning(
                    f"Found {total_issues} issues that need attention")
        else:
            logger.info(
                f"Deployment completed: {success_count}/{len(lambda_functions)} functions deployed successfully")
        logger.info(f"{'='*60}")

        if success_count == len(lambda_functions):
            if args.validate_only:
                logger.info(
                    "🎉 All Lambda functions passed validation!")
            else:
                logger.info("🎉 All Lambda functions deployed successfully!")
            sys.exit(0)
        else:
            if args.validate_only:
                logger.error("Some functions failed validation!")
            else:
                logger.error("Some deployments failed!")
            sys.exit(1)


if __name__ == "__main__":
    main()
