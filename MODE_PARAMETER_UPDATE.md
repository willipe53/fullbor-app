# Position Keeper Mode Parameter Update

**Date:** 2025-10-09  
**Feature:** Added mode parameter to Position Keeper API

## Summary

Added the ability to specify whether Position Keeper should run in "Full Refresh" or "Incremental" mode via the API endpoint path.

## Changes Made

### 1. OpenAPI Specification (`api-config/openapi.yaml`)

Added new endpoint with mode parameter:

**Original Endpoint:**

```
POST /position-keeper/start
```

**New Endpoints:**

```
POST /position-keeper/start                  # Incremental mode (default)
POST /position-keeper/start/full-refresh     # Full Refresh mode
```

**Path Parameter:**

- `mode`: Optional path parameter
- Allowed values: `full-refresh`
- If omitted, defaults to Incremental mode

### 2. Lambda Handler (`lambdas/PositionKeeper.py`)

**Lines 669-692:** Parse mode from path parameter

```python
path_parameters = event.get('pathParameters', {}) or {}
mode_param = path_parameters.get('mode', '').lower()

if mode_param == 'full-refresh':
    mode = 'Full Refresh'
else:
    mode = 'Incremental'
```

**Line 787:** Log the mode being used

```python
print(f"Position Keeper Mode: {mode}")
```

**Line 803-804:** Pass mode to generate_sandbox_rows

```python
sandbox_rows = generate_sandbox_rows(
    connection, position_keeper_id, mode=mode)
```

**Line 826:** Include mode in response

```python
response = {
    "message": "Position Keeper process completed",
    "mode": mode,  # ← NEW
    "position_keeper_id": position_keeper_id,
    ...
}
```

### 3. Documentation Updates

Updated `POSITION_KEEPER_ENHANCEMENT.md` to include:

- API endpoint documentation for both modes
- Usage examples
- Mode descriptions

## Mode Behavior

### Incremental Mode (Default)

**Endpoint:** `POST /position-keeper/start`

- Only processes **QUEUED** transactions
- Updates positions incrementally from previous state
- Faster execution
- Best for regular operations

**When to use:**

- Normal transaction processing
- When you know all previous transactions were processed correctly
- Regular scheduled runs

### Full Refresh Mode

**Endpoint:** `POST /position-keeper/start/full-refresh`

- Processes **ALL** transactions (QUEUED + PROCESSED)
- Recalculates all positions from scratch
- Longer execution time
- More reliable

**When to use:**

- First-time setup
- After data corrections
- When positions may be out of sync
- To verify position accuracy

## Usage Examples

### Start Incremental Mode

```bash
curl -X POST https://api.fullbor.ai/v2/position-keeper/start \
  -H "X-Current-User-Id: your-user-id"
```

**Response:**

```json
{
  "message": "Position Keeper process completed",
  "mode": "Incremental",
  "position_keeper_id": 123,
  "sandbox_rows_created": 50,
  "statistics": {
    "total_messages": 5,
    "successful": 5,
    "failed": 0
  },
  "cleanup": {
    "orphaned_transactions_marked_unknown": 0
  }
}
```

### Start Full Refresh Mode

```bash
curl -X POST https://api.fullbor.ai/v2/position-keeper/start/full-refresh \
  -H "X-Current-User-Id: your-user-id"
```

**Response:**

```json
{
  "message": "Position Keeper process completed",
  "mode": "Full Refresh",
  "position_keeper_id": 124,
  "sandbox_rows_created": 448,
  "statistics": {
    "total_messages": 5,
    "successful": 5,
    "failed": 0
  },
  "cleanup": {
    "orphaned_transactions_marked_unknown": 0
  }
}
```

## CloudWatch Logs

You'll now see mode information in the logs:

```
Lock acquired by aws/lambda/PositionKeeper:abc123
Position Keeper Mode: Full Refresh

=== Generating Position Sandbox Rows (Mode: Full Refresh) ===
Step 1: Finding date range from transactions...
Date range: 2025-09-28 to 2025-10-11
Step 2: Finding unique entity/instrument combinations...
Found 16 entity/instrument combinations
...
```

## Testing

### Test Both Modes

```bash
# Test Incremental mode
curl -X POST https://api.fullbor.ai/v2/position-keeper/start \
  -H "X-Current-User-Id: your-user-id" | jq '.mode'
# Should return: "Incremental"

# Test Full Refresh mode
curl -X POST https://api.fullbor.ai/v2/position-keeper/start/full-refresh \
  -H "X-Current-User-Id: your-user-id" | jq '.mode'
# Should return: "Full Refresh"
```

### Verify Sandbox Row Counts

Full Refresh should create more rows than Incremental (assuming Incremental has been run before):

```sql
-- After Full Refresh
SELECT COUNT(*) FROM position_sandbox WHERE position_keeper_id = 124;
-- Result: 448 rows (all dates × all entities × 2 position types)

-- After Incremental (if run after Full Refresh)
SELECT COUNT(*) FROM position_sandbox WHERE position_keeper_id = 125;
-- Result: Fewer rows (only dates with new/updated transactions)
```

## Deployment

```bash
# Deploy the updated Lambda
python3 scripts/deploy-lambda.py lambdas/PositionKeeper.py

# The API Gateway will automatically route:
# - /position-keeper/start → Incremental mode
# - /position-keeper/start/full-refresh → Full Refresh mode
```

## Files Modified

1. ✅ `api-config/openapi.yaml` - Added `/position-keeper/start/{mode}` endpoint
2. ✅ `lambdas/PositionKeeper.py` - Parse and use mode parameter
3. ✅ `POSITION_KEEPER_ENHANCEMENT.md` - Updated documentation

## Status

✅ **Complete** - Mode parameter is implemented and ready for use
