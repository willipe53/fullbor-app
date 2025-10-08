#!/usr/bin/env bash
set -euo pipefail

API_ID="nkdrongg4e"
REGION="us-east-2"
STAGE="test"

ALLOWED_ORIGIN="'https://app.fullbor.ai'"
ALLOWED_METHODS="'GET,POST,PUT,DELETE,OPTIONS'"
ALLOWED_HEADERS="'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id'"

echo "============================================================"
echo "Adding missing integration responses for API Gateway: $API_ID"
echo "============================================================"

# Get all resource IDs
RESOURCE_IDS=$(aws apigateway get-resources \
  --rest-api-id "$API_ID" \
  --region "$REGION" \
  --query 'items[*].id' \
  --output text)

ADDED_COUNT=0
SKIP_COUNT=0

for RESOURCE_ID in $RESOURCE_IDS; do
  # Check if OPTIONS method exists
  if aws apigateway get-method \
    --rest-api-id "$API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --region "$REGION" &>/dev/null; then
    
    # Try to add integration response
    if aws apigateway put-integration-response \
      --rest-api-id "$API_ID" \
      --resource-id "$RESOURCE_ID" \
      --http-method OPTIONS \
      --status-code 200 \
      --response-parameters "{\"method.response.header.Access-Control-Allow-Origin\":$ALLOWED_ORIGIN,\"method.response.header.Access-Control-Allow-Methods\":$ALLOWED_METHODS,\"method.response.header.Access-Control-Allow-Headers\":$ALLOWED_HEADERS}" \
      --region "$REGION" &>/dev/null; then
      
      echo "✅ Resource $RESOURCE_ID - Integration response added"
      ADDED_COUNT=$((ADDED_COUNT + 1))
    else
      echo "⏭️  Resource $RESOURCE_ID - Already exists or error"
      SKIP_COUNT=$((SKIP_COUNT + 1))
    fi
  fi
done

echo ""
echo "============================================================"
echo "Added: $ADDED_COUNT | Skipped: $SKIP_COUNT"
echo "============================================================"

# Deploy
echo ""
echo "Deploying to stage: $STAGE..."
DEPLOYMENT_ID=$(aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --stage-name "$STAGE" \
  --description "Add integration responses for OPTIONS methods" \
  --region "$REGION" \
  --query 'id' \
  --output text)

echo "✅ Deployment complete! Deployment ID: $DEPLOYMENT_ID"
echo ""
echo "============================================================"
echo "CORS should now be working!"
echo "============================================================"
echo ""
echo "Test with:"
echo "  curl -X OPTIONS https://api.fullbor.ai/v2/users -H 'Origin: https://app.fullbor.ai' -i"
echo ""
echo "Then visit: https://app.fullbor.ai"

