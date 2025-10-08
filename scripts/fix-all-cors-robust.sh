#!/usr/bin/env bash
set -uo pipefail  # Removed 'e' to continue on errors

API_ID="nkdrongg4e"
REGION="us-east-2"
STAGE="test"

echo "============================================================"
echo "Fixing ALL CORS integration responses (robust mode)"
echo "============================================================"

# Get all resource IDs
RESOURCE_IDS=$(aws apigateway get-resources \
  --rest-api-id "$API_ID" \
  --region "$REGION" \
  --query 'items[*].id' \
  --output text)

FIXED_COUNT=0
SKIP_COUNT=0

for RESOURCE_ID in $RESOURCE_IDS; do
  # Check if OPTIONS method exists
  if aws apigateway get-method \
    --rest-api-id "$API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --region "$REGION" &>/dev/null; then
    
    # Delete existing integration response if it exists
    aws apigateway delete-integration-response \
      --rest-api-id "$API_ID" \
      --resource-id "$RESOURCE_ID" \
      --http-method OPTIONS \
      --status-code 200 \
      --region "$REGION" &>/dev/null || true
    
    # Add integration response with correct quoting
    if aws apigateway put-integration-response \
      --rest-api-id "$API_ID" \
      --resource-id "$RESOURCE_ID" \
      --http-method OPTIONS \
      --status-code 200 \
      --response-parameters '{"method.response.header.Access-Control-Allow-Origin":"'"'"'https://app.fullbor.ai'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id'"'"'"}' \
      --region "$REGION" &>/dev/null; then
      
      echo "✅ Resource $RESOURCE_ID - CORS fixed"
      FIXED_COUNT=$((FIXED_COUNT + 1))
    else
      echo "⚠️  Resource $RESOURCE_ID - Failed (skipping)"
      SKIP_COUNT=$((SKIP_COUNT + 1))
    fi
  fi
done

echo ""
echo "============================================================"
echo "Fixed: $FIXED_COUNT | Skipped: $SKIP_COUNT"
echo "============================================================"

# Deploy
echo ""
echo "Deploying to stage: $STAGE..."
if DEPLOYMENT_ID=$(aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --stage-name "$STAGE" \
  --description "Fix all CORS integration responses (robust)" \
  --region "$REGION" \
  --query 'id' \
  --output text 2>&1); then
  
  echo ""
  echo "============================================================"
  echo "✅ Deployment complete! Deployment ID: $DEPLOYMENT_ID"
  echo "============================================================"
else
  echo ""
  echo "❌ Deployment failed: $DEPLOYMENT_ID"
  exit 1
fi

echo ""
echo "Wait 60-90 seconds, then test:"
echo "  https://app.fullbor.ai"
echo ""

