#!/usr/bin/env python3
# Python 3.12+
#
# Enhanced Features:
# - YAML test plan: multiple tests with method/url/params/json/headers
# - Variables & templating: {{var}} anywhere (url, headers, body, params)
# - Extract values from responses via JMESPath -> variables for later tests
# - Assertions: status, headers (subset), JSON via JMESPath:
#     equals / contains / matches (regex) / not_equals / length / exists
# - Optional JSON Schema validation
# - Base URL override, extra vars via CLI
# - Security: input validation, file path validation, secure templating
# - Performance: connection pooling, parallel execution options
# - Enhanced UX: progress bars, colored output, result export
#
# deps: pip install pyyaml httpx jmespath jsonschema rich tabulate boto3 python-dotenv
#
# Usage:
#   # Basic usage with manual variables
#   python comprehensive-api-test.py tests.yaml --base-url https://api.fullbor.ai/v2 \
#     --vars '{"token":"XYZ","current_user_id":"123"}'
#
#   # With environment variables
#   export TOKEN=XYZ && python comprehensive-api-test.py tests.yaml --env TOKEN
#
#   # With Cognito authentication (automatic token retrieval)
#   python comprehensive-api-test.py tests.yaml --auth --base-url https://api.fullbor.ai/v2
#
#   # Authentication with custom credentials
#   python comprehensive-api-test.py tests.yaml --auth --username user@example.com \
#     --password mypassword --user-pool-id us-east-2_ABC123 --client-id 123abc

from __future__ import annotations
import argparse
import json
import os
import re
import sys
import time
import base64
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from concurrent.futures import ThreadPoolExecutor, as_completed

import yaml
import httpx
import jmespath
from jsonschema import validate as jsonschema_validate, Draft202012Validator

# Optional imports for enhanced features
try:
    import boto3
    from dotenv import load_dotenv
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False

# Optional imports for enhanced features
try:
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
    from rich.table import Table
    from rich import print as rprint
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    Console = None

T_VAR = Dict[str, Any]

# Security and validation constants
MAX_TIMEOUT = 300  # 5 minutes max timeout
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB max file size
ALLOWED_FILE_EXTENSIONS = {'.json', '.yaml', '.yml'}


def _validate_template_key(key: str) -> bool:
    """Validate template variable key for security."""
    return re.match(r'^[A-Za-z0-9_\.]+$', key) is not None


def get_auth_token(username: Optional[str] = None, password: Optional[str] = None,
                   user_pool_id: Optional[str] = None, client_id: Optional[str] = None,
                   region: str = 'us-east-2') -> str:
    """Get JWT token from Cognito User Pool."""
    if not BOTO3_AVAILABLE:
        raise ImportError(
            "boto3 and python-dotenv are required for authentication. Install with: pip install boto3 python-dotenv")

    try:
        # Load environment variables
        load_dotenv()

        # Use provided values or fall back to environment variables
        username = username or os.getenv('TEST_USERNAME')
        password = password or os.getenv('TEST_PASSWORD')
        user_pool_id = user_pool_id or os.getenv(
            'USER_POOL_ID', 'us-east-2_IJ1C0mWXW')
        client_id = client_id or os.getenv(
            'CLIENT_ID', '1lntksiqrqhmjea6obrrrrnmh1')

        if not username or not password:
            raise ValueError(
                "Username and password must be provided or set in environment variables (TEST_USERNAME, TEST_PASSWORD)")

        # Initialize Cognito client
        cognito = boto3.client('cognito-idp', region_name=region)

        # Authenticate with Cognito using admin_initiate_auth
        response = cognito.admin_initiate_auth(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters={
                'USERNAME': username,
                'PASSWORD': password
            }
        )

        return response['AuthenticationResult']['IdToken']

    except Exception as e:
        raise RuntimeError(f"Authentication failed: {e}")


def get_user_id_from_token(token: str) -> Optional[str]:
    """Extract user ID (sub) from JWT token."""
    try:
        # Decode JWT payload
        payload = token.split('.')[1]
        # Add padding if needed
        payload += '=' * (4 - len(payload) % 4)
        decoded = base64.b64decode(payload)
        data = json.loads(decoded)
        return data.get('sub')
    except Exception as e:
        raise ValueError(f"Failed to extract user ID from token: {e}")


def _validate_file_path(path: str) -> str:
    """Validate and normalize file path for security."""
    try:
        resolved_path = Path(path).resolve()
        if not resolved_path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        if resolved_path.stat().st_size > MAX_FILE_SIZE:
            raise ValueError(
                f"File too large (max {MAX_FILE_SIZE // (1024*1024)}MB): {path}")
        return str(resolved_path)
    except Exception as e:
        raise ValueError(f"Invalid file path '{path}': {e}")


def _deep_format(value: Any, vars: T_VAR) -> Any:
    """Replace {{var}} in strings inside nested structures with security validation."""
    if isinstance(value, dict):
        return {k: _deep_format(v, vars) for k, v in value.items()}
    if isinstance(value, list):
        return [_deep_format(v, vars) for v in value]
    if isinstance(value, str):
        def repl(m):
            key = m.group(1).strip()
            if not _validate_template_key(key):
                raise ValueError(
                    f"Invalid template variable '{key}' in: {value}")
            if key not in vars:
                raise KeyError(
                    f"Missing variable '{key}' for template: {value}")
            return str(vars[key])
        return re.sub(r"\{\{\s*([A-Za-z0-9_\.]+)\s*\}\}", repl, value)
    return value


def _jmes(obj: Any, expr: str) -> Any:
    try:
        return jmespath.search(expr, obj)
    except Exception as e:
        raise AssertionError(f"JMESPath error in '{expr}': {e}")


def _ensure_list(x: Any) -> List[Any]:
    return x if isinstance(x, list) else [x]


def _assert_json_checks(body: Any, checks: List[Dict[str, Any]]) -> None:
    """Enhanced JSON assertions with better error handling and new assertion types."""
    for i, chk in enumerate(checks, 1):
        path = chk.get("path")
        if not path:
            raise AssertionError(f"json check #{i} missing 'path'")

        try:
            actual = _jmes(body, path)
        except Exception as e:
            raise AssertionError(f"[{path}] JMESPath error: {e}")

        # Check if path exists (new assertion type)
        if "exists" in chk:
            should_exist = chk["exists"]
            exists = actual is not None
            if exists != should_exist:
                raise AssertionError(
                    f"[{path}] expected exists={should_exist}, but path {'exists' if exists else 'does not exist'}")
            continue  # Skip other checks if this is an existence check

        if "equals" in chk:
            exp = chk["equals"]
            if actual != exp:
                raise AssertionError(
                    f"[{path}] expected equals {exp!r}, got {actual!r}")
        if "not_equals" in chk:
            exp = chk["not_equals"]
            if actual == exp:
                raise AssertionError(
                    f"[{path}] expected not_equals {exp!r}, got {actual!r}")
        if "contains" in chk:
            exp = chk["contains"]
            if isinstance(exp, list):
                missing = [v for v in exp if v not in (actual or [])]
                if missing:
                    raise AssertionError(
                        f"[{path}] missing expected members {missing}, actual={actual!r}")
            else:
                if actual is None or exp not in actual:
                    raise AssertionError(
                        f"[{path}] expected to contain {exp!r}, actual={actual!r}")
        if "matches" in chk:
            pattern = chk["matches"]
            if not isinstance(actual, str):
                raise AssertionError(
                    f"[{path}] matches requires string, got {type(actual).__name__}")
            if not re.search(pattern, actual):
                raise AssertionError(
                    f"[{path}] regex {pattern!r} not matched, actual={actual!r}")
        if "length" in chk:
            exp_len = chk["length"]
            try:
                actual_len = len(actual)  # may raise
            except Exception:
                raise AssertionError(
                    f"[{path}] length check: value has no length (actual={actual!r})")
            if actual_len != exp_len:
                raise AssertionError(
                    f"[{path}] expected length {exp_len}, got {actual_len}")
        if "min_length" in chk:
            min_len = chk["min_length"]
            try:
                actual_len = len(actual)
            except Exception:
                raise AssertionError(
                    f"[{path}] min_length check: value has no length (actual={actual!r})")
            if actual_len < min_len:
                raise AssertionError(
                    f"[{path}] expected min_length {min_len}, got {actual_len}")
        if "max_length" in chk:
            max_len = chk["max_length"]
            try:
                actual_len = len(actual)
            except Exception:
                raise AssertionError(
                    f"[{path}] max_length check: value has no length (actual={actual!r})")
            if actual_len > max_len:
                raise AssertionError(
                    f"[{path}] expected max_length {max_len}, got {actual_len}")


def _assert_headers_subset(resp_headers: httpx.Headers, expected: Dict[str, str]) -> None:
    for k, v in expected.items():
        actual = resp_headers.get(k)
        if actual is None:
            raise AssertionError(f"header {k!r} missing")
        if v != "*" and actual != v:
            raise AssertionError(
                f"header {k!r} expected {v!r}, got {actual!r} (use '*' to wildcard)")


def _load_json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except Exception as e:
        raise AssertionError(f"response is not JSON: {e}")


@dataclass
class TestResult:
    """Test execution result with timing and status information."""
    name: str
    passed: bool
    duration: float
    status_code: Optional[int] = None
    error_message: Optional[str] = None
    response_size: Optional[int] = None

    def __post_init__(self):
        if self.duration < 0:
            raise ValueError("Duration cannot be negative")


@dataclass
class TestCase:
    name: str
    method: str
    url: str
    params: Optional[Dict[str, Any]] = None
    json_body: Optional[Any] = None
    headers: Optional[Dict[str, str]] = None
    expect_status: Optional[int] = None
    expect_headers: Optional[Dict[str, str]] = None
    expect_json: Optional[List[Dict[str, Any]]] = None
    expect_schema: Optional[Dict[str, Any]] = None
    extract: Optional[Dict[str, str]] = None  # var_name -> jmespath
    timeout: Optional[float] = None
    # Maximum response time in seconds
    expect_max_response_time: Optional[float] = None

    def __post_init__(self):
        # Validate timeout range
        if self.timeout is not None and (self.timeout <= 0 or self.timeout > MAX_TIMEOUT):
            raise ValueError(
                f"Timeout must be between 0 and {MAX_TIMEOUT} seconds")
        # Validate response time expectation
        if self.expect_max_response_time is not None and self.expect_max_response_time <= 0:
            raise ValueError("Response time expectation must be positive")


def _format_error_with_context(test_name: str, error: Exception, url: str, method: str) -> str:
    """Format error message with test context."""
    error_type = type(error).__name__
    return f"Test '{test_name}' failed [{method} {url}]: {error_type}: {str(error)}"


def run_test(client: httpx.Client, tc: TestCase, vars: T_VAR) -> TestResult:
    """Run a single test case and return the result with timing information."""
    start_time = time.time()

    try:
        # Templating with validation
        method = tc.method.upper()
        if method not in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'}:
            raise ValueError(f"Invalid HTTP method: {method}")

        url = _deep_format(tc.url, vars)
        params = _deep_format(tc.params or {}, vars)
        headers = _deep_format(tc.headers or {}, vars)
        data_json = _deep_format(
            tc.json_body, vars) if tc.json_body is not None else None

        # Send request
        request_start = time.time()
        resp = client.request(method, url, params=params, json=data_json,
                              headers=headers, timeout=tc.timeout or 30)
        request_duration = time.time() - request_start

        # Check response time expectation
        if tc.expect_max_response_time is not None:
            if request_duration > tc.expect_max_response_time:
                raise AssertionError(
                    f"Response time {request_duration:.3f}s exceeds maximum expected {tc.expect_max_response_time}s")

        # Status code validation
        if tc.expect_status is not None and resp.status_code != tc.expect_status:
            # Show helpful snippet
            snippet = resp.text[:500].replace("\n", "\\n")
            raise AssertionError(
                f"Status {resp.status_code} != expected {tc.expect_status}. Body: {snippet}")

        # Headers validation
        if tc.expect_headers:
            _assert_headers_subset(resp.headers, tc.expect_headers)

        # JSON assertions / schema / extract
        body = None
        needs_json = bool(tc.expect_json or tc.expect_schema or tc.extract)
        if needs_json:
            body = _load_json(resp)

        if tc.expect_json:
            _assert_json_checks(body, tc.expect_json)

        if tc.expect_schema:
            Draft202012Validator.check_schema(tc.expect_schema)
            jsonschema_validate(body, tc.expect_schema)

        if tc.extract:
            for var_name, jexpr in tc.extract.items():
                try:
                    vars[var_name] = _jmes(body, jexpr)
                except Exception as e:
                    raise AssertionError(
                        f"Failed to extract '{var_name}' with JMESPath '{jexpr}': {e}")

        total_duration = time.time() - start_time
        return TestResult(
            name=tc.name,
            passed=True,
            duration=total_duration,
            status_code=resp.status_code,
            response_size=len(resp.content) if resp.content else 0
        )

    except Exception as e:
        total_duration = time.time() - start_time
        error_msg = _format_error_with_context(tc.name, e, tc.url, tc.method)
        return TestResult(
            name=tc.name,
            passed=False,
            duration=total_duration,
            error_message=str(e)
        )


def _validate_test_plan(plan: Dict[str, Any]) -> None:
    """Validate the structure and content of a test plan."""
    if not isinstance(plan, dict):
        raise ValueError("Test plan must be a dictionary")

    # Validate required sections
    if "tests" not in plan:
        raise ValueError("Test plan must contain 'tests' section")

    if not isinstance(plan["tests"], list):
        raise ValueError("'tests' must be a list")

    # Validate each test case
    for i, test in enumerate(plan["tests"]):
        if not isinstance(test, dict):
            raise ValueError(f"Test #{i+1} must be a dictionary")

        if "request" not in test:
            raise ValueError(f"Test #{i+1} missing 'request' section")

        request = test["request"]
        if not isinstance(request, dict):
            raise ValueError(f"Test #{i+1} 'request' must be a dictionary")

        # Validate required request fields
        required_fields = ["method", "url"]
        for field in required_fields:
            if field not in request:
                raise ValueError(
                    f"Test #{i+1} missing required field '{field}'")

        # Validate HTTP method
        method = request["method"].upper()
        if method not in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'}:
            raise ValueError(f"Test #{i+1} invalid HTTP method: {method}")

        # Validate URL
        url = request["url"]
        if not isinstance(url, str) or not url:
            raise ValueError(f"Test #{i+1} 'url' must be a non-empty string")

        # Validate optional fields
        if "timeout" in test and (not isinstance(test["timeout"], (int, float)) or test["timeout"] <= 0):
            raise ValueError(
                f"Test #{i+1} 'timeout' must be a positive number")

        if "expect" in test:
            expect = test["expect"]
            if not isinstance(expect, dict):
                raise ValueError(f"Test #{i+1} 'expect' must be a dictionary")

            if "status" in expect and (not isinstance(expect["status"], int) or expect["status"] < 100 or expect["status"] > 599):
                raise ValueError(
                    f"Test #{i+1} 'expect.status' must be a valid HTTP status code (100-599)")


def load_plan(path: str) -> Dict[str, Any]:
    """Load and validate a test plan from YAML file."""
    try:
        validated_path = _validate_file_path(path)
        with open(validated_path, "r", encoding="utf-8") as f:
            plan = yaml.safe_load(f)

        if plan is None:
            raise ValueError("Test plan file is empty or invalid YAML")

        _validate_test_plan(plan)
        return plan

    except Exception as e:
        raise ValueError(f"Failed to load test plan from '{path}': {e}")


def _export_results(results: List[TestResult], format: str, output_file: Optional[str] = None) -> None:
    """Export test results to various formats."""
    if format == "json":
        data = {
            "summary": {
                "total": len(results),
                "passed": sum(1 for r in results if r.passed),
                "failed": sum(1 for r in results if not r.passed),
                "total_duration": sum(r.duration for r in results)
            },
            "tests": [
                {
                    "name": r.name,
                    "passed": r.passed,
                    "duration": r.duration,
                    "status_code": r.status_code,
                    "response_size": r.response_size,
                    "error_message": r.error_message
                }
                for r in results
            ]
        }
        content = json.dumps(data, indent=2)
    elif format == "csv":
        import csv
        import io
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Name', 'Passed', 'Duration',
                        'Status Code', 'Response Size', 'Error'])
        for r in results:
            writer.writerow([r.name, r.passed, r.duration,
                            r.status_code, r.response_size, r.error_message or ''])
        content = output.getvalue()
    else:
        raise ValueError(f"Unsupported export format: {format}")

    if output_file:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(content)
    else:
        print(content)


def main():
    ap = argparse.ArgumentParser(
        description="Enhanced YAML-driven API test runner")
    ap.add_argument("plan", help="tests.yaml")
    ap.add_argument("--base-url", help="Base URL to prepend to relative paths")
    ap.add_argument(
        "--vars", help='JSON dict of variables, e.g. \'{"token":"abc"}\'')
    ap.add_argument("--vars-file", help="Path to JSON or YAML with variables")
    ap.add_argument("--env", nargs="*",
                    help="Expose these ENV vars as variables (names only)")
    ap.add_argument("--insecure", action="store_true",
                    help="Disable TLS verify")
    ap.add_argument("--fail-fast", action="store_true")
    ap.add_argument("--verbose", "-v", action="count", default=0)
    ap.add_argument("--parallel", type=int, metavar="N",
                    help="Run tests in parallel with N workers (default: sequential)")
    ap.add_argument("--export", choices=["json", "csv"],
                    help="Export results in specified format")
    ap.add_argument("--output", help="Output file for exported results")
    ap.add_argument("--no-color", action="store_true",
                    help="Disable colored output")

    # Authentication options
    auth_group = ap.add_argument_group('authentication options')
    auth_group.add_argument("--auth", action="store_true",
                            help="Enable Cognito authentication (requires boto3, python-dotenv)")
    auth_group.add_argument(
        "--username", help="Cognito username (overrides TEST_USERNAME env var)")
    auth_group.add_argument(
        "--password", help="Cognito password (overrides TEST_PASSWORD env var)")
    auth_group.add_argument(
        "--user-pool-id", help="Cognito User Pool ID (overrides USER_POOL_ID env var)")
    auth_group.add_argument(
        "--client-id", help="Cognito Client ID (overrides CLIENT_ID env var)")
    auth_group.add_argument("--region", default="us-east-2",
                            help="AWS region for Cognito (default: us-east-2)")

    args = ap.parse_args()

    plan = load_plan(args.plan)
    base_url = plan.get("base_url") or args.base_url or ""
    verify = not args.insecure

    # Seed variables with validation
    vars: T_VAR = {}
    if args.vars:
        try:
            vars.update(json.loads(args.vars))
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in --vars: {e}")
    if args.vars_file:
        try:
            validated_path = _validate_file_path(args.vars_file)
            with open(validated_path, "r", encoding="utf-8") as vf:
                if args.vars_file.endswith((".yaml", ".yml")):
                    vars.update(yaml.safe_load(vf))
                else:
                    vars.update(json.load(vf))
        except Exception as e:
            raise ValueError(
                f"Failed to load variables from '{args.vars_file}': {e}")
    if args.env:
        for name in args.env:
            if not _validate_template_key(name):
                raise ValueError(f"Invalid environment variable name: {name}")
            if name in os.environ:
                vars[name] = os.environ[name]

    # Handle authentication if requested
    if args.auth:
        if not BOTO3_AVAILABLE:
            raise ImportError(
                "Authentication requires boto3 and python-dotenv. Install with: pip install boto3 python-dotenv")

        try:
            # Get authentication token
            token = get_auth_token(
                username=args.username,
                password=args.password,
                user_pool_id=args.user_pool_id,
                client_id=args.client_id,
                region=args.region
            )

            # Extract user ID from token
            user_id = get_user_id_from_token(token)
            if not user_id:
                raise ValueError(
                    "Could not extract user ID from authentication token")

            # Add authentication variables
            vars['token'] = token
            vars['current_user_id'] = user_id
            vars['auth_token'] = token  # Alternative name for compatibility
            vars['user_id'] = user_id   # Alternative name for compatibility

            if args.verbose:
                print(f"✅ Authentication successful for user: {user_id}")

        except Exception as e:
            print(f"❌ Authentication failed: {e}", file=sys.stderr)
            sys.exit(1)

    default_headers = plan.get("defaults", {}).get("headers", {})
    default_timeout = plan.get("defaults", {}).get("timeout", 30)

    # Add authentication headers if auth is enabled
    if args.auth and 'token' in vars:
        auth_headers = {
            'Authorization': 'Bearer {{token}}',
            'X-Current-User-Id': '{{current_user_id}}',
            'Content-Type': 'application/json'
        }
        # Merge with existing default headers (vars take precedence)
        default_headers = {**default_headers, **auth_headers}

    tests_raw: List[Dict[str, Any]] = plan.get("tests", [])
    tests: List[TestCase] = []
    for t in tests_raw:
        url = t["request"]["url"]
        if base_url and url.startswith("/"):
            url = base_url.rstrip("/") + url
        tests.append(TestCase(
            name=t.get("name", t["request"]["method"] + " " + url),
            method=t["request"]["method"],
            url=url,
            params=t["request"].get("params"),
            json_body=t["request"].get("json"),
            headers={**default_headers, **(t["request"].get("headers") or {})},
            expect_status=(t.get("expect") or {}).get("status"),
            expect_headers=(t.get("expect") or {}).get("headers"),
            expect_json=(t.get("expect") or {}).get("json"),
            expect_schema=(t.get("expect") or {}).get("schema"),
            extract=t.get("extract"),
            timeout=t.get("timeout", default_timeout),
            expect_max_response_time=(
                t.get("expect") or {}).get("max_response_time"),
        ))

    # Initialize console for rich output if available
    console = None
    if RICH_AVAILABLE and not args.no_color:
        console = Console()

    # Create HTTP client with connection pooling
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
    client = httpx.Client(
        verify=verify, timeout=default_timeout, limits=limits)

    results: List[TestResult] = []
    start = time.time()

    # Validate parallel execution argument
    max_workers = args.parallel
    if max_workers is not None:
        if max_workers <= 0:
            raise ValueError("--parallel must be a positive integer")
        if max_workers > len(tests):
            max_workers = len(tests)

    def run_single_test(tc: TestCase) -> TestResult:
        """Wrapper function for parallel execution."""
        return run_test(client, tc, vars)

    if max_workers is None:
        # Sequential execution with progress tracking
        if RICH_AVAILABLE and not args.no_color and not args.verbose:
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
                TimeElapsedColumn(),
                console=console
            ) as progress:
                task = progress.add_task("Running tests...", total=len(tests))
                for tc in tests:
                    if args.verbose:
                        print(f"\n[{len(results)+1}/{len(tests)}] {tc.name}")

                    result = run_single_test(tc)
                    results.append(result)
                    progress.advance(task)

                    if args.verbose:
                        status = "✅ PASS" if result.passed else f"❌ FAIL: {result.error_message}"
                        print(f"  {status}")
                    elif not result.passed and not args.verbose:
                        print(
                            f"\n❌ FAIL: {tc.name}\n  {result.error_message}\n", file=sys.stderr)

                    if not result.passed and args.fail_fast:
                        break
        else:
            # Simple sequential execution
            for i, tc in enumerate(tests, 1):
                if args.verbose:
                    print(f"\n[{i}/{len(tests)}] {tc.name}")

                result = run_single_test(tc)
                results.append(result)

                if args.verbose:
                    status = "✅ PASS" if result.passed else f"❌ FAIL: {result.error_message}"
                    print(f"  {status}")
                elif not result.passed:
                    print(
                        f"\n❌ FAIL: {tc.name}\n  {result.error_message}\n", file=sys.stderr)

                if not result.passed and args.fail_fast:
                    break
    else:
        # Parallel execution
        if args.verbose:
            print(
                f"Running {len(tests)} tests in parallel with {max_workers} workers...")

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_test = {executor.submit(
                run_single_test, tc): tc for tc in tests}

            # Collect results as they complete
            for future in as_completed(future_to_test):
                tc = future_to_test[future]
                try:
                    result = future.result()
                    results.append(result)

                    if args.verbose:
                        status = "✅ PASS" if result.passed else f"❌ FAIL: {result.error_message}"
                        print(
                            f"[{len(results)}/{len(tests)}] {tc.name}: {status}")
                    elif not result.passed:
                        print(
                            f"❌ FAIL: {tc.name}: {result.error_message}", file=sys.stderr)

                    if not result.passed and args.fail_fast:
                        # Cancel remaining futures
                        for f in future_to_test:
                            f.cancel()
                        break

                except Exception as e:
                    error_result = TestResult(
                        name=tc.name,
                        passed=False,
                        duration=0,
                        error_message=f"Execution error: {e}"
                    )
                    results.append(error_result)
                    print(f"❌ ERROR: {tc.name}: {e}", file=sys.stderr)

                    if args.fail_fast:
                        break

    # Close client
    client.close()

    # Calculate summary
    total_duration = time.time() - start
    passed_count = sum(1 for r in results if r.passed)
    failed_count = len(results) - passed_count

    # Display results
    if RICH_AVAILABLE and not args.no_color:
        # Rich table output
        table = Table(title="Test Results Summary")
        table.add_column("Test", style="cyan")
        table.add_column("Status", style="green")
        table.add_column("Duration", style="blue")
        table.add_column("Status Code", style="magenta")
        table.add_column("Error", style="red")

        for result in results:
            status = "✅ PASS" if result.passed else "❌ FAIL"
            duration = f"{result.duration:.3f}s"
            status_code = str(result.status_code) if result.status_code else ""
            error = result.error_message or ""

            table.add_row(result.name, status, duration, status_code, error)

        console.print(table)
        console.print(
            f"\n[bold]Summary:[/bold] {passed_count}/{len(results)} passed in {total_duration:.2f}s")
    else:
        # Simple text output
        print(
            f"\nSummary: {passed_count}/{len(results)} passed in {total_duration:.2f}s")

    # Export results if requested
    if args.export:
        try:
            _export_results(results, args.export, args.output)
        except Exception as e:
            print(f"Failed to export results: {e}", file=sys.stderr)
            sys.exit(1)

    sys.exit(0 if passed_count == len(results) else 1)


if __name__ == "__main__":
    main()
