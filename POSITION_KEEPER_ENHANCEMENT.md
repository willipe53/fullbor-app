# Position Keeper Enhancement - Step 1: Sandbox Row Generation

**Date:** 2025-10-09  
**Status:** Completed - Ready for Testing

## Overview

Enhanced the Position Keeper to generate position sandbox rows as the first step toward Full Refresh position calculation. This lays the foundation for calculating positions from transactions.

## What Was Added

### 1. Database Table: `position_sandbox`

**File:** `database/migrations/create_position_sandbox.sql`

A new table to hold intermediate position calculations before committing to the `positions` table:

```sql
CREATE TABLE `position_sandbox` (
  `position_sandbox_id` int NOT NULL AUTO_INCREMENT,
  `position_date` date NOT NULL,
  `position_type_id` int NOT NULL,
  `portfolio_entity_id` int NOT NULL,
  `instrument_entity_id` int DEFAULT NULL,
  `share_amount` decimal(20,8) DEFAULT 0,
  `market_value` decimal(20,4) DEFAULT 0,
  `position_keeper_id` int NOT NULL,
  PRIMARY KEY (`position_sandbox_id`),
  -- Foreign keys and indexes...
)
```

**Migration:** Run this to create the table:

```bash
mysql -u [username] -p fullbor < database/migrations/create_position_sandbox.sql
```

### 2. New Functions in `PositionKeeper.py`

#### `create_position_keeper_record(connection, lock_id, holder, expires_at)`

**Lines:** 205-231

Creates a tracking record in the `position_keepers` table for each Position Keeper run.

**Returns:** `position_keeper_id` (int) - Used to tag all sandbox rows for this run

#### `generate_sandbox_rows(connection, position_keeper_id, mode="Full Refresh")`

**Lines:** 234-371

Generates the complete set of position sandbox rows needed for Full Refresh mode.

**What it does:**

1. Finds the min and max dates from all transactions (trade_date and settle_date)
2. Gets all unique combinations of:
   - `(portfolio_entity_id, instrument_entity_id)` from transactions
   - `(contra_entity_id, instrument_entity_id)` from transactions
3. Clears any existing sandbox data for this `position_keeper_id`
4. Generates rows for:
   - **Every date** from min to max (inclusive)
   - **Every entity/instrument combination**
   - **Both position types:**
     - `position_type_id = 1` (Trade Date)
     - `position_type_id = 2` (Settle Date)
5. All rows start with `share_amount = 0` and `market_value = 0`

**Example Output:**

- Date range: 2025-09-28 to 2025-10-11 (14 days)
- Entity/Instrument combinations: 16
- **Total rows created: 14 days × 16 combinations × 2 position types = 448 rows**

**SQL Optimization:**
Uses a single bulk INSERT with CROSS JOIN to generate all rows efficiently, rather than Python loops.

### 3. Integration into `lambda_handler`

**Lines:** 770-785

The 'start' command now:

1. Acquires lock
2. **Creates position_keeper record** ✅ NEW
3. Loads caches
4. **Generates sandbox rows** ✅ NEW
5. Processes SQS messages
6. Cleans up orphans
7. Releases lock

**Response includes:**

```json
{
  "message": "Position Keeper process completed",
  "mode": "Full Refresh",
  "position_keeper_id": 123,
  "sandbox_rows_created": 448,
  "statistics": {...},
  "cleanup": {...}
}
```

## API Endpoints

### Incremental Mode (Default)

```bash
POST /position-keeper/start
```

- Only processes QUEUED transactions
- Updates positions incrementally
- Faster for regular operations

### Full Refresh Mode

```bash
POST /position-keeper/start/full-refresh
```

- Processes ALL transactions (QUEUED + PROCESSED)
- Recalculates all positions from scratch
- More reliable, ensures accuracy
- Use when positions may be out of sync

## Testing

### Test the New Functionality

```bash
# 1. Create the position_sandbox table
mysql -u your_user -p fullbor < database/migrations/create_position_sandbox.sql

# 2. Deploy the updated Lambda
python3 scripts/deploy-lambda.py lambdas/PositionKeeper.py

# 3a. Start the Position Keeper in Incremental mode (default)
curl -X POST https://api.fullbor.ai/v2/position-keeper/start \
  -H "X-Current-User-Id: your-user-id"

# 3b. OR Start in Full Refresh mode
curl -X POST https://api.fullbor.ai/v2/position-keeper/start/full-refresh \
  -H "X-Current-User-Id: your-user-id"

# 4. Check the sandbox rows were created
mysql -u your_user -p fullbor -e "
SELECT
  COUNT(*) as total_rows,
  MIN(position_date) as min_date,
  MAX(position_date) as max_date,
  COUNT(DISTINCT portfolio_entity_id) as portfolios,
  COUNT(DISTINCT instrument_entity_id) as instruments
FROM position_sandbox;
"

# 5. View sample rows
mysql -u your_user -p fullbor -e "
SELECT * FROM position_sandbox
ORDER BY position_date, portfolio_entity_id, instrument_entity_id, position_type_id
LIMIT 10;
"
```

### Expected Results

For a database with:

- Date range: 2025-09-28 to 2025-10-11 (14 days)
- 16 unique entity/instrument combinations
- 2 position types

You should see:

- **448 rows** in `position_sandbox` (14 × 16 × 2)
- All `share_amount` values = 0
- All `market_value` values = 0
- Same `position_keeper_id` for all rows from one run

## What's Next

### Step 2: Position Math (Not Yet Implemented)

The next enhancement will:

1. Read transaction data
2. Apply position keeping rules from transaction types
3. Update the sandbox rows with actual share_amount and market_value
4. Copy completed positions from `position_sandbox` to `positions` table

### Current Behavior

Right now, the Position Keeper:

- ✅ Creates all needed sandbox rows (zeroed out)
- ⏭️ Processes SQS messages (but doesn't update positions yet)
- ✅ Marks transactions as PROCESSED
- ✅ Cleans up orphans

### Future Behavior

After Step 2, it will:

- ✅ Create all needed sandbox rows (zeroed out)
- ✅ Apply transaction effects to update positions
- ✅ Copy final positions to `positions` table
- ✅ Mark transactions as PROCESSED
- ✅ Clean up orphans

## Files Modified

1. ✅ `database/migrations/create_position_sandbox.sql` - Created
2. ✅ `lambdas/PositionKeeper.py` - Enhanced
   - Added `create_position_keeper_record()` function
   - Added `generate_sandbox_rows()` function
   - Integrated into `lambda_handler` 'start' command

## Architecture Notes

### Why position_sandbox?

The sandbox table allows us to:

1. **Calculate positions without affecting production** - All work is done in sandbox first
2. **Rollback on errors** - If position calculation fails, we can discard sandbox and start over
3. **Audit trail** - Each `position_keeper_id` represents a complete position calculation run
4. **Testing** - Easy to compare sandbox results before committing to `positions` table

### Full Refresh vs Incremental

**Full Refresh** (Current Implementation):

- Looks at ALL transactions (QUEUED + PROCESSED)
- Recalculates all positions from scratch
- More reliable, catches any missed updates
- Takes longer but ensures accuracy

**Incremental** (Future):

- Only looks at QUEUED transactions
- Updates positions incrementally
- Faster for small updates
- Requires reliable position history

## Status

✅ **Step 1 Complete** - Sandbox row generation is working and ready for testing
⏳ **Step 2 Pending** - Position math calculations (coming next)
