#!/bin/bash

# pk.sh <start|stop|status|restart> calls 
# /test-api.py POST https://api.fullbor.ai/v2/position-keeper/<start|stop|status>

action=$1

if [ "$action" == "start" ]; then
    ./test-api.py POST https://api.fullbor.ai/v2/position-keeper/start
elif [ "$action" == "stop" ]; then
    ./test-api.py POST https://api.fullbor.ai/v2/position-keeper/stop
elif [ "$action" == "status" ]; then
    ./test-api.py GET https://api.fullbor.ai/v2/position-keeper/status
elif [ "$action" == "restart" ]; then
    echo "Stopping position keeper..."
    ./test-api.py POST https://api.fullbor.ai/v2/position-keeper/stop
    echo ""
    echo "Waiting 5 seconds..."
    sleep 5
    echo ""
    echo "Starting position keeper..."
    ./test-api.py POST https://api.fullbor.ai/v2/position-keeper/start
else
    echo "Invalid action: $action"
    echo "Usage: $0 {start|stop|status|restart}"
    exit 1
fi

