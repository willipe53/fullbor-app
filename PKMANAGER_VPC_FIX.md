# PKManager VPC Networking Fix

## Problem

The PKManager Lambda was timing out (504 error after 29 seconds) when trying to manage the EC2 position keeper instance.

## Root Cause

The Lambda runs in a VPC and was missing VPC endpoints for:

- **EC2 API** - needed for `DescribeInstances`, `StartInstances`, `StopInstances`
- **SSM API** - needed for `SendCommand`, `GetCommandInvocation`

Without these endpoints, the Lambda couldn't reach AWS services and would hang until timeout.

## Solution

Created two Interface VPC endpoints:

```bash
# EC2 API endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-05694661cd35645a5 \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.us-east-2.ec2 \
  --subnet-ids subnet-0192ac9f05f3f701c subnet-057c823728ef78117 subnet-0dc1aed15b037a940 \
  --security-group-ids sg-0a5a4038d1f4307f2

# SSM API endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-05694661cd35645a5 \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.us-east-2.ssm \
  --subnet-ids subnet-0192ac9f05f3f701c subnet-057c823728ef78117 subnet-0dc1aed15b037a940 \
  --security-group-ids sg-0a5a4038d1f4307f2
```

## Results

- **Before**: 504 timeout after 29 seconds
- **After**: 200 OK in 4.5 seconds ✅

## VPC Endpoints Summary

The VPC now has the following endpoints:

- ✅ `com.amazonaws.us-east-2.secretsmanager` - available
- ✅ `com.amazonaws.us-east-2.s3` - available
- ✅ `com.amazonaws.us-east-2.sqs` - available
- ✅ `com.amazonaws.us-east-2.ec2` - available (newly created: `vpce-0fa79b4f184f68d2f`)
- ✅ `com.amazonaws.us-east-2.ssm` - available (newly created: `vpce-02ea4a080445f92d7`)

## IAM Permissions Added

Also added the `PKManagerEC2SSMAccess` policy to `FullBorLambdaAPIRole` with these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2InstanceManagement",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:DescribeInstanceStatus"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SSMCommandExecution",
      "Effect": "Allow",
      "Action": [
        "ssm:SendCommand",
        "ssm:GetCommandInvocation",
        "ssm:ListCommands",
        "ssm:ListCommandInvocations"
      ],
      "Resource": [
        "arn:aws:ec2:us-east-2:316490106381:instance/i-01f5d046c86e4f36e",
        "arn:aws:ssm:us-east-2:*:document/AWS-RunShellScript",
        "arn:aws:ssm:us-east-2:316490106381:*"
      ]
    }
  ]
}
```

## Testing

```bash
# Status endpoint (now works!)
./scripts/test-api.py GET https://api.fullbor.ai/v2/position-keeper/status

# Response:
{
  "lock_status": "idle",
  "instance_status": {
    "ec2_state": "running",
    "service_state": "unknown",
    "overall_status": "running"
  },
  "instance": null,
  "expires_at": null
}
```

## Next Steps

- Test `/position-keeper/start` endpoint
- Test `/position-keeper/stop` endpoint
- Consider optimizing SSM service status checks (currently timing out gracefully)
