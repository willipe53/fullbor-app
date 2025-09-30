# Lambda Deployment Script

This script deploys AWS Lambda functions and validates them against OpenAPI documentation.

## Prerequisites

1. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Configure AWS credentials (via AWS CLI, environment variables, or IAM role)

## Usage

```bash
python deploy_lambda.py <lambda_file.py>
```

### Examples

```bash
# Deploy ClientGroupsHandler
python deploy_lambda.py ClientGroupsHandler.py

# Deploy UsersHandler
python deploy_lambda.py UsersHandler.py

# Skip OpenAPI validation
python deploy_lambda.py --skip-validation ClientGroupsHandler.py

# Deploy API Gateway stage after Lambda deployment
python deploy_lambda.py --deploy-stage ClientGroupsHandler.py
```

## Features

- **Lambda Deployment**: Creates or updates Lambda functions with proper configuration
- **OpenAPI Validation**: Fetches and validates against API Gateway OpenAPI specification
- **Permission Checks**: Validates IAM roles and API Gateway permissions
- **Error Handling**: Comprehensive error handling and logging
- **Configuration**: Uses predefined AWS configuration from deploy_lambda.txt

## Configuration

The script uses the following AWS configuration:

- Region: us-east-2
- Account ID: 316490106381
- IAM Role: FullBorLambdaAPIRole
- API Gateway: zwkvk3lyl3
- Stage: dev

## Lambda Function Requirements

Lambda functions should:

1. Have a `lambda_handler(event, context)` function
2. Return proper HTTP response format with statusCode, body, and headers
3. Be compatible with the OpenAPI specification for the API Gateway
