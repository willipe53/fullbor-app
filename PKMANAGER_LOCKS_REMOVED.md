# PKManager: Removed Lambda Locks

## Changes Made

Removed all references to the `lambda_locks` table from PKManager.py. The Position Keeper now relies solely on EC2 instance state to determine if it's running, rather than using a database lock as a global semaphore.

## What Was Removed

### 1. **Database Dependencies**

- Removed `pymysql` import
- Removed `get_db_connection()` function
- Removed database connection management

### 2. **Lock Functions**

- Removed `get_lock_status(connection, lock_id)` - checked lock table
- Removed `acquire_lock(connection, lock_id, instance, expires_at)` - created locks
- Removed `release_lock(connection, lock_id)` - deleted locks

### 3. **Lock Logic in Commands**

- **Status**: No longer checks `lambda_locks` table for lock status
- **Stop**: No longer releases locks, just stops the instance
- **Start**: No longer acquires locks, just starts the instance

## New Behavior

### Status Endpoint

**Before:**

```json
{
  "lock_status": "idle|running",
  "instance_status": {...},
  "instance": "i-xxx",
  "expires_at": "2025-10-13T19:17:55+00:00"
}
```

**After:**

```json
{
  "instance_id": "i-01f5d046c86e4f36e",
  "ec2_state": "running|stopped|pending|stopping",
  "service_state": "active|unknown|n/a",
  "overall_status": "running|stopped|starting"
}
```

### Stop Endpoint

**Before:**

```json
{
  "message": "Position Keeper stopped: Lock released, Position Keeper instance stop initiated",
  "instance_state": "running"
}
```

**After:**

```json
{
  "message": "Position Keeper instance stop initiated",
  "stopped": true,
  "previous_state": "running"
}
```

### Start Endpoint

**Before:**

- Checked lock table
- Acquired lock if available
- Failed with 409 if lock existed

**After:**

- Checks only EC2 instance state
- Starts if stopped
- Returns 409 if already running/pending

## Benefits

1. **Simpler Architecture**: No database dependency for state management
2. **Single Source of Truth**: EC2 instance state is the only state to check
3. **Fewer Dependencies**: Removed pymysql, smaller Lambda package (3071 vs 4128 bytes)
4. **No Lock Expiry Issues**: No need to manage lock timeouts
5. **Clearer Intent**: Status directly reflects actual EC2 state

## Files Modified

- ✅ `lambdas/PKManager.py` - Removed all lock and database code
- 📝 `database/full_database_schema.sql` - Contains lambda_locks table (historical reference only)
- 📝 `database/backup_schema.sql` - Contains lambda_locks table (historical reference only)

**Note**: The database schema files still reference `lambda_locks` for historical purposes, but the table has been dropped and is no longer used.

## Testing

All three endpoints tested successfully without locks:

```bash
# Status
GET /position-keeper/status
→ 200 OK (6.05s)
{
  "instance_id": "i-01f5d046c86e4f36e",
  "ec2_state": "running",
  "service_state": "unknown",
  "overall_status": "running"
}

# Stop
POST /position-keeper/stop
→ 200 OK (2.27s)
{
  "message": "Position Keeper instance stop initiated",
  "stopped": true,
  "previous_state": "running"
}

# Start
POST /position-keeper/start
→ 201 Created
{
  "message": "Position Keeper instance start initiated...",
  "started": true,
  "current_state": "pending"
}
```

## Migration Notes

Since `lambda_locks` has been dropped from the database, no migration is needed. The Lambda now operates independently of any database state for the Position Keeper.
