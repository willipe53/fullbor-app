# API Tests

This directory contains comprehensive API test scripts and the test runner.

## Files

- `comprehensive-api-test.py` - Enhanced YAML-driven API test runner with authentication support
- `client-groups-script.yaml` - Test script for client groups API lifecycle
- `README.md` - This documentation

## Usage

All commands should be run from the `tests/` directory:

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
```

### Custom Base URL

```bash
# Use staging environment
./comprehensive-api-test.py client-groups-script.yaml --base-url https://api.staging.fullbor.ai/v2

# Use local development
./comprehensive-api-test.py client-groups-script.yaml --base-url http://localhost:3000/v2
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

## Authentication

The test runner has **automatic AWS Cognito authentication always enabled**:

- Authentication is automatically enabled (required)
- Authentication headers are automatically added to requests
- User ID is extracted from JWT token and available as `{{current_user_id}}`
- Requires boto3 and python-dotenv to be installed
- Override credentials with `--username` and `--password` flags
