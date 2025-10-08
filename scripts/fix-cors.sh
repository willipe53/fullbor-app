#!/usr/bin/env bash
set -euo pipefail

API_ID="nkdrongg4e"
REGION="us-east-2"
STAGE="test"

# Allowed values (note the single quotes inside the double quotes)
ALLOWED_ORIGIN="'https://app.fullbor.ai'"
ALLOWED_METHODS="'GET,POST,PUT,DELETE,OPTIONS'"
ALLOWED_HEADERS="'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id'"

echo "============================================================"
echo "Fixing CORS for API Gateway: $API_ID"
echo "============================================================"

# Get all resource IDs dynamically
echo "Fetching all resources..."
RESOURCE_IDS=$(aws apigateway get-resources \
  --rest-api-id "$API_ID" \
  --region "$REGION" \
  --query 'items[*].id' \
  --output text)

RESOURCE_COUNT=0
for RESOURCE_ID in $RESOURCE_IDS; do
  RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
  echo ""
  echo "[$RESOURCE_COUNT] Configuring CORS for resource: $RESOURCE_ID"

  # Create OPTIONS method
  echo "  - Creating OPTIONS method..."
  aws apigateway put-method \
    --rest-api-id "$API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --authorization-type "NONE" \
    --region "$REGION" 2>/dev/null || echo "    (already exists)"

  # Put method response (combined parameters)
  echo "  - Adding method response..."
  aws apigateway put-method-response \
    --rest-api-id "$API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Origin":false,"method.response.header.Access-Control-Allow-Methods":false,"method.response.header.Access-Control-Allow-Headers":false}' \
    --region "$REGION" 2>/dev/null || echo "    (already exists)"

  # Put integration (MOCK)
  echo "  - Creating MOCK integration..."
  aws apigateway put-integration \
    --rest-api-id "$API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json":"{\"statusCode\":200}"}' \
    --region "$REGION" 2>/dev/null || echo "    (already exists)"

  # Put integration response (combined parameters)
  echo "  - Adding integration response with CORS headers..."
  aws apigateway put-integration-response \
    --rest-api-id "$API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters "{\"method.response.header.Access-Control-Allow-Origin\":$ALLOWED_ORIGIN,\"method.response.header.Access-Control-Allow-Methods\":$ALLOWED_METHODS,\"method.response.header.Access-Control-Allow-Headers\":$ALLOWED_HEADERS}" \
    --region "$REGION" 2>/dev/null || echo "    (already exists)"
  
  echo "  ✅ Done"
done

echo ""
echo "============================================================"
echo "Processed $RESOURCE_COUNT resources"
echo "============================================================"

# Redeploy API
echo ""
echo "Redeploying API Gateway to stage: $STAGE"
DEPLOYMENT_ID=$(aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --stage-name "$STAGE" \
  --description "Fix CORS - Add OPTIONS methods" \
  --region "$REGION" \
  --query 'id' \
  --output text)

echo "✅ Deployment complete! Deployment ID: $DEPLOYMENT_ID"
echo ""
echo "============================================================"
echo "✅ All resources updated with CORS support"
echo "============================================================"
echo ""
echo "Next steps:"
echo "1. Wait 1-2 minutes for changes to propagate"
echo "2. Test at: https://app.fullbor.ai"
echo "3. Hard refresh browser (Cmd+Shift+R or Ctrl+Shift+R)"
echo ""
