#!/usr/bin/env python3
"""
Update all Lambda handlers to use CORS helper.

This script automatically updates Lambda handlers to import and use
the cors_helper module for consistent CORS headers.
"""

import re
import sys
from pathlib import Path


def update_lambda_cors(file_path):
    """Update a Lambda handler to use CORS helper."""
    print(f"\nProcessing {file_path.name}...")

    with open(file_path, 'r') as f:
        content = f.read()

    original_content = content
    changes_made = []

    # 1. Add import if not present
    if 'import cors_helper' not in content and 'from cors_helper' not in content:
        # Find the last import statement
        import_lines = []
        for i, line in enumerate(content.split('\n')):
            if line.startswith('import ') or line.startswith('from '):
                import_lines.append(i)

        if import_lines:
            lines = content.split('\n')
            last_import_line = max(import_lines)
            lines.insert(last_import_line + 1, 'import cors_helper')
            content = '\n'.join(lines)
            changes_made.append("Added cors_helper import")

    # 2. Replace all headers dicts with cors_helper.get_cors_headers()
    # Pattern 1: "headers": {"Content-Type": "application/json"}
    pattern1 = r'"headers"\s*:\s*\{\s*"Content-Type"\s*:\s*"application/json"\s*\}'
    replacement1 = '"headers": cors_helper.get_cors_headers()'

    count1 = len(re.findall(pattern1, content))
    if count1 > 0:
        content = re.sub(pattern1, replacement1, content)
        changes_made.append(
            f"Replaced {count1} Content-Type-only headers with CORS headers")

    # Pattern 2: 'headers': {'Content-Type': 'application/json'}
    pattern2 = r"'headers'\s*:\s*\{\s*'Content-Type'\s*:\s*'application/json'\s*\}"
    replacement2 = "'headers': cors_helper.get_cors_headers()"

    count2 = len(re.findall(pattern2, content))
    if count2 > 0:
        content = re.sub(pattern2, replacement2, content)
        changes_made.append(
            f"Replaced {count2} single-quoted headers with CORS headers")

    # 3. Handle cases where headers already exist but may not have CORS
    # This is for cases like: "headers": {"Content-Type": "application/json", "Some-Other-Header": "value"}
    # These need manual review, so we'll just report them
    complex_headers_pattern = r'"headers"\s*:\s*\{[^}]+,\s*[^}]+\}'
    complex_headers = re.findall(complex_headers_pattern, content)
    if complex_headers and 'cors_helper' not in ''.join(complex_headers):
        changes_made.append(
            f"⚠️  Found {len(complex_headers)} complex headers that may need manual review")

    if content != original_content:
        # Write the modified content
        with open(file_path, 'w') as f:
            f.write(content)

        print(f"  ✓ Changes made:")
        for change in changes_made:
            print(f"    - {change}")
        return True
    else:
        print(f"  ℹ️  No changes needed (already using CORS or no headers found)")
        return False


def main():
    """Main entry point."""
    # Find all Lambda handler files
    lambdas_dir = Path(__file__).parent.parent / 'lambdas'
    lambda_files = list(lambdas_dir.glob('*Handler.py'))

    # Also include PositionKeeper.py
    position_keeper = lambdas_dir / 'PositionKeeper.py'
    if position_keeper.exists():
        lambda_files.append(position_keeper)

    if not lambda_files:
        print("❌ No Lambda handler files found")
        sys.exit(1)

    print(f"Found {len(lambda_files)} Lambda files")
    print(f"{'='*60}")

    modified_count = 0
    for lambda_file in sorted(lambda_files):
        if update_lambda_cors(lambda_file):
            modified_count += 1

    print(f"\n{'='*60}")
    print(f"✅ Modified {modified_count} out of {len(lambda_files)} files")
    print(f"{'='*60}")

    if modified_count > 0:
        print("\n📝 Next steps:")
        print("1. Review the changes in git diff")
        print("2. Deploy updated Lambdas: python scripts/deploy-lambda.py")
        print("3. Test CORS: Access your app at https://app.fullbor.ai")


if __name__ == "__main__":
    main()
