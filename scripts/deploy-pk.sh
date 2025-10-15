#!/bin/bash

# Deploys positionkeeper script and service to EC2 instance

user="ec2-user"
host="3.20.161.196"
directory="/home/ec2-user/fullbor-pk"
service_file="../position_keeper/config/positionkeeper.service"
source_dir="../position_keeper"

echo "============================================"
echo "Deploying Position Keeper to $host"
echo "============================================"

# Create directory on remote if it doesn't exist
echo "Creating remote directory..."
ssh "$user@$host" "mkdir -p $directory"

# Copy all root-level files (excluding directories)
echo "Copying root-level files..."
cd $source_dir
for file in *.py *.md; do
    if [ -f "$file" ]; then
        echo "  - Copying $file..."
        scp "$file" "$user@$host:$directory/"
        if [ $? -ne 0 ]; then
            echo "ERROR: Failed to copy $file"
            exit 1
        fi
    fi
done
cd scripts

# Make Python scripts executable
echo "Making Python scripts executable..."
ssh "$user@$host" "chmod +x $directory/*.py"

# Copy service file
echo "Copying systemd service file..."
scp "$service_file" "$user@$host:/tmp/positionkeeper.service"
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to copy service file"
    exit 1
fi

# Install service file and restart
echo "Installing and restarting service..."
ssh "$user@$host" "sudo mv /tmp/positionkeeper.service /etc/systemd/system/ && \
    sudo systemctl daemon-reload && \
    sudo systemctl restart positionkeeper && \
    sudo systemctl status positionkeeper --no-pager"

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================"
    echo "✓ Successfully deployed to $host"
    echo "============================================"
    echo ""
    echo "To view logs, run:"
    echo "  ./scripts/tailpk.sh"
    echo "  OR"
    echo "  ssh $user@$host 'sudo tail -f /var/log/positionkeeper.log'"
else
    echo "ERROR: Failed to restart service"
    exit 1
fi
