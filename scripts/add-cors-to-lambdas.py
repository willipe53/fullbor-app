#!/usr/bin/env python3
"""
Add CORS headers to all Lambda function responses.

This script modifies Lambda handler files to add CORS headers to all responses.
"""

import re
import sys
from pathlib import Path


def add_cors_headers_to_response(response_dict_str):
    """Add CORS headers to a response dictionary string."""
    # Check if headers already exist
    if '"headers"' in response_dict_str or "'headers'" in response_dict_str:
        # Headers exist, need to add CORS headers to existing headers
        # This is complex, so we'll handle it manually for now
        return None

    # Add headers before the closing brace
    # Look for the last element before the closing brace
    lines = response_dict_str.strip().split('\n')

    # Find the position to insert headers (before the closing brace)
    for i in range(len(lines) - 1, -1, -1):
        line = lines[i].strip()
        if line and not line.startswith('}'):
            # Add comma if needed
            if not line.endswith(','):
                lines[i] = lines[i] + ','
            break

    # Add CORS headers
    indent = '    ' * (response_dict_str.count('{') - 1)
    cors_headers = f'''{indent}    "headers": {{
{indent}        "Content-Type": "application/json",
{indent}        "Access-Control-Allow-Origin": "https://app.fullbor.ai",
{indent}        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id",
{indent}        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
{indent}    }}'''

    # Insert before the last closing brace
    lines.insert(-1, cors_headers)

    return '\n'.join(lines)


def add_cors_to_lambda_file(file_path):
    """Add CORS headers to all responses in a Lambda handler file."""
    print(f"\nProcessing {file_path.name}...")

    with open(file_path, 'r') as f:
        content = f.read()

    original_content = content
    changes_made = 0

    # Pattern to match return statements with dict containing statusCode
    # This is a simplified pattern - may need adjustment for complex cases
    pattern = r'return\s*\{[^}]*"statusCode"[^}]*\}'

    def replace_response(match):
        nonlocal changes_made
        response = match.group(0)

        # Skip if already has CORS headers
        if 'Access-Control-Allow-Origin' in response:
            return response

        # Extract the dict part
        dict_part = response.replace('return ', '').strip()

        # Add CORS headers
        if '"headers":' not in dict_part and "'headers':" not in dict_part:
            # Simple case: no headers exist
            dict_part = dict_part.rstrip('}').rstrip()
            if not dict_part.endswith(','):
                dict_part += ','

            cors_headers = '''
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "https://app.fullbor.ai",
                    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id",
                    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
                }'''

            dict_part = dict_part + cors_headers + '\n            }'
            changes_made += 1
            return f'return {dict_part}'

        return response

    # Use regex to find and replace responses (this is simplified)
    # For production, a proper Python AST parser would be better

    # Better approach: Add a helper function at the top and use it
    helper_function = '''
def add_cors_headers(headers=None):
    """Add CORS headers to response headers."""
    cors_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://app.fullbor.ai",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Current-User-Id",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
    }
    if headers:
        headers.update(cors_headers)
        return headers
    return cors_headers

'''

    # Check if helper function already exists
    if 'def add_cors_headers' not in content:
        # Add helper function after imports
        import_end = content.rfind('import ')
        if import_end != -1:
            # Find the end of the line
            line_end = content.find('\n', import_end)
            if line_end != -1:
                content = content[:line_end + 1] + \
                    helper_function + content[line_end + 1:]
                print(f"  ✓ Added add_cors_headers() helper function")
                changes_made += 1

    if changes_made > 0:
        # Write the modified content
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"  ✓ Made {changes_made} changes to {file_path.name}")
        return True
    else:
        print(f"  ℹ️  No changes needed for {file_path.name}")
        return False


def main():
    """Main entry point."""
    # Find all Lambda handler files
    lambdas_dir = Path(__file__).parent.parent / 'lambdas'
    lambda_files = list(lambdas_dir.glob('*Handler.py'))

    if not lambda_files:
        print("❌ No Lambda handler files found")
        sys.exit(1)

    print(f"Found {len(lambda_files)} Lambda handler files")
    print("\nNote: This script adds a helper function to each Lambda.")
    print("You'll still need to manually update return statements to use:")
    print('  return {..., "headers": add_cors_headers()}')
    print("\nOr use the cors_helper.py module for a cleaner approach.")

    modified_count = 0
    for lambda_file in lambda_files:
        if add_cors_to_lambda_file(lambda_file):
            modified_count += 1

    print(f"\n{'='*60}")
    print(f"Modified {modified_count} out of {len(lambda_files)} files")
    print(f"{'='*60}")

    if modified_count > 0:
        print("\n⚠️  IMPORTANT: You still need to manually update return statements")
        print("   to use the add_cors_headers() function in each Lambda handler.")
        print("\nExample:")
        print('  return {')
        print('      "statusCode": 200,')
        print('      "body": json.dumps(data),')
        print('      "headers": add_cors_headers()')
        print('  }')


if __name__ == "__main__":
    main()
