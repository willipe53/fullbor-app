#!/usr/bin/env python3
"""
Deploy API Gateway Configuration Script

This script:
1. Checks if an API Gateway exists for https://api.fullbor.ai/v2
2. Creates the API Gateway if it doesn't exist
3. Sets up the custom domain name
4. Deploys the OpenAPI specification from api-config/openapi.yaml
5. Creates/updates Lambda integrations
6. Deploys to the specified stage

Usage: python deploy-api-config.py [--stage STAGE] [--region REGION]
"""

import argparse
import json
import logging
import os
import sys
import time
import yaml
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse

import boto3
from botocore.exceptions import ClientError

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
DEFAULT_STAGE = "test"
DEFAULT_REGION = "us-east-2"
DOMAIN_NAME = "api.fullbor.ai"
API_PATH = "/v2"


class APIGatewayDeployer:
    """Handles API Gateway deployment and configuration."""

    def __init__(self, region: str = DEFAULT_REGION, stage: str = DEFAULT_STAGE):
        """Initialize the deployer."""
        self.region = region
        self.stage = stage
        self.domain_name = DOMAIN_NAME
        self.api_path = API_PATH

        # Initialize AWS clients
        self.apigateway_client = boto3.client('apigateway', region_name=region)
        self.acm_client = boto3.client('acm', region_name=region)
        self.route53_client = boto3.client('route53')
        self.lambda_client = boto3.client('lambda', region_name=region)
        self.s3_client = boto3.client('s3', region_name=region)
        self.cloudfront_client = boto3.client('cloudfront', region_name=region)

        # Load OpenAPI spec
        self.openapi_spec = self._load_openapi_spec()

    def _load_openapi_spec(self) -> Dict[str, Any]:
        """Load the OpenAPI specification from YAML file."""
        # Get the project root directory (parent of scripts directory)
        project_root = os.path.dirname(
            os.path.dirname(os.path.abspath(__file__)))
        spec_path = os.path.join(project_root, 'api-config', 'openapi.yaml')

        logger.info(f"Looking for OpenAPI spec at: {spec_path}")

        if not os.path.exists(spec_path):
            raise FileNotFoundError(
                f"OpenAPI specification not found at {spec_path}")

        logger.info(f"✅ Found OpenAPI specification")
        with open(spec_path, 'r') as f:
            return yaml.safe_load(f)

    def _get_api_id_from_domain(self) -> Optional[str]:
        """Get API Gateway ID from custom domain name."""
        try:
            # Get all API Gateways
            apis = self.apigateway_client.get_rest_apis()

            for api in apis['items']:
                # Check if this API has a custom domain mapping
                try:
                    domain_mappings = self.apigateway_client.get_domain_names()
                    for domain in domain_mappings['items']:
                        if domain['domainName'] == self.domain_name:
                            # Get base path mappings
                            mappings = self.apigateway_client.get_base_path_mappings(
                                domainName=self.domain_name
                            )
                            for mapping in mappings['items']:
                                if mapping['restApiId'] == api['id'] and mapping['basePath'] == self.api_path.lstrip('/'):
                                    return api['id']
                except ClientError:
                    continue

        except ClientError as e:
            logger.warning(f"Error checking domain mappings: {e}")

        return None

    def _find_existing_api(self) -> Optional[str]:
        """Find existing API Gateway that matches our configuration."""
        try:
            # First check by domain name
            api_id = self._get_api_id_from_domain()
            if api_id:
                return api_id

            # Fallback: check by API name
            apis = self.apigateway_client.get_rest_apis()
            api_name = self.openapi_spec['info']['title']

            for api in apis['items']:
                if api['name'] == api_name:
                    return api['id']

        except ClientError as e:
            logger.error(f"Error finding existing API: {e}")

        return None

    def _create_api_gateway(self) -> str:
        """Create a new API Gateway."""
        logger.info("Creating new API Gateway...")

        api_name = self.openapi_spec['info']['title']
        api_description = self.openapi_spec['info']['description']

        try:
            response = self.apigateway_client.create_rest_api(
                name=api_name,
                description=api_description,
                endpointConfiguration={
                    'types': ['REGIONAL']
                }
            )

            api_id = response['id']
            logger.info(f"✅ Created API Gateway: {api_id}")
            return api_id

        except ClientError as e:
            logger.error(f"Failed to create API Gateway: {e}")
            raise

    def _get_or_create_certificate(self) -> str:
        """Get SSL certificate for the domain from us-east-1 (required for EDGE endpoints)."""
        try:
            # For EDGE endpoints, certificate must be in us-east-1
            acm_client_us_east_1 = boto3.client('acm', region_name='us-east-1')

            # Search for existing certificate in us-east-1
            certificates = acm_client_us_east_1.list_certificates()

            for cert in certificates['CertificateSummaryList']:
                # Check if this certificate covers our domain
                cert_details = acm_client_us_east_1.describe_certificate(
                    CertificateArn=cert['CertificateArn'])
                domains = [cert_details['Certificate']['DomainName']]
                domains.extend(cert_details['Certificate'].get(
                    'SubjectAlternativeNames', []))

                if self.domain_name in domains or f'*.{self.domain_name.split(".", 1)[1]}' in domains:
                    logger.info(
                        f"Found existing certificate: {cert['CertificateArn']}")
                    return cert['CertificateArn']

            # If no certificate found, we can't create one automatically
            logger.error(
                f"No certificate found for {self.domain_name} in us-east-1")
            logger.error(
                "Please create a certificate in us-east-1 that covers *.fullbor.ai")
            raise Exception(f"No certificate found for {self.domain_name}")

        except ClientError as e:
            logger.error(f"Failed to get certificate: {e}")
            raise

    def _create_custom_domain(self, api_id: str) -> None:
        """Create custom domain name for the API Gateway."""
        try:
            # Check if domain already exists
            try:
                existing_domain = self.apigateway_client.get_domain_name(
                    domainName=self.domain_name
                )
                logger.info(f"Custom domain {self.domain_name} already exists")
                domain_exists = True
            except ClientError:
                domain_exists = False

            if not domain_exists:
                logger.info(f"Creating custom domain {self.domain_name}...")

                # Get or create SSL certificate
                certificate_arn = self._get_or_create_certificate()

                # Create the custom domain
                domain_response = self.apigateway_client.create_domain_name(
                    domainName=self.domain_name,
                    certificateArn=certificate_arn,
                    endpointConfiguration={
                        'types': ['EDGE']
                    }
                )

                logger.info(f"✅ Created custom domain: {self.domain_name}")
                logger.info(
                    f"   Distribution Domain Name: {domain_response['distributionDomainName']}")
                logger.info(
                    f"   Regional Domain Name: {domain_response.get('regionalDomainName', 'N/A')}")
                logger.info(
                    f"   Regional Hosted Zone ID: {domain_response.get('regionalHostedZoneId', 'N/A')}")

            # Create base path mapping
            try:
                self.apigateway_client.create_base_path_mapping(
                    domainName=self.domain_name,
                    basePath=self.api_path.lstrip('/'),
                    restApiId=api_id,
                    stage=self.stage
                )
                logger.info(f"✅ Created base path mapping: {self.api_path}")
            except ClientError as e:
                if e.response['Error']['Code'] == 'ConflictException':
                    logger.info(f"Base path mapping already exists")
                else:
                    raise

        except ClientError as e:
            logger.error(f"Failed to create custom domain: {e}")
            raise

    def _import_openapi_spec(self, api_id: str) -> None:
        """Import OpenAPI specification into API Gateway."""
        logger.info("Importing OpenAPI specification...")

        try:
            # Convert YAML to JSON for API Gateway
            openapi_json = json.dumps(self.openapi_spec)

            # Import the specification
            # Use 'merge' mode to preserve existing authorization settings
            response = self.apigateway_client.put_rest_api(
                restApiId=api_id,
                mode='merge',
                body=openapi_json.encode('utf-8')
            )

            logger.info("✅ OpenAPI specification imported successfully")

            # Wait for API Gateway to stabilize after import
            # This gives AWS time to process the changes before we modify integrations
            logger.info("Waiting for API Gateway to stabilize after import...")
            time.sleep(3)

            # Apply Cognito User Pools authorization to all methods
            self._apply_cognito_authorization(api_id)

        except ClientError as e:
            logger.error(f"Failed to import OpenAPI specification: {e}")
            raise

    def _apply_cognito_authorization(self, api_id: str) -> None:
        """Apply Cognito User Pools authorization to all methods."""
        logger.info(
            "Applying Cognito User Pools authorization to all methods...")

        # Get or create the Cognito authorizer
        authorizer_id = self._get_or_create_cognito_authorizer(api_id)

        # Get all resources
        resources = self.apigateway_client.get_resources(restApiId=api_id)

        # HTTP methods to update
        http_methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

        updated_count = 0

        for resource in resources['items']:
            if 'resourceMethods' in resource:
                resource_id = resource['id']
                resource_path = resource['path']

                for method in resource['resourceMethods'].keys():
                    if method in http_methods:
                        try:
                            # Update the method to use Cognito authorization
                            self.apigateway_client.update_method(
                                restApiId=api_id,
                                resourceId=resource_id,
                                httpMethod=method,
                                patchOperations=[
                                    {
                                        'op': 'replace',
                                        'path': '/authorizationType',
                                        'value': 'COGNITO_USER_POOLS'
                                    },
                                    {
                                        'op': 'replace',
                                        'path': '/authorizerId',
                                        'value': authorizer_id
                                    }
                                ]
                            )
                            updated_count += 1

                        except ClientError as e:
                            logger.warning(
                                f"Failed to update {method} {resource_path}: {e}")

        logger.info(
            f"✅ Applied Cognito authorization to {updated_count} methods")

    def _get_or_create_cognito_authorizer(self, api_id: str) -> str:
        """Get existing Cognito authorizer or create a new one."""
        try:
            # Check if authorizer already exists
            authorizers = self.apigateway_client.get_authorizers(
                restApiId=api_id)

            for authorizer in authorizers['items']:
                if authorizer['type'] == 'COGNITO_USER_POOLS':
                    logger.info(
                        f"Found existing Cognito authorizer: {authorizer['id']}")
                    return authorizer['id']

            # Create new authorizer if none exists
            logger.info("Creating new Cognito User Pools authorizer...")
            response = self.apigateway_client.create_authorizer(
                restApiId=api_id,
                name='CognitoUserPoolAuthorizer',
                type='COGNITO_USER_POOLS',
                providerARNs=[
                    'arn:aws:cognito-idp:us-east-2:316490106381:userpool/us-east-2_IJ1C0mWXW'
                ],
                identitySource='method.request.header.Authorization'
            )

            logger.info(f"✅ Created Cognito authorizer: {response['id']}")
            return response['id']

        except ClientError as e:
            logger.error(f"Failed to get or create Cognito authorizer: {e}")
            raise

    def _get_lambda_function_name(self, handler_name: str) -> str:
        """Get the actual Lambda function name for a handler."""
        # Map handler names to Lambda function names
        handler_mapping = {
            'ClientGroupsHandler': 'ClientGroupsHandler',
            'EntitiesHandler': 'EntitiesHandler',
            'EntityTypesHandler': 'EntityTypesHandler',
            'TransactionsHandler': 'TransactionsHandler',
            'TransactionTypesHandler': 'TransactionTypesHandler',
            'TransactionStatusesHandler': 'TransactionStatusesHandler',
            'UsersHandler': 'UsersHandler',
            'InvitationsHandler': 'InvitationsHandler',
            'PositionKeeper': 'PositionKeeper'
        }

        return handler_mapping.get(handler_name, handler_name)

    def _update_lambda_integrations(self, api_id: str) -> None:
        """Update Lambda integrations for all endpoints with retry logic."""
        logger.info("Updating Lambda integrations...")

        # Track integration attempts
        total_updated = 0
        total_failed = 0
        failed_endpoints = []

        try:
            # Get all resources
            resources = self.apigateway_client.get_resources(
                restApiId=api_id, limit=500)

            # Map paths to Lambda handlers based on OpenAPI spec
            path_to_handler = {
                '/client-groups/{client_group_name}/entities:set': 'ClientGroupsHandler',
                '/client-groups': 'ClientGroupsHandler',
                '/entities': 'EntitiesHandler',
                '/entity-types': 'EntityTypesHandler',
                '/transactions': 'TransactionsHandler',
                '/transaction-types': 'TransactionTypesHandler',
                '/transaction-statuses': 'TransactionStatusesHandler',
                '/users': 'UsersHandler',
                '/invitations': 'InvitationsHandler',
                '/position-keeper': 'PositionKeeper'
            }

            for resource in resources['items']:
                resource_path = resource.get('path', '')
                resource_id = resource['id']

                # Find matching handler for this path
                handler_name = None

                # First check for exact matches
                if resource_path in path_to_handler:
                    handler_name = path_to_handler[resource_path]
                else:
                    # Then check for prefix matches
                    for path_prefix, handler in path_to_handler.items():
                        if resource_path.startswith(path_prefix):
                            handler_name = handler
                            break

                if not handler_name:
                    continue

                # Get Lambda function name
                lambda_function_name = self._get_lambda_function_name(
                    handler_name)
                lambda_uri = f'arn:aws:apigateway:{self.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:{self.region}:{self._get_account_id()}:function:{lambda_function_name}/invocations'

                # Check each HTTP method
                http_methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
                for method in http_methods:
                    try:
                        # Check if method exists
                        self.apigateway_client.get_method(
                            restApiId=api_id,
                            resourceId=resource_id,
                            httpMethod=method
                        )

                        # Update integration with retry logic
                        max_retries = 3
                        for attempt in range(max_retries):
                            try:
                                self.apigateway_client.put_integration(
                                    restApiId=api_id,
                                    resourceId=resource_id,
                                    httpMethod=method,
                                    type='AWS_PROXY',
                                    integrationHttpMethod='POST',
                                    uri=lambda_uri
                                )

                                # Verify the integration was created
                                # Brief pause to let AWS process
                                time.sleep(0.2)
                                integration = self.apigateway_client.get_integration(
                                    restApiId=api_id,
                                    resourceId=resource_id,
                                    httpMethod=method
                                )

                                if integration['type'] == 'AWS_PROXY':
                                    total_updated += 1
                                    logger.info(
                                        f"✅ Updated {method} {resource_path} → {lambda_function_name}")
                                    break
                                else:
                                    raise Exception(
                                        f"Integration type mismatch: {integration['type']}")

                            except Exception as e:
                                if attempt < max_retries - 1:
                                    logger.warning(
                                        f"Retry {attempt + 1}/{max_retries} for {method} {resource_path}: {e}")
                                    time.sleep(1)  # Wait before retry
                                else:
                                    raise  # Give up after max retries

                    except ClientError as e:
                        if e.response['Error']['Code'] == 'NotFoundException':
                            # Method doesn't exist, skip it
                            continue
                        else:
                            total_failed += 1
                            failed_endpoints.append(
                                f"{method} {resource_path}")
                            logger.error(
                                f"❌ Failed to update {method} {resource_path}: {e}")
                    except Exception as e:
                        total_failed += 1
                        failed_endpoints.append(f"{method} {resource_path}")
                        logger.error(
                            f"❌ Failed to update {method} {resource_path}: {e}")

            # Summary
            logger.info(f"\n=== Lambda Integration Summary ===")
            logger.info(f"Successfully updated: {total_updated}")
            logger.info(f"Failed: {total_failed}")

            if failed_endpoints:
                logger.error(f"\nFailed endpoints:")
                for endpoint in failed_endpoints:
                    logger.error(f"  - {endpoint}")
                raise Exception(
                    f"Failed to update {total_failed} Lambda integrations")

        except ClientError as e:
            logger.error(f"Failed to update Lambda integrations: {e}")
            raise

    def _verify_all_integrations(self, api_id: str) -> bool:
        """Verify that all API methods have Lambda integrations configured."""
        logger.info("Verifying all integrations are configured...")

        try:
            resources = self.apigateway_client.get_resources(
                restApiId=api_id, limit=500)

            missing_integrations = []
            total_methods = 0
            total_with_integration = 0

            for resource in resources['items']:
                resource_path = resource.get('path', '')
                resource_id = resource['id']

                if 'resourceMethods' in resource:
                    for method in resource['resourceMethods'].keys():
                        # Skip OPTIONS methods (they use MOCK integration)
                        if method == 'OPTIONS':
                            continue

                        total_methods += 1

                        try:
                            integration = self.apigateway_client.get_integration(
                                restApiId=api_id,
                                resourceId=resource_id,
                                httpMethod=method
                            )

                            # Check if it's a Lambda integration
                            if integration['type'] == 'AWS_PROXY':
                                total_with_integration += 1
                            else:
                                missing_integrations.append(
                                    f"{method} {resource_path} (has {integration['type']} instead of AWS_PROXY)")

                        except ClientError as e:
                            if e.response['Error']['Code'] == 'NotFoundException':
                                missing_integrations.append(
                                    f"{method} {resource_path} (no integration)")

            logger.info(f"\n=== Integration Verification Results ===")
            logger.info(f"Total methods (excluding OPTIONS): {total_methods}")
            logger.info(
                f"Methods with AWS_PROXY integration: {total_with_integration}")
            logger.info(
                f"Missing or incorrect integrations: {len(missing_integrations)}")

            if missing_integrations:
                logger.error(
                    f"\n❌ The following endpoints are missing proper integrations:")
                for endpoint in missing_integrations:
                    logger.error(f"  - {endpoint}")
                return False
            else:
                logger.info(f"✅ All integrations verified successfully!")
                return True

        except Exception as e:
            logger.error(f"Failed to verify integrations: {e}")
            return False

    def _get_account_id(self) -> str:
        """Get AWS account ID."""
        try:
            sts_client = boto3.client('sts')
            return sts_client.get_caller_identity()['Account']
        except ClientError as e:
            logger.error(f"Failed to get account ID: {e}")
            raise

    def _grant_lambda_permissions(self, api_id: str) -> None:
        """Grant API Gateway permission to invoke Lambda functions."""
        logger.info("Granting Lambda invoke permissions...")

        try:
            account_id = self._get_account_id()
            source_arn = f"arn:aws:execute-api:{self.region}:{account_id}:{api_id}/*/*"

            # Get all Lambda functions
            lambda_functions = self.lambda_client.list_functions()

            for func in lambda_functions['Functions']:
                function_name = func['FunctionName']

                # Check if this is one of our handlers
                handler_names = [
                    'ClientGroupsHandler', 'EntitiesHandler', 'EntityTypesHandler',
                    'TransactionsHandler', 'TransactionTypesHandler', 'TransactionStatusesHandler',
                    'UsersHandler', 'InvitationsHandler', 'PositionKeeper'
                ]

                if function_name in handler_names:
                    try:
                        # Add permission
                        self.lambda_client.add_permission(
                            FunctionName=function_name,
                            StatementId=f'api-gateway-{api_id}',
                            Action='lambda:InvokeFunction',
                            Principal='apigateway.amazonaws.com',
                            SourceArn=source_arn
                        )
                        logger.info(
                            f"✅ Granted permission for {function_name}")

                    except ClientError as e:
                        if e.response['Error']['Code'] == 'ResourceConflictException':
                            logger.info(
                                f"Permission already exists for {function_name}")
                        else:
                            logger.warning(
                                f"Failed to grant permission for {function_name}: {e}")

        except ClientError as e:
            logger.error(f"Failed to grant Lambda permissions: {e}")
            raise

    def _deploy_api(self, api_id: str) -> None:
        """Deploy the API to the specified stage."""
        logger.info(f"Deploying API to {self.stage} stage...")

        try:
            # Create stage if it doesn't exist
            try:
                self.apigateway_client.get_stage(
                    restApiId=api_id,
                    stageName=self.stage
                )
                logger.info(f"Stage {self.stage} already exists")
            except ClientError:
                logger.info(f"Creating stage {self.stage}")
                self.apigateway_client.create_deployment(
                    restApiId=api_id,
                    stageName=self.stage,
                    description=f"Deployment from {self.openapi_spec['info']['version']}"
                )

            # Deploy
            response = self.apigateway_client.create_deployment(
                restApiId=api_id,
                stageName=self.stage,
                description=f"Deployment from {self.openapi_spec['info']['version']}"
            )

            logger.info(f"✅ Deployed to {self.stage} stage")
            logger.info(f"Deployment ID: {response['id']}")

        except ClientError as e:
            logger.error(f"Failed to deploy API: {e}")
            raise

    def _deploy_openapi_to_s3(self) -> None:
        """Deploy OpenAPI specification as JSON and index.html to S3."""
        logger.info(
            "Deploying OpenAPI specification and documentation to S3...")

        try:
            # Convert OpenAPI spec to JSON
            openapi_json = json.dumps(self.openapi_spec, indent=2)

            # Upload to S3
            bucket_name = "fullbor-api-docs"

            # Check if bucket exists and create if it doesn't
            try:
                self.s3_client.head_bucket(Bucket=bucket_name)
                logger.info(f"S3 bucket {bucket_name} exists")
            except ClientError as e:
                if e.response['Error']['Code'] == '404':
                    logger.info(f"Creating S3 bucket {bucket_name}...")
                    try:
                        # Create bucket in the same region as the deployment
                        self.s3_client.create_bucket(
                            Bucket=bucket_name,
                            CreateBucketConfiguration={
                                'LocationConstraint': self.region}
                        )
                        logger.info(f"✅ Created S3 bucket: {bucket_name}")
                    except ClientError as create_error:
                        if create_error.response['Error']['Code'] == 'BucketAlreadyOwnedByYou':
                            logger.info(
                                f"Bucket {bucket_name} already exists and is owned by you")
                        elif create_error.response['Error']['Code'] == 'BucketAlreadyExists':
                            logger.warning(
                                f"Bucket {bucket_name} already exists but is owned by another AWS account")
                            raise Exception(
                                f"Cannot create bucket {bucket_name} - it exists but is owned by another account")
                        else:
                            raise
                else:
                    raise

            # Upload the OpenAPI spec
            self.s3_client.put_object(
                Bucket=bucket_name,
                Key="openapi.json",
                Body=openapi_json,
                ContentType='application/json',
                CacheControl='max-age=3600'  # Cache for 1 hour
            )
            logger.info(
                f"✅ Deployed OpenAPI spec to s3://{bucket_name}/openapi.json")

            # Upload the index.html file
            project_root = os.path.dirname(
                os.path.dirname(os.path.abspath(__file__)))
            index_html_path = os.path.join(
                project_root, 'api-config', 'index.html')

            if os.path.exists(index_html_path):
                with open(index_html_path, 'r', encoding='utf-8') as f:
                    index_html_content = f.read()

                self.s3_client.put_object(
                    Bucket=bucket_name,
                    Key="index.html",
                    Body=index_html_content,
                    ContentType='text/html',
                    CacheControl='max-age=3600'  # Cache for 1 hour
                )
                logger.info(
                    f"✅ Deployed documentation to s3://{bucket_name}/index.html")
            else:
                logger.warning(f"index.html not found at {index_html_path}")

            # Upload the logo file
            logo_path = os.path.join(
                project_root, 'api-config', 'boar34black_small.png')
            if os.path.exists(logo_path):
                with open(logo_path, 'rb') as f:
                    logo_content = f.read()

                self.s3_client.put_object(
                    Bucket=bucket_name,
                    Key="boar34black_small.png",
                    Body=logo_content,
                    ContentType='image/png',
                    CacheControl='max-age=86400'  # Cache for 24 hours
                )
                logger.info(
                    f"✅ Deployed logo to s3://{bucket_name}/boar34black_small.png")
            else:
                logger.warning(f"Logo file not found at {logo_path}")

        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchBucket':
                logger.error(
                    f"S3 bucket {bucket_name} does not exist and could not be created")
                logger.error(
                    "Please create the bucket manually or check your AWS permissions")
                logger.error(
                    f"You can create it with: aws s3 mb s3://{bucket_name} --region {self.region}")
            else:
                logger.error(f"Failed to deploy OpenAPI spec to S3: {e}")
            raise

    def _create_cloudfront_invalidations(self) -> None:
        """Create CloudFront invalidations for both distributions."""
        logger.info("Creating CloudFront invalidations...")

        distributions = {
            "E10FZL3I8R4R7A": "API docs",
            "EPZLOBGCZS220": "Web root"
        }

        for distribution_id, description in distributions.items():
            try:
                response = self.cloudfront_client.create_invalidation(
                    DistributionId=distribution_id,
                    InvalidationBatch={
                        'Paths': {
                            'Quantity': 1,
                            'Items': ['/*']
                        },
                        'CallerReference': f'cli-{int(time.time())}-{distribution_id}'
                    }
                )
                invalidation_id = response['Invalidation']['Id']
                logger.info(
                    f"✅ Created invalidation for {description} ({distribution_id}): {invalidation_id}")
            except ClientError as e:
                logger.warning(
                    f"Failed to create invalidation for {description} ({distribution_id}): {e}")

    def deploy(self) -> None:
        """Main deployment method."""
        logger.info("🚀 Starting API Gateway deployment...")
        logger.info(f"Region: {self.region}")
        logger.info(f"Stage: {self.stage}")
        logger.info(f"Domain: {self.domain_name}")
        logger.info(f"API Path: {self.api_path}")

        try:
            # Find or create API Gateway
            api_id = self._find_existing_api()

            if api_id:
                logger.info(f"Found existing API Gateway: {api_id}")
            else:
                api_id = self._create_api_gateway()

            # Import OpenAPI specification
            self._import_openapi_spec(api_id)

            # Create custom domain
            self._create_custom_domain(api_id)

            # Update Lambda integrations
            self._update_lambda_integrations(api_id)

            # Verify all integrations are configured correctly
            if not self._verify_all_integrations(api_id):
                raise Exception(
                    "Integration verification failed - cannot deploy API")

            # Grant Lambda permissions
            self._grant_lambda_permissions(api_id)

            # Deploy API
            self._deploy_api(api_id)

            # Deploy OpenAPI spec to S3
            self._deploy_openapi_to_s3()

            # Create CloudFront invalidations
            self._create_cloudfront_invalidations()

            # Final info
            api_url = f"https://{self.domain_name}{self.api_path}"
            logger.info(f"🎉 Deployment completed successfully!")
            logger.info(f"API URL: {api_url}")
            logger.info(f"API Gateway ID: {api_id}")

        except Exception as e:
            logger.error(f"❌ Deployment failed: {e}")
            raise


def main():
    """Main entry point."""
    # Validate directory structure
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    api_config_path = os.path.join(project_root, 'api-config', 'openapi.yaml')

    if not os.path.exists(api_config_path):
        logger.error(
            f"❌ Cannot find OpenAPI specification at: {api_config_path}")
        logger.error(
            "Make sure you're running this script from the scripts/ directory")
        logger.error("Expected directory structure:")
        logger.error("  project-root/")
        logger.error("    scripts/")
        logger.error("      deploy-api-config.py  <- run from here")
        logger.error("    api-config/")
        logger.error("      openapi.yaml")
        return 1

    parser = argparse.ArgumentParser(
        description='Deploy API Gateway configuration')
    parser.add_argument('--stage', default=DEFAULT_STAGE,
                        help=f'Deployment stage (default: {DEFAULT_STAGE})')
    parser.add_argument('--region', default=DEFAULT_REGION,
                        help=f'AWS region (default: {DEFAULT_REGION})')

    args = parser.parse_args()

    try:
        deployer = APIGatewayDeployer(region=args.region, stage=args.stage)
        deployer.deploy()
        return 0

    except Exception as e:
        logger.error(f"Deployment failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
