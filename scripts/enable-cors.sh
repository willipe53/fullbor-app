#!/bin/bash

# Enable CORS on API Gateway
# This script adds CORS headers to the API Gateway

API_ID="your-api-gateway-id"  # Update this with your API Gateway ID
REGION="us-east-2"
ALLOWED_ORIGIN="https://app.fullbor.ai"

echo "Enabling CORS for API Gateway: $API_ID"
echo "Allowed Origin: $ALLOWED_ORIGIN"

# Get the REST API ID if not provided
if [ "$API_ID" == "your-api-gateway-id" ]; then
    echo "Finding API Gateway ID for 'FullBor API'..."
    API_ID=$(aws apigateway get-rest-apis --region $REGION --query "items[?name=='FullBor API'].id" --output text)
    
    if [ -z "$API_ID" ]; then
        echo "❌ Could not find API Gateway. Please set API_ID manually."
        exit 1
    fi
    
    echo "✅ Found API Gateway ID: $API_ID"
fi

# Enable CORS on all resources
echo "Getting all resources..."
RESOURCES=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query 'items[*].[id,path]' --output text)

echo "$RESOURCES" | while read RESOURCE_ID RESOURCE_PATH; do
    echo ""
    echo "Processing resource: $RESOURCE_PATH (ID: $RESOURCE_ID)"
    
    # Check if OPTIONS method exists
    OPTIONS_EXISTS=$(aws apigateway get-method \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --region $REGION \
        2>/dev/null)
    
    if [ $? -ne 0 ]; then
        echo "  Adding OPTIONS method..."
        
        # Create OPTIONS method
        aws apigateway put-method \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method OPTIONS \
            --authorization-type NONE \
            --region $REGION \
            --no-cli-pager >/dev/null 2>&1
        
        # Create method response for OPTIONS
        aws apigateway put-method-response \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method OPTIONS \
            --status-code 200 \
            --response-parameters "method.response.header.Access-Control-Allow-Headers=false,method.response.header.Access-Control-Allow-Methods=false,method.response.header.Access-Control-Allow-Origin=false" \
            --region $REGION \
            --no-cli-pager >/dev/null 2>&1
        
        # Create integration
        aws apigateway put-integration \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method OPTIONS \
            --type MOCK \
            --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
            --region $REGION \
            --no-cli-pager >/dev/null 2>&1
        
        # Create integration response
        aws apigateway put-integration-response \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method OPTIONS \
            --status-code 200 \
            --response-parameters "{\"method.response.header.Access-Control-Allow-Headers\":\"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id'\",\"method.response.header.Access-Control-Allow-Methods\":\"'GET,POST,PUT,DELETE,OPTIONS'\",\"method.response.header.Access-Control-Allow-Origin\":\"'$ALLOWED_ORIGIN'\"}" \
            --region $REGION \
            --no-cli-pager >/dev/null 2>&1
        
        echo "  ✅ OPTIONS method added"
    else
        echo "  ℹ️  OPTIONS method already exists"
    fi
    
    # Add CORS headers to existing methods
    for METHOD in GET POST PUT DELETE; do
        METHOD_EXISTS=$(aws apigateway get-method \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method $METHOD \
            --region $REGION \
            2>/dev/null)
        
        if [ $? -eq 0 ]; then
            echo "  Updating $METHOD method response..."
            
            # Update method response to include CORS headers
            aws apigateway put-method-response \
                --rest-api-id $API_ID \
                --resource-id $RESOURCE_ID \
                --http-method $METHOD \
                --status-code 200 \
                --response-parameters "method.response.header.Access-Control-Allow-Origin=false" \
                --region $REGION \
                --no-cli-pager >/dev/null 2>&1
            
            # Update integration response to set CORS headers
            aws apigateway put-integration-response \
                --rest-api-id $API_ID \
                --resource-id $RESOURCE_ID \
                --http-method $METHOD \
                --status-code 200 \
                --response-parameters "{\"method.response.header.Access-Control-Allow-Origin\":\"'$ALLOWED_ORIGIN'\"}" \
                --region $REGION \
                --no-cli-pager >/dev/null 2>&1
            
            echo "  ✅ $METHOD method updated"
        fi
    done
done

echo ""
echo "Deploying API..."
aws apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name v2 \
    --description "Enable CORS" \
    --region $REGION

echo ""
echo "✅ CORS configuration complete!"
echo "Please test your app at https://app.fullbor.ai"

