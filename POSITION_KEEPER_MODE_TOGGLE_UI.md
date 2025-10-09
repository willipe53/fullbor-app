# Position Keeper Mode Toggle UI

**Date:** 2025-10-09  
**Feature:** Added mode toggle to TransactionsTable for Position Keeper

## Summary

Added a visual toggle button group to the TransactionsTable component that allows users to select between "Incremental" and "Full Refresh" modes before starting the Position Keeper. The toggle appears next to the "Run Position Keeper" button and defaults to "Incremental" mode.

## UI Changes

### TransactionsTable Component

**File:** `src/components/TransactionsTable.tsx`

#### New State

```typescript
const [positionKeeperMode, setPositionKeeperMode] = useState<
  "incremental" | "full-refresh"
>("incremental");
```

#### New UI Element

A `ToggleButtonGroup` with two options:

- **Incremental** (default)
- **Full Refresh**

**Location:** Appears to the left of the "Run Position Keeper" button

**Behavior:**

- Only visible when Position Keeper is **not running** (hidden when `isPollingActive === true`)
- Disabled while Position Keeper is starting or stopping
- Selection persists between start/stop cycles

#### Updated Tooltip

The info button tooltip now shows different messages based on selected mode:

- **Incremental:** "Start Incremental: Process only queued transactions"
- **Full Refresh:** "Start Full Refresh: Recalculates all positions from scratch (all transactions)"
- **When running:** "Stop the position keeper and cease processing"

#### Success Message Enhancement

When Position Keeper starts successfully, the success message now includes the mode:

```
"Position keeper started successfully (Incremental)"
"Position keeper started successfully (Full Refresh)"
```

## API Changes

### api.ts Updates

**File:** `src/services/api.ts`

#### Updated Function Signature

```typescript
export const startPositionKeeper = async (
  mode?: "incremental" | "full-refresh"
): Promise<{
  message: string;
  mode?: string;
  position_keeper_id?: number;
  sandbox_rows_created?: number;
}> => {
  const endpoint =
    mode === "full-refresh"
      ? "/position-keeper/start/full-refresh"
      : "/position-keeper/start";

  return apiCall(endpoint, { method: "POST" });
};
```

**Changes:**

1. Added optional `mode` parameter
2. Routes to different endpoints based on mode:
   - `"incremental"` or no mode → `/position-keeper/start`
   - `"full-refresh"` → `/position-keeper/start/full-refresh`
3. Enhanced return type to include mode and statistics

## Visual Design

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [New]                      [Incremental|Full Refresh] [Run...] ⓘ │
└─────────────────────────────────────────────────────────────────┘
```

### When Position Keeper is Running

```
┌─────────────────────────────────────────────────────────────────┐
│  [New]                                            [Stop...] ⓘ   │
└─────────────────────────────────────────────────────────────────┘
```

(Toggle is hidden during execution)

### Visual Details

- **Toggle buttons:** Small size, lowercase text (except first letter)
- **Height:** 32px to match button height
- **Spacing:** 1 unit gap between elements
- **Font size:** 0.8125rem (13px) for toggle buttons
- **Colors:** MUI default toggle button colors (blue when selected)

## User Flow

### Starting Position Keeper

1. User selects mode using toggle (defaults to "Incremental")
2. User clicks "Run Position Keeper"
3. Toggle disappears, button changes to "Stop Position Keeper"
4. Success message shows: "Position keeper started successfully (Incremental)" or "(Full Refresh)"

### Stopping Position Keeper

1. User clicks "Stop Position Keeper"
2. Button changes back to "Run Position Keeper"
3. Toggle reappears with last selected mode
4. Success message shows: "Position keeper stopped successfully"

## Mode Descriptions

### Incremental Mode (Default)

**Use for:**

- Regular transaction processing
- When only new transactions need to be processed
- Faster execution time

**What it does:**

- Only processes QUEUED transactions
- Updates positions incrementally

### Full Refresh Mode

**Use for:**

- First-time setup
- After data corrections
- When positions may be out of sync
- To verify position accuracy

**What it does:**

- Processes ALL transactions (QUEUED + PROCESSED)
- Recalculates all positions from scratch
- Takes longer but ensures accuracy

## Testing

### Visual Testing

1. Navigate to Transactions table
2. Verify toggle appears next to "Run Position Keeper" button
3. Click between "Incremental" and "Full Refresh" options
4. Verify toggle highlights selected option

### Functional Testing

#### Incremental Mode

```typescript
// Default mode
1. Ensure toggle is set to "Incremental"
2. Click "Run Position Keeper"
3. Check network tab: Should call POST /position-keeper/start
4. Verify success message includes "(Incremental)"
5. Verify toggle disappears while running
```

#### Full Refresh Mode

```typescript
1. Click "Full Refresh" on the toggle
2. Click "Run Position Keeper"
3. Check network tab: Should call POST /position-keeper/start/full-refresh
4. Verify success message includes "(Full Refresh)"
5. Verify toggle disappears while running
```

#### Mode Persistence

```typescript
1. Select "Full Refresh"
2. Click "Run Position Keeper"
3. Wait for completion or click "Stop"
4. Verify toggle reappears still showing "Full Refresh" selected
```

## Code Examples

### Using the API Function

```typescript
// Incremental mode (default)
await apiService.startPositionKeeper();
// or explicitly
await apiService.startPositionKeeper("incremental");

// Full Refresh mode
await apiService.startPositionKeeper("full-refresh");
```

### Response Handling

```typescript
const response = await apiService.startPositionKeeper("full-refresh");
console.log(response.mode); // "Full Refresh"
console.log(response.position_keeper_id); // 123
console.log(response.sandbox_rows_created); // 448
```

## Files Modified

1. ✅ `src/services/api.ts`

   - Updated `startPositionKeeper` function signature
   - Added mode parameter routing
   - Enhanced return type

2. ✅ `src/components/TransactionsTable.tsx`
   - Added `ToggleButton` and `ToggleButtonGroup` imports
   - Added `positionKeeperMode` state
   - Updated mutation to pass mode parameter
   - Added toggle UI component
   - Enhanced tooltips and success messages
   - Toggle visibility controlled by `isPollingActive` state

## Accessibility

- **Keyboard Navigation:** Toggle buttons are keyboard accessible (Tab to navigate, Space/Enter to select)
- **Visual Feedback:** Selected state is clearly indicated with color change
- **Tooltips:** Info button provides context for each mode
- **Disabled States:** Toggle is disabled during operation to prevent mode changes mid-execution

## Browser Compatibility

Works in all modern browsers that support:

- MUI ToggleButtonGroup component
- CSS Flexbox
- ES6+ JavaScript features

## Future Enhancements

Potential future improvements:

1. Add badge to show mode used in last run
2. Add statistics comparison (Incremental vs Full Refresh)
3. Save user's preferred mode to local storage
4. Add mode recommendation based on transaction count
5. Show estimated execution time for each mode

## Status

✅ **Complete** - Mode toggle is implemented and ready for use
