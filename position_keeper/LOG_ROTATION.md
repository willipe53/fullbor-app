# Position Keeper Log Rotation

## Problem

The Position Keeper log file (`/var/log/positionkeeper.log`) occasionally gets stuck, preventing new logs from being written to disk or CloudWatch. This happens when:

- The EC2 instance restarts
- The systemd service restarts
- File handles become stale

## Solution

We've implemented a **three-layered log rotation strategy**:

### 1. Startup Rotation (Primary)

**When**: Every time the Position Keeper service starts  
**What**: The `rotate-log.sh` script runs before the Position Keeper starts  
**How**:

- Moves the current log to `.log.1`
- Rotates existing backups (`.log.1` → `.log.2`, etc.)
- Keeps the last 5 backups
- Creates a fresh log file with correct permissions

**Implementation**: `ExecStartPre` in the systemd service file

### 2. Automatic Rotation (Secondary)

**When**: Daily OR when log reaches 50MB  
**What**: `logrotate` handles automatic rotation  
**How**:

- Rotates daily or at 50MB (whichever comes first)
- Keeps 7 rotated logs
- Compresses old logs (except the most recent)
- Uses `copytruncate` to avoid interrupting the running process

**Implementation**: `/etc/logrotate.d/positionkeeper`

### 3. Manual Rotation (Emergency)

**When**: If logs are stuck and you need immediate recovery  
**What**: SSH to the server and manually truncate/rotate  
**How**:

```bash
# Quick fix (truncate only)
ssh ec2-user@3.20.161.196 'sudo truncate -s 0 /var/log/positionkeeper.log && sudo systemctl restart positionkeeper'

# OR manually run the rotation script
ssh ec2-user@3.20.161.196 'sudo /home/ec2-user/fullbor-pk/rotate-log.sh && sudo systemctl restart positionkeeper'
```

## Files

### `/home/ec2-user/fullbor-pk/rotate-log.sh`

- Rotation script that runs on service start
- Moves logs to numbered backups (`.log.1`, `.log.2`, etc.)
- Creates fresh log file with proper permissions

### `/etc/systemd/system/positionkeeper.service`

- Systemd service definition
- Contains `ExecStartPre=+/home/ec2-user/fullbor-pk/rotate-log.sh`
- The `+` prefix runs the script with root privileges

### `/etc/logrotate.d/positionkeeper`

- Logrotate configuration
- Handles time-based and size-based rotation
- Compresses old logs to save space

## Deployment

The deployment script (`scripts/deploy-pk.sh`) automatically:

1. Copies `rotate-log.sh` to the EC2 instance
2. Makes it executable
3. Installs the updated systemd service with `ExecStartPre`
4. Installs the logrotate configuration
5. Restarts the service (triggering the rotation)

## Verification

### Check rotation worked

```bash
ssh ec2-user@3.20.161.196 'ls -lh /var/log/positionkeeper.log*'
```

Expected output:

```
/var/log/positionkeeper.log     <- Current log (fresh)
/var/log/positionkeeper.log.1   <- Previous log (rotated on startup)
/var/log/positionkeeper.log.2.gz <- Older compressed logs (from logrotate)
```

### Check service is using rotation

```bash
ssh ec2-user@3.20.161.196 'systemctl status positionkeeper'
```

Look for:

```
Process: XXXX ExecStartPre=/home/ec2-user/fullbor-pk/rotate-log.sh (code=exited, status=0/SUCCESS)
```

### View logs

```bash
# Local file
ssh ec2-user@3.20.161.196 'tail -f /var/log/positionkeeper.log'

# CloudWatch (using the updated tailpk.sh)
./scripts/tailpk.sh

# AWS CLI
aws logs tail /aws/ec2/positionkeeper --follow --format short
```

## Benefits

1. ✅ **Automatic**: Rotates on every service start
2. ✅ **Safe**: Creates backups before rotating
3. ✅ **Space-efficient**: Compresses old logs
4. ✅ **Configurable**: Easy to adjust retention and size limits
5. ✅ **Zero-downtime**: Uses `copytruncate` to avoid interrupting the service
6. ✅ **No manual intervention**: Works automatically on instance start/stop cycles
