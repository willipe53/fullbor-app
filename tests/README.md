# API Tests

This directory contains comprehensive API test scripts and the test runner.

## Files

- `comprehensive-api-test.py` - Enhanced YAML-driven API test runner with authentication support
- `run-all-tests.py` - Script to run all YAML test files and capture output to a single file
- `client-groups-script.yaml` - Test script for client groups API lifecycle
- `entities-and-types-script.yaml` - Test script for entities and entity types API lifecycle
- `position-keeper-script.yaml` - Test script for position keeper API operations
- `transactions-and-types-script.yaml` - Test script for transactions and transaction types API lifecycle
- `users-and-invitations-script.yaml` - Test script for users and invitations API lifecycle
- `README.md` - This documentation

## Usage

All commands should be run from the `tests/` directory:

### Running All Tests

Run all YAML test files and capture output to a single file:

```bash
cd tests/
./run-all-tests.py
```

This will:

- Find all `*.yaml` files in the tests directory
- Run each with `--verbose` flag and `--no-export` (suppresses individual output files)
- Capture all output to a single timestamped file: `YYYYMMDDTHHMMSSall-tests-output.txt`
- Provide a summary of total tests passed/failed
- **No individual test output files are created** - only the combined file

### Running Individual Tests

### Basic Usage (Shows test progress by default)

```bash
cd tests/
./comprehensive-api-test.py client-groups-script.yaml
```

### Quiet Mode (Only failures and summary)

```bash
./comprehensive-api-test.py client-groups-script.yaml --quiet
```

### Verbose Mode (Full request/response details)

```bash
./comprehensive-api-test.py client-groups-script.yaml --verbose
```

### With Parallel Execution

```bash
./comprehensive-api-test.py client-groups-script.yaml --parallel 4
```

### Automatic Output Logging (Enabled by Default)

```bash
# Automatic logging of all output to timestamped text file (e.g., 20241001T142342testoutput.txt)
# Also exports structured JSON results (e.g., 20241001T142342testoutput.json)
./comprehensive-api-test.py client-groups-script.yaml

# Disable automatic output logging
./comprehensive-api-test.py client-groups-script.yaml --no-export
```

### Custom Authentication

```bash
# Override default credentials
./comprehensive-api-test.py client-groups-script.yaml --username user@example.com --password mypassword

# Override Cognito configuration
./comprehensive-api-test.py client-groups-script.yaml --user-pool-id us-east-2_ABC123 --client-id 1lntksiqrqhmjea6obrrrrnmh1 --region us-west-2
```

### Custom Base URL

```bash
# Use staging environment
./comprehensive-api-test.py client-groups-script.yaml --base-url https://api.staging.fullbor.ai/v2

# Use local development
./comprehensive-api-test.py client-groups-script.yaml --base-url http://localhost:3000/v2
```

### Additional Options

```bash
# Fail fast on first error
./comprehensive-api-test.py client-groups-script.yaml --fail-fast

# Disable colored output
./comprehensive-api-test.py client-groups-script.yaml --no-color

# Disable TLS verification (insecure)
./comprehensive-api-test.py client-groups-script.yaml --insecure

# Pass custom variables
./comprehensive-api-test.py client-groups-script.yaml --vars '{"custom_var": "value"}'

# Load variables from file
./comprehensive-api-test.py client-groups-script.yaml --vars-file config.json

# Expose environment variables as test variables
./comprehensive-api-test.py client-groups-script.yaml --env API_KEY SECRET_TOKEN
```

## Environment Setup

Create a `.env` file in the project root with your Cognito credentials:

```env
TEST_USERNAME=your@email.com
TEST_PASSWORD=yourpassword
USER_POOL_ID=us-east-2_IJ1C0mWXW
CLIENT_ID=1lntksiqrqhmjea6obrrrrnmh1
```

## Dependencies

Install required packages:

```bash
pip install pyyaml httpx jmespath jsonschema rich tabulate boto3 python-dotenv
```

## Test Scripts

### client-groups-script.yaml

Tests the complete lifecycle of client group operations:

1. Count original client groups
2. Create new client group
3. Verify count increased
4. Update client group attributes
5. Set entities for existing group
6. Verify updates
7. Delete test record
8. Verify deletion
9. Verify count back to original

### entities-and-types-script.yaml

Tests entity and entity type management:

1. Create entity types
2. Create entities with different categories
3. Update entity attributes
4. Query entities with filters
5. Clean up test data

### position-keeper-script.yaml

Tests position keeper operations:

1. Start position keeper process
2. Verify start status
3. Stop position keeper process
4. Verify stop status

### transactions-and-types-script.yaml

Tests transaction and transaction type management:

1. Create transaction types
2. Create transactions with various statuses
3. Update transaction properties
4. Query transactions with filters
5. Clean up test data

### users-and-invitations-script.yaml

Tests user and invitation management:

1. Create invitations
2. Query invitations
3. Test invitation redemption
4. User management operations
5. Clean up test data

## Authentication

The test runner has **automatic AWS Cognito authentication always enabled**:

- Authentication is automatically enabled (required)
- Authentication headers are automatically added to requests
- User ID is extracted from JWT token and available as `{{current_user_id}}`
- Requires boto3 and python-dotenv to be installed
- Override credentials with `--username` and `--password` flags
