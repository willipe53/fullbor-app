#!/bin/zsh

# Deploy web root to S3
echo "Deploying web root to S3..."
aws s3 sync ../web-root s3://fullbor-web-root/ 

# Deploy API documentation to S3
echo "Deploying API documentation to S3..."
aws s3 sync ../api-config s3://fullbor-api-docs/

# Create CloudFront invalidations for both distributions
echo "Creating CloudFront invalidation for web root (EPZLOBGCZS220)..."
AWS_PAGER="" aws cloudfront create-invalidation --distribution-id="EPZLOBGCZS220" --paths "/*"

echo "Creating CloudFront invalidation for API docs (E10FZL3I8R4R7A)..."
AWS_PAGER="" aws cloudfront create-invalidation --distribution-id="E10FZL3I8R4R7A" --paths "/*"

echo "✅ Deployment completed successfully!" 
