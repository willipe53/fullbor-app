#!/usr/bin/env bash
set -euo pipefail

API_ID="nkdrongg4e"
REGION="us-east-2"
STAGE="test"

ALLOWED_ORIGIN="'https://app.fullbor.ai'"
ALLOWED_METHODS="'GET,POST,PUT,DELETE,OPTIONS'"
ALLOWED_HEADERS="'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id'"

echo "============================================================"
echo "Force-fixing CORS for API Gateway: $API_ID"
echo "This will DELETE and RECREATE integration responses"
echo "============================================================"

# Get all resource IDs
RESOURCE_IDS=$(aws apigateway get-resources \
  --rest-api-id "$API_ID" \
  --region "$REGION" \
  --query 'items[*].id' \
  --output text)

FIXED_COUNT=0
for RESOURCE_ID in $RESOURCE_IDS; do
  echo ""
  echo "Processing resource: $RESOURCE_ID"
  
  # Check if OPTIONS method exists
  if aws apigateway get-method \
    --rest-api-id "$API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --region "$REGION" &>/dev/null; then
    
    echo "  Found OPTIONS method, fixing integration response..."
    
    # Delete existing integration response
    aws apigateway delete-integration-response \
      --rest-api-id "$API_ID" \
      --resource-id "$RESOURCE_ID" \
      --http-method OPTIONS \
      --status-code 200 \
      --region "$REGION" 2>/dev/null || echo "  (no existing integration response)"
    
    # Recreate integration response with correct CORS headers
    aws apigateway put-integration-response \
      --rest-api-id "$API_ID" \
      --resource-id "$RESOURCE_ID" \
      --http-method OPTIONS \
      --status-code 200 \
      --response-parameters "{\"method.response.header.Access-Control-Allow-Origin\":$ALLOWED_ORIGIN,\"method.response.header.Access-Control-Allow-Methods\":$ALLOWED_METHODS,\"method.response.header.Access-Control-Allow-Headers\":$ALLOWED_HEADERS}" \
      --region "$REGION" &>/dev/null
    
    echo "  ✅ Integration response recreated with CORS headers"
    FIXED_COUNT=$((FIXED_COUNT + 1))
  else
    echo "  ⏭️  No OPTIONS method (skipping)"
  fi
done

echo ""
echo "============================================================"
echo "Fixed $FIXED_COUNT resources"
echo "============================================================"

# Deploy
echo ""
echo "Deploying to stage: $STAGE"
DEPLOYMENT_ID=$(aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --stage-name "$STAGE" \
  --description "Force-fix CORS integration responses" \
  --region "$REGION" \
  --query 'id' \
  --output text)

echo "✅ Deployment complete! Deployment ID: $DEPLOYMENT_ID"
echo ""
echo "Wait 1-2 minutes, then test at: https://app.fullbor.ai"

