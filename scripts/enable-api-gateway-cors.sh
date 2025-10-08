#!/bin/bash

# Enable CORS on API Gateway by adding OPTIONS methods
# and configuring gateway responses

set -e

API_ID="nkdrongg4e"  # Your API Gateway REST API ID
REGION="us-east-2"
ALLOWED_ORIGIN="https://app.fullbor.ai"
ALLOWED_HEADERS="Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id"
ALLOWED_METHODS="GET,POST,PUT,DELETE,OPTIONS"

echo "============================================================"
echo "Enabling CORS for API Gateway: $API_ID"
echo "Allowed Origin: $ALLOWED_ORIGIN"
echo "============================================================"

# Step 1: Configure Gateway Responses for 4XX and 5XX errors
echo ""
echo "Step 1: Configuring Gateway Responses..."

# Update DEFAULT_4XX response
echo "  Updating DEFAULT_4XX gateway response..."
aws apigateway put-gateway-response \
    --rest-api-id $API_ID \
    --response-type DEFAULT_4XX \
    --response-parameters "{\"gatewayresponse.header.Access-Control-Allow-Origin\":\"'$ALLOWED_ORIGIN'\",\"gatewayresponse.header.Access-Control-Allow-Headers\":\"'$ALLOWED_HEADERS'\",\"gatewayresponse.header.Access-Control-Allow-Methods\":\"'$ALLOWED_METHODS'\"}" \
    --region $REGION \
    --no-cli-pager > /dev/null 2>&1

echo "  ✅ DEFAULT_4XX configured"

# Update DEFAULT_5XX response
echo "  Updating DEFAULT_5XX gateway response..."
aws apigateway put-gateway-response \
    --rest-api-id $API_ID \
    --response-type DEFAULT_5XX \
    --response-parameters "{\"gatewayresponse.header.Access-Control-Allow-Origin\":\"'$ALLOWED_ORIGIN'\",\"gatewayresponse.header.Access-Control-Allow-Headers\":\"'$ALLOWED_HEADERS'\",\"gatewayresponse.header.Access-Control-Allow-Methods\":\"'$ALLOWED_METHODS'\"}" \
    --region $REGION \
    --no-cli-pager > /dev/null 2>&1

echo "  ✅ DEFAULT_5XX configured"

# Step 2: Add OPTIONS methods to all resources
echo ""
echo "Step 2: Adding OPTIONS methods to all resources..."

# Get all resources
RESOURCES=$(aws apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[*].[id,path]' \
    --output text)

RESOURCE_COUNT=0
OPTIONS_ADDED=0

while IFS=$'\t' read -r RESOURCE_ID RESOURCE_PATH; do
    RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
    
    # Skip root resource
    if [ "$RESOURCE_PATH" = "/" ]; then
        continue
    fi
    
    echo ""
    echo "  Processing: $RESOURCE_PATH (ID: $RESOURCE_ID)"
    
    # Check if OPTIONS method already exists
    OPTIONS_EXISTS=$(aws apigateway get-method \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --region $REGION \
        2>/dev/null || echo "NOT_FOUND")
    
    if [ "$OPTIONS_EXISTS" = "NOT_FOUND" ]; then
        echo "    Creating OPTIONS method..."
        
        # Create OPTIONS method (no auth required)
        aws apigateway put-method \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method OPTIONS \
            --authorization-type NONE \
            --region $REGION \
            --no-cli-pager > /dev/null 2>&1
        
        # Create method response for 200
        aws apigateway put-method-response \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method OPTIONS \
            --status-code 200 \
            --response-parameters "method.response.header.Access-Control-Allow-Headers=false,method.response.header.Access-Control-Allow-Methods=false,method.response.header.Access-Control-Allow-Origin=false" \
            --region $REGION \
            --no-cli-pager > /dev/null 2>&1
        
        # Create MOCK integration
        aws apigateway put-integration \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method OPTIONS \
            --type MOCK \
            --request-templates '{"application/json":"{\"statusCode\": 200}"}' \
            --region $REGION \
            --no-cli-pager > /dev/null 2>&1
        
        # Create integration response with CORS headers
        aws apigateway put-integration-response \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method OPTIONS \
            --status-code 200 \
            --response-parameters "{\"method.response.header.Access-Control-Allow-Headers\":\"'$ALLOWED_HEADERS'\",\"method.response.header.Access-Control-Allow-Methods\":\"'$ALLOWED_METHODS'\",\"method.response.header.Access-Control-Allow-Origin\":\"'$ALLOWED_ORIGIN'\"}" \
            --region $REGION \
            --no-cli-pager > /dev/null 2>&1
        
        echo "    ✅ OPTIONS method added"
        OPTIONS_ADDED=$((OPTIONS_ADDED + 1))
    else
        echo "    ℹ️  OPTIONS method already exists"
    fi
    
done <<< "$RESOURCES"

echo ""
echo "============================================================"
echo "Summary:"
echo "  Resources processed: $RESOURCE_COUNT"
echo "  OPTIONS methods added: $OPTIONS_ADDED"
echo "============================================================"

# Step 3: Deploy to v2 stage
echo ""
echo "Step 3: Deploying API to v2 stage..."
DEPLOYMENT_ID=$(aws apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name v2 \
    --description "Enable CORS - Add OPTIONS methods and gateway responses" \
    --region $REGION \
    --query 'id' \
    --output text)

echo "✅ Deployment complete! Deployment ID: $DEPLOYMENT_ID"

echo ""
echo "============================================================"
echo "✅ CORS configuration complete!"
echo "============================================================"
echo ""
echo "API URL: https://api.fullbor.ai/v2"
echo "Test your app at: https://app.fullbor.ai"
echo ""
echo "If you still see CORS errors:"
echo "1. Clear browser cache (hard refresh: Cmd+Shift+R)"
echo "2. Check browser console for specific error messages"
echo "3. Test with: curl -X OPTIONS https://api.fullbor.ai/v2/users -v"
echo ""

