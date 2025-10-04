#!/usr/bin/env python3
"""
Script to fix the missing API Gateway authorizer by updating all methods
to use the Cognito User Pools authorizer.
"""

import boto3
import json
from botocore.exceptions import ClientError

# Configuration
REST_API_ID = "nkdrongg4e"
AUTHORIZER_ID = "3ys7al"  # The authorizer we just created
REGION = "us-east-2"


def main():
    # Initialize API Gateway client
    apigateway = boto3.client('apigateway', region_name=REGION)

    # Get all resources
    print("Getting all API Gateway resources...")
    response = apigateway.get_resources(restApiId=REST_API_ID)
    resources = response['items']

    # Filter resources that have methods
    resources_with_methods = [r for r in resources if 'resourceMethods' in r]

    print(f"Found {len(resources_with_methods)} resources with methods")

    # HTTP methods to update
    http_methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

    updated_count = 0
    error_count = 0

    for resource in resources_with_methods:
        resource_id = resource['id']
        resource_path = resource['path']

        print(f"\nProcessing resource: {resource_path} (ID: {resource_id})")

        # Get the methods for this resource
        if 'resourceMethods' in resource:
            methods = list(resource['resourceMethods'].keys())
            print(f"  Methods: {methods}")

            for method in methods:
                if method in http_methods:
                    try:
                        # Update the method to use the authorizer
                        apigateway.update_method(
                            restApiId=REST_API_ID,
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
                                    'value': AUTHORIZER_ID
                                }
                            ]
                        )
                        print(f"    ✅ Updated {method} method")
                        updated_count += 1

                    except ClientError as e:
                        print(f"    ❌ Error updating {method} method: {e}")
                        error_count += 1

    print(f"\n🎉 Summary:")
    print(f"  ✅ Successfully updated: {updated_count} methods")
    print(f"  ❌ Errors: {error_count} methods")

    if error_count == 0:
        print(f"\n📝 Next steps:")
        print(f"  1. Deploy the API Gateway changes:")
        print(
            f"     aws apigateway create-deployment --rest-api-id {REST_API_ID} --stage-name test")
        print(f"  2. Test the API endpoints")
    else:
        print(f"\n⚠️  Some methods failed to update. Check the errors above.")


if __name__ == "__main__":
    main()
