import json
import boto3
import os
import time
from datetime import datetime, timedelta, timezone
from botocore.exceptions import ClientError
from typing import Dict, Any, Optional
import cors_helper


def get_instance_status(instance_id):
    """
    Check the status of the EC2 instance.

    Returns a dict with:
    - ec2_state: The EC2 instance state (running, stopped, pending, stopping, etc.)
    - overall_status: Same as ec2_state

    Note: The position keeper service runs via systemctl at boot.
    Service logs are available at CloudWatch log group: /aws/ec2/positionkeeper
    """
    if not instance_id:
        return {
            'ec2_state': 'unknown',
            'service_state': 'unknown',
            'overall_status': 'unknown'
        }

    try:
        ec2_client = boto3.client('ec2', region_name='us-east-2')

        # Get EC2 instance state
        response = ec2_client.describe_instances(InstanceIds=[instance_id])
        if not response['Reservations']:
            return {
                'ec2_state': 'not_found',
                'service_state': 'unknown',
                'overall_status': 'error'
            }

        instance = response['Reservations'][0]['Instances'][0]
        # running, stopped, pending, stopping, etc.
        ec2_state = instance['State']['Name']

        # Service status is managed via systemctl at boot
        # Logs are available at /aws/ec2/positionkeeper
        return {
            'ec2_state': ec2_state,
            'overall_status': ec2_state
        }

    except Exception as e:
        return {
            'ec2_state': 'error',
            'overall_status': 'error',
            'error_message': str(e)
        }


def start_instance(instance_id):
    """
    Start the EC2 instance (non-blocking).

    Returns a dict with:
    - started: Boolean indicating if instance was started
    - message: Status message
    - current_state: Current EC2 state
    """
    if not instance_id:
        raise Exception("Instance ID not provided")

    # First check if already running
    status = get_instance_status(instance_id)

    if status['ec2_state'] in ['running', 'pending']:
        return {
            'started': False,
            'message': f'Position Keeper instance is already {status["ec2_state"]}',
            'current_state': status['ec2_state']
        }

    try:
        ec2_client = boto3.client('ec2', region_name='us-east-2')

        # Start the instance (non-blocking)
        print(f"Starting EC2 instance {instance_id}...")
        ec2_client.start_instances(InstanceIds=[instance_id])

        return {
            'started': True,
            'message': 'Position Keeper instance start initiated. The instance and service will be ready in ~1-2 minutes.',
            'current_state': 'pending'
        }

    except Exception as e:
        raise Exception(f"Failed to start instance: {str(e)}")


def release_instance(instance_id):
    """
    Stop the EC2 instance.

    Returns a dict with:
    - stopped: Boolean indicating if instance was stopped
    - message: Status message
    """
    if not instance_id:
        raise Exception("Instance ID not provided")

    try:
        ec2_client = boto3.client('ec2', region_name='us-east-2')

        # Check current state
        status = get_instance_status(instance_id)

        if status['ec2_state'] in ['stopped', 'stopping']:
            return {
                'stopped': False,
                'message': f"Instance is already {status['ec2_state']}"
            }

        # Stop the instance
        print(f"Stopping EC2 instance {instance_id}...")
        ec2_client.stop_instances(InstanceIds=[instance_id])

        return {
            'stopped': True,
            'message': 'Position Keeper instance stop initiated'
        }

    except Exception as e:
        raise Exception(f"Failed to stop instance: {str(e)}")


def lambda_handler(event, context):
    """
    Handle Position Keeper commands (start/stop/status).

    GET /position-keeper/status:
        - Returns the current status of the Position Keeper EC2 instance

    POST /position-keeper/start:
        - Starts the EC2 instance if it's not running

    POST /position-keeper/stop:
        - Stops the EC2 instance if it's running
    """

    # Extract current user from headers (required by OpenAPI spec)
    current_user_id = event.get('headers', {}).get(
        'X-Current-User-Id', 'system')

    # Determine command from the URL path
    path = event.get('path', '')
    http_method = event.get('httpMethod', '')
    path_parameters = event.get('pathParameters', {}) or {}

    if '/start' in path:
        command = 'start'
    elif path.endswith('/stop'):
        command = 'stop'
    elif path.endswith('/status'):
        command = 'status'
    else:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid endpoint. Use /position-keeper/start | stop | status"}),
            "headers": cors_helper.get_cors_headers()
        }

    try:
        # Get instance ID from secret
        secrets_client = boto3.client(
            'secretsmanager', region_name='us-east-2')
        secret_arn = os.environ.get('SECRET_ARN')
        if not secret_arn:
            raise Exception("SECRET_ARN environment variable not set")

        response = secrets_client.get_secret_value(SecretId=secret_arn)
        secret = json.loads(response['SecretString'])
        instance_id = secret.get('PK_INSTANCE')

        if not instance_id:
            raise Exception("PK_INSTANCE not found in secrets")

        if command == 'status':
            # Get the instance status
            instance_status = get_instance_status(instance_id)

            response = {
                "instance_id": instance_id,
                "ec2_state": instance_status['ec2_state'],
                "overall_status": instance_status['overall_status'],
                "note": "Service logs available at CloudWatch: /aws/ec2/positionkeeper"
            }

            return {
                "statusCode": 200,
                "body": json.dumps(response),
                "headers": cors_helper.get_cors_headers()
            }

        elif command == 'stop':
            # Check if Position Keeper is running
            instance_status = get_instance_status(instance_id)

            # Stop the instance if it's running
            if instance_status['ec2_state'] in ['running', 'pending']:
                stop_result = release_instance(instance_id)
                response = {
                    "message": stop_result['message'],
                    "stopped": stop_result['stopped'],
                    "previous_state": instance_status['ec2_state']
                }
            else:
                response = {
                    "message": "Position Keeper was not running",
                    "stopped": False,
                    "current_state": instance_status['ec2_state']
                }

            return {
                "statusCode": 200,
                "body": json.dumps(response),
                "headers": cors_helper.get_cors_headers()
            }

        elif command == 'start':
            # Check current instance status
            instance_status = get_instance_status(instance_id)

            # Check if already running or starting
            if instance_status['ec2_state'] in ['running', 'pending']:
                return {
                    "statusCode": 409,
                    "body": json.dumps({
                        "error": f"Position Keeper is already {instance_status['ec2_state']}",
                        "current_state": instance_status['ec2_state']
                    }),
                    "headers": cors_helper.get_cors_headers()
                }

            # Start the instance
            print("\nStarting position keeper instance...")
            start_result = start_instance(instance_id)

            return {
                "statusCode": 201,
                "body": json.dumps({
                    "message": start_result['message'],
                    "started": start_result['started'],
                    "current_state": start_result['current_state'],
                    "note": "Use GET /position-keeper/status to monitor startup progress"
                }),
                "headers": cors_helper.get_cors_headers()
            }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"}),
            "headers": cors_helper.get_cors_headers()
        }
