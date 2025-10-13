# PKManager Lambda Implementation

## Overview

Renamed `PositionKeeper.py` to `PKManager.py` to better reflect its role as a **manager** for the EC2-based position keeper process.

The position keeper now runs as a Python script on EC2 instance `i-01f5d046c86e4f36e`, managed by systemctl at startup, with logs sent to `/aws/ec2/positionkeeper`.

## Implementation Details

### Three New Methods

#### 1. `get_instance_status(instance_id)`

Checks the status of both the EC2 instance and the position keeper service.

**Returns:**

- `ec2_state`: EC2 instance state (running, stopped, pending, etc.)
- `service_state`: systemd service state (active, inactive, failed, etc.)
- `overall_status`: Summary status (running, stopped, starting, error)

**How it works:**

1. Uses EC2 `describe_instances` to get instance state
2. If instance is running, uses SSM `send_command` to execute `sudo systemctl is-active positionkeeper`
3. Returns comprehensive status information

#### 2. `start_instance(instance_id)`

Starts the EC2 instance and verifies the position keeper service starts.

**Returns:**

- `started`: Boolean indicating if instance was started
- `message`: Status message
- `status`: Current status after operation

**How it works:**

1. Checks if instance is already running via `get_instance_status()`
2. If not running, calls EC2 `start_instances()`
3. Waits for instance to reach "running" state (max 2 minutes)
4. Waits 10 seconds for systemctl service to initialize
5. Verifies final status via `get_instance_status()`

#### 3. `release_instance(instance_id)`

Stops the EC2 instance.

**Returns:**

- `stopped`: Boolean indicating if instance was stopped
- `message`: Status message

**How it works:**

1. Checks current state
2. If not already stopped/stopping, calls EC2 `stop_instances()`

### Lambda Handler Updates

The `lambda_handler` function was updated to:

1. Retrieve `PK_INSTANCE` from AWS Secrets Manager at startup
2. Pass the actual instance ID to all three methods (not `lock_status['instance']`)
3. Store the instance ID in the lock when acquiring it
4. Return proper status codes (201 for successful start, 200 for status/stop)

## Configuration Requirements

### 1. AWS Secrets Manager

Add `PK_INSTANCE` to the secret referenced by `SECRET_ARN`:

```json
{
  "DB_HOST": "...",
  "DB_USER": "...",
  "DB_PASS": "...",
  "DATABASE": "...",
  "PK_INSTANCE": "i-01f5d046c86e4f36e"
}
```

### 2. IAM Role Permissions

The Lambda execution role (`FullBorLambdaAPIRole`) needs additional permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:StartInstances",
        "ec2:StopInstances"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:SendCommand", "ssm:GetCommandInvocation"],
      "Resource": [
        "arn:aws:ec2:us-east-2:316490106381:instance/i-01f5d046c86e4f36e",
        "arn:aws:ssm:us-east-2:*:document/AWS-RunShellScript"
      ]
    }
  ]
}
```

### 3. EC2 Instance Requirements

The EC2 instance must have:

- SSM Agent installed and running
- Instance profile with `AmazonSSMManagedInstanceCore` policy
- systemd service named `positionkeeper` configured to start at boot
- Logging configured to send to CloudWatch Logs group `/aws/ec2/positionkeeper`

## API Endpoints (Unchanged)

The OpenAPI paths remain unchanged:

- `POST /position-keeper/start` - Acquires lock and starts EC2 instance
- `POST /position-keeper/stop` - Releases lock and stops EC2 instance
- `GET /position-keeper/status` - Returns lock and instance status

## Deployment

1. **Update Secret in AWS Secrets Manager:**

   ```bash
   aws secretsmanager update-secret \
     --secret-id arn:aws:secretsmanager:us-east-2:316490106381:secret:PandaDbSecretCache-pdzjei \
     --secret-string '{"DB_HOST":"...","DB_USER":"...","DB_PASS":"...","DATABASE":"...","PK_INSTANCE":"i-01f5d046c86e4f36e"}'
   ```

2. **Update IAM Role with EC2 and SSM permissions** (see above)

3. **Deploy the Lambda:**

   ```bash
   python3 scripts/deploy-lambda.py lambdas/PKManager.py
   ```

4. **Delete old Lambda (after verifying PKManager works):**

   ```bash
   aws lambda delete-function --function-name PositionKeeper --region us-east-2
   ```

5. **Update API Gateway integrations:**
   ```bash
   python3 scripts/deploy-api-config.py
   ```

## Files Modified

- ✅ `lambdas/PositionKeeper.py` → `lambdas/PKManager.py` (renamed)
- ✅ `scripts/deploy-lambda.py` - Updated FUNCTION_SPECIFIC_LAYERS and handler_mapping
- ✅ `scripts/deploy-api-config.py` - Updated handler mappings and permissions list
- ✅ `scripts/tailpk.sh` - Updated to tail EC2 logs at `/aws/ec2/positionkeeper`

## Testing

After deployment, test the endpoints:

```bash
# Check status
curl -X GET https://api.fullbor.ai/v2/position-keeper/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Current-User-Id: $USER_ID"

# Start position keeper
curl -X POST https://api.fullbor.ai/v2/position-keeper/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Current-User-Id: $USER_ID"

# Stop position keeper
curl -X POST https://api.fullbor.ai/v2/position-keeper/stop \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Current-User-Id: $USER_ID"
```

## Log Monitoring

```bash
# Watch EC2 position keeper logs
./scripts/tailpk.sh

# Or directly:
awslogs get /aws/ec2/positionkeeper ALL --watch
```
