#!/bin/bash
# The position keeper now runs on EC2, not Lambda
# Use this to tail the EC2 position keeper logs (not the PKManager lambda)
aws logs tail /aws/ec2/positionkeeper --follow --format short
