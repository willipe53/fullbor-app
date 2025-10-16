#!/bin/bash

# pk.sh <start|stop|status|restart> calls 
# /test-api.py POST https://api.fullbor.ai/v2/position-keeper/<start|stop|status>

action=$1

if [ "$action" == "start" ]; then
    ./test-api.py POST https://api.fullbor.ai/v2/position-keeper/start
elif [ "$action" == "stop" ]; then
    ./test-api.py POST https://api.fullbor.ai/v2/position-keeper/stop
elif [ "$action" == "tail" ]; then
    aws logs tail /aws/ec2/positionkeeper --follow --no-cli-pager --since 1h --output text
elif [ "$action" == "ssh" ]; then
    ssh ec2-user@3.20.161.196
elif [ "$action" == "status" ]; then
    ./test-api.py GET https://api.fullbor.ai/v2/position-keeper/status
elif [ "$action" == "restart" ]; then
    echo "Restarting position keeper service..."
    ssh ec2-user@3.20.161.196 "sudo systemctl restart positionkeeper"
    echo "Position keeper service restarted"
else
    echo "Invalid action: $action"
    echo "Usage: $0 {start|stop|status|restart|tail|ssh}"
    exit 1
fi

