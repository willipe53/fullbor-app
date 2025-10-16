#!/bin/bash
# Rotate the Position Keeper log file on startup
# This prevents issues with stuck log files from previous instances

LOG_FILE="/var/log/positionkeeper.log"
MAX_BACKUPS=5

# Only rotate if the log file exists and has content
if [ -f "$LOG_FILE" ] && [ -s "$LOG_FILE" ]; then
    echo "Rotating Position Keeper log..."
    
    # Get timestamp for the rotated log
    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    
    # Rotate existing backups (keep last MAX_BACKUPS)
    for i in $(seq $((MAX_BACKUPS-1)) -1 1); do
        if [ -f "${LOG_FILE}.$i" ]; then
            mv "${LOG_FILE}.$i" "${LOG_FILE}.$((i+1))"
        fi
    done
    
    # Move current log to .1
    mv "$LOG_FILE" "${LOG_FILE}.1"
    
    # Create fresh log file with correct permissions
    touch "$LOG_FILE"
    chown ec2-user:ec2-user "$LOG_FILE"
    chmod 644 "$LOG_FILE"
    
    echo "Log rotated successfully. Backup: ${LOG_FILE}.1"
else
    # If log doesn't exist or is empty, just ensure it exists
    touch "$LOG_FILE"
    chown ec2-user:ec2-user "$LOG_FILE"
    chmod 644 "$LOG_FILE"
    echo "Created fresh log file: $LOG_FILE"
fi

