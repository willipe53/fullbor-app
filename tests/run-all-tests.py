#!/usr/bin/env python3
"""
Simple script to run all YAML test files in the tests directory.
All output is captured to a single timestamped file.

This script suppresses individual test output files (using --no-export)
and captures all verbose output to a single combined file.

Usage:
    python run-all-tests.py
    ./run-all-tests.py
"""

import os
import sys
import subprocess
import glob
from datetime import datetime
from pathlib import Path


def main():
    # Get the directory where this script is located
    script_dir = Path(__file__).parent
    os.chdir(script_dir)

    # Find all YAML test files
    yaml_files = glob.glob("*.yaml")

    if not yaml_files:
        print("No YAML test files found in the tests directory.")
        sys.exit(1)

    # Sort the files for consistent ordering
    yaml_files.sort()

    # Create timestamped output filename
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    output_file = f"{timestamp}all-tests-output.txt"

    print(f"Found {len(yaml_files)} test files:")
    for yaml_file in yaml_files:
        print(f"  - {yaml_file}")

    print(f"\nRunning all tests and capturing output to: {output_file}")
    print("=" * 80)

    # Open output file for writing
    with open(output_file, 'w', encoding='utf-8') as outfile:
        # Write header
        outfile.write(f"Full API Test Suite Results\n")
        outfile.write(
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        outfile.write(f"Test Files: {', '.join(yaml_files)}\n")
        outfile.write("=" * 80 + "\n\n")

        total_passed = 0
        total_failed = 0
        total_skipped = 0
        total_tests = 0
        failed_tests = []  # Store details of failed tests
        skipped_tests = []  # Store details of skipped tests
        file_results = []  # Store results for each file

        # Run each test file
        for i, yaml_file in enumerate(yaml_files, 1):
            print(f"Running {i}/{len(yaml_files)}: {yaml_file}")

            # Write section header to output file
            outfile.write(f"\n{'='*20} {yaml_file} {'='*20}\n")
            outfile.write(f"Test File: {yaml_file}\n")
            outfile.write(
                f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            outfile.write("-" * 60 + "\n\n")

            try:
                # Run the test with verbose output but suppress individual output files
                cmd = ["./comprehensive-api-test.py",
                       yaml_file, "--verbose", "--no-export"]

                # Run the command and capture both stdout and stderr
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=600  # 10 minute timeout per test file
                )

                # Write the output to file
                if result.stdout:
                    outfile.write("STDOUT:\n")
                    outfile.write(result.stdout)
                    outfile.write("\n")

                if result.stderr:
                    outfile.write("STDERR:\n")
                    outfile.write(result.stderr)
                    outfile.write("\n")

                # Write exit status
                outfile.write(f"\nExit Status: {result.returncode}\n")

                # Parse detailed results from stdout
                file_passed = 0
                file_failed = 0
                file_skipped = 0
                file_total = 0
                file_has_issues = False

                if result.stdout:
                    lines = result.stdout.split('\n')
                    current_test_name = ""

                    # Parse through lines to find test names and results
                    for i, line in enumerate(lines):
                        line = line.strip()

                        # Look for test name lines like "[1/14] Test Name"
                        if line.startswith('[') and '/' in line and ']' in line:
                            try:
                                bracket_end = line.find(']') + 1
                                current_test_name = line[bracket_end:].strip()
                            except:
                                pass

                        # Look for result lines
                        elif line == '✅ PASS':
                            file_passed += 1
                        elif line == '❌ SKIP':
                            file_skipped += 1
                            total_skipped += 1
                            if current_test_name:
                                skipped_tests.append(
                                    f"{yaml_file} - {current_test_name}")
                        elif line.startswith('❌ FAIL:'):
                            file_failed += 1
                            total_failed += 1
                            file_has_issues = True
                            if current_test_name:
                                error_msg = line.replace('❌ FAIL: ', '')
                                failed_tests.append(
                                    f"{yaml_file} - {current_test_name}: {error_msg}")

                    # Calculate totals
                    file_total = file_passed + file_failed + file_skipped

                # Update totals
                total_tests += file_total
                total_passed += file_passed

                # Store file results
                file_results.append({
                    'file': yaml_file,
                    'passed': file_passed,
                    'failed': file_failed,
                    'skipped': file_skipped,
                    'total': file_total,
                    'has_issues': file_has_issues or result.returncode != 0
                })

                # Write file summary
                outfile.write(
                    f"File Summary: {file_passed}/{file_total} passed")
                if file_skipped > 0:
                    outfile.write(f", {file_skipped} skipped")
                if file_failed > 0:
                    outfile.write(f", {file_failed} failed")
                outfile.write("\n")

                # Print completion status
                if file_has_issues or result.returncode != 0:
                    print(f"  ❌ Completed with issues")
                else:
                    print(f"  ✅ Completed with no issues")

            except subprocess.TimeoutExpired:
                error_msg = f"Timeout: {yaml_file} took longer than 10 minutes"
                print(f"  ❌ {error_msg}")
                outfile.write(f"ERROR: {error_msg}\n")
                total_failed += 1

            except Exception as e:
                error_msg = f"Error running {yaml_file}: {e}"
                print(f"  ❌ {error_msg}")
                outfile.write(f"ERROR: {error_msg}\n")
                total_failed += 1

            outfile.write(
                f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            outfile.write("-" * 60 + "\n")

        # Write final summary
        outfile.write(f"\n{'='*20} FINAL SUMMARY {'='*20}\n")
        outfile.write(f"Total Tests: {total_tests}\n")
        outfile.write(f"Total Passed: {total_passed}\n")
        outfile.write(f"Total Skipped: {total_skipped}\n")
        outfile.write(f"Total Failed: {total_failed}\n")
        outfile.write(
            f"Success Rate: {(total_passed/total_tests*100):.1f}%\n" if total_tests > 0 else "Success Rate: N/A\n")
        outfile.write(
            f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Print final summary to console
    print("\n" + "=" * 80)
    print("FINAL SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {total_tests}")
    print(f"Total Passed: {total_passed}")
    print(f"Total Skipped: {total_skipped}")
    print(f"Total Failed: {total_failed}")

    # Show detailed breakdown of skipped tests
    if total_skipped > 0:
        print(f"Total Skipped: {total_skipped}")
        for skipped_test in skipped_tests:
            print(f"❌ SKIP: {skipped_test}")

    # Show detailed breakdown of failed tests
    if total_failed > 0:
        print(f"Total Failed: {total_failed}")
        for failed_test in failed_tests:
            print(f"❌ FAIL: {failed_test}")

    if total_tests > 0:
        print(f"Success Rate: {(total_passed/total_tests*100):.1f}%")
    print(f"Output saved to: {output_file}")

    # Exit with appropriate code
    sys.exit(0 if total_failed == 0 else 1)


if __name__ == "__main__":
    main()
