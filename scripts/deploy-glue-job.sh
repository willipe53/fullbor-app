#!/bin/bash

# Deploy saveThePandas as AWS Glue Job
# This script:
# 1. Uploads the Glue script to S3
# 2. Creates/updates the Glue job with proper configuration

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
GLUE_SCRIPT="$PROJECT_ROOT/glue/SaveThePandas.py"
GLUE_SCRIPTS_BUCKET="pandas-glue-scripts"
GLUE_JOB_NAME="saveThePandas"
REGION="us-east-2"
ROLE_NAME="FullBorGlueRole"
SECRET_ARN="arn:aws:secretsmanager:us-east-2:316490106381:secret:PandaDbSecretCache-pdzjei"
BACKUP_BUCKET="pandas-backups"

# VPC Configuration (same as Lambda)
SECURITY_GROUP_ID="sg-0a5a4038d1f4307f2"
SUBNET_IDS="subnet-0dc1aed15b037a940"  # Just need one subnet for Glue

echo "======================================"
echo "Deploying saveThePandas Glue Job"
echo "======================================"

# 1. Create S3 bucket for Glue scripts if it doesn't exist
echo "Checking S3 bucket for Glue scripts..."
if ! aws s3 ls "s3://$GLUE_SCRIPTS_BUCKET" --region "$REGION" 2>&1 > /dev/null; then
    echo "Creating S3 bucket: $GLUE_SCRIPTS_BUCKET"
    aws s3 mb "s3://$GLUE_SCRIPTS_BUCKET" --region "$REGION"
else
    echo "Bucket already exists: $GLUE_SCRIPTS_BUCKET"
fi

# 2. Upload Glue script to S3
echo "Uploading Glue script to S3..."
aws s3 cp "$GLUE_SCRIPT" "s3://$GLUE_SCRIPTS_BUCKET/SaveThePandas.py" --region "$REGION"
echo "✓ Script uploaded to s3://$GLUE_SCRIPTS_BUCKET/SaveThePandas.py"

# 3. Create or update Glue Network Connection for VPC access
echo "Creating/updating Glue Network Connection..."
CONNECTION_NAME="PandaDBConnection"

# Check if connection exists
if aws glue get-connection --name "$CONNECTION_NAME" --region "$REGION" 2>&1 > /dev/null; then
    echo "Connection already exists: $CONNECTION_NAME"
else
    echo "Creating new Glue connection: $CONNECTION_NAME"
    aws glue create-connection \
        --connection-input "{
            \"Name\": \"$CONNECTION_NAME\",
            \"ConnectionType\": \"NETWORK\",
            \"ConnectionProperties\": {},
            \"PhysicalConnectionRequirements\": {
                \"SubnetId\": \"$SUBNET_IDS\",
                \"SecurityGroupIdList\": [\"$SECURITY_GROUP_ID\"],
                \"AvailabilityZone\": \"us-east-2a\"
            }
        }" \
        --region "$REGION"
    echo "✓ Connection created: $CONNECTION_NAME"
fi

# 4. Check if Glue role exists, create if not
echo "Checking IAM role for Glue..."
if ! aws iam get-role --role-name "$ROLE_NAME" --region "$REGION" 2>&1 > /dev/null; then
    echo "Creating IAM role: $ROLE_NAME"
    
    # Create trust policy
    cat > /tmp/glue-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "glue.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
    
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document file:///tmp/glue-trust-policy.json \
        --region "$REGION"
    
    # Attach AWS managed Glue service role
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole" \
        --region "$REGION"
    
    # Create and attach custom policy for S3, Secrets Manager, and VPC
    cat > /tmp/glue-custom-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::$GLUE_SCRIPTS_BUCKET/*",
        "arn:aws:s3:::$BACKUP_BUCKET",
        "arn:aws:s3:::$BACKUP_BUCKET/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "$SECRET_ARN"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeVpcEndpoints",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups"
      ],
      "Resource": "*"
    }
  ]
}
EOF
    
    aws iam put-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name "GluePandasBackupPolicy" \
        --policy-document file:///tmp/glue-custom-policy.json \
        --region "$REGION"
    
    echo "✓ IAM role created: $ROLE_NAME"
    echo "Waiting 10 seconds for role to propagate..."
    sleep 10
else
    echo "Role already exists: $ROLE_NAME"
fi

# Get the role ARN
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text --region "$REGION")
echo "Using role: $ROLE_ARN"

# 4. Create or update Glue job
echo "Creating/updating Glue job..."

# Check if job exists
if aws glue get-job --job-name "$GLUE_JOB_NAME" --region "$REGION" 2>&1 > /dev/null; then
    echo "Updating existing Glue job..."
    aws glue update-job \
        --job-name "$GLUE_JOB_NAME" \
        --job-update "{
            \"Role\": \"$ROLE_ARN\",
            \"Command\": {
                \"Name\": \"glueetl\",
                \"ScriptLocation\": \"s3://$GLUE_SCRIPTS_BUCKET/SaveThePandas.py\",
                \"PythonVersion\": \"3\"
            },
            \"Connections\": {
                \"Connections\": [\"$CONNECTION_NAME\"]
            },
            \"GlueVersion\": \"4.0\",
            \"WorkerType\": \"G.1X\",
            \"NumberOfWorkers\": 2,
            \"DefaultArguments\": {
                \"--SECRET_ARN\": \"$SECRET_ARN\",
                \"--BACKUP_BUCKET\": \"$BACKUP_BUCKET\",
                \"--additional-python-modules\": \"pymysql\",
                \"--enable-glue-datacatalog\": \"true\"
            },
            \"MaxRetries\": 0,
            \"Timeout\": 60
        }" \
        --region "$REGION"
else
    echo "Creating new Glue job..."
    aws glue create-job \
        --name "$GLUE_JOB_NAME" \
        --role "$ROLE_ARN" \
        --command "Name=glueetl,ScriptLocation=s3://$GLUE_SCRIPTS_BUCKET/SaveThePandas.py,PythonVersion=3" \
        --connections "Connections=$CONNECTION_NAME" \
        --default-arguments "{\"--SECRET_ARN\":\"$SECRET_ARN\",\"--BACKUP_BUCKET\":\"$BACKUP_BUCKET\",\"--additional-python-modules\":\"pymysql\",\"--enable-glue-datacatalog\":\"true\"}" \
        --glue-version "4.0" \
        --worker-type "G.1X" \
        --number-of-workers 2 \
        --max-retries 0 \
        --timeout 60 \
        --region "$REGION"
fi

echo ""
echo "======================================"
echo "✓ Glue Job Deployed Successfully!"
echo "======================================"
echo "Job Name: $GLUE_JOB_NAME"
echo "Region: $REGION"
echo ""
echo "To run the job:"
echo "  aws glue start-job-run --job-name $GLUE_JOB_NAME --region $REGION"
echo ""
echo "To check job runs:"
echo "  aws glue get-job-runs --job-name $GLUE_JOB_NAME --region $REGION"
echo ""

