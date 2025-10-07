#!/usr/bin/env python3
import argparse
import os
import pymysql
from dotenv import load_dotenv


def main():
    parser = argparse.ArgumentParser(description="Load BCP file into MySQL")
    parser.add_argument("--table", required=True, help="Target table name")
    parser.add_argument("bcp_file", help="Path to .bcp file")
    args = parser.parse_args()

    # Convert to absolute path
    bcp_file_path = os.path.abspath(args.bcp_file)
    if not os.path.exists(bcp_file_path):
        print(f"❌ Error: File not found: {bcp_file_path}")
        return 1

    print(f"📁 Loading file: {bcp_file_path}")

    # Load DB credentials from .env
    load_dotenv()
    db_host = os.getenv("DB_HOST")
    db_port = int(os.getenv("DB_PORT", 3306))
    db_name = os.getenv("DATABASE")
    db_user = os.getenv("DB_USER")
    db_pass = os.getenv("DB_PASS")

    # Columns that need JSON cleanup
    json_columns = {"preferences", "attributes",
                    "properties", "attributes_schema"}

    # Read header row to get column names
    with open(bcp_file_path, "r", encoding="utf-8") as f:
        header_line = f.readline().strip()
        line_count = sum(1 for _ in f)  # Count remaining lines
    headers = header_line.split("\t")

    print(f"📊 File contains {line_count} data rows (plus 1 header row)")
    print(f"📝 Columns: {', '.join(headers)}")

    # Build column list and SET clauses
    column_list = []
    set_clauses = []

    for col in headers:
        if col in json_columns:
            column_list.append(f"@{col}")  # load into user variable
            set_clauses.append(
                f"""{col} = CASE
                        WHEN @{col} = '' OR @{col} = '""' THEN NULL
                        ELSE REPLACE(TRIM(BOTH '"' FROM @{col}), '""','"')
                    END"""
            )
        else:
            column_list.append(col)

    column_list_str = ", ".join(column_list)
    set_clause_str = ", ".join(set_clauses)

    sql = f"""
    LOAD DATA LOCAL INFILE '{bcp_file_path}'
    INTO TABLE {args.table}
    FIELDS TERMINATED BY '\\t'
    LINES TERMINATED BY '\\n'
    IGNORE 1 LINES
    ({column_list_str})
    """
    if set_clause_str:
        sql += f"SET {set_clause_str};"

    print("Executing SQL:\n", sql)

    # Connect and execute
    conn = pymysql.connect(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_pass,
        database=db_name,
        local_infile=1
    )
    try:
        # Check if local_infile is enabled
        with conn.cursor() as cursor:
            cursor.execute("SHOW VARIABLES LIKE 'local_infile'")
            result = cursor.fetchone()
            print(f"🔍 MySQL local_infile setting: {result}")

            # Try to enable it if it's OFF
            if result and result[1] == 'OFF':
                print("⚠️  local_infile is OFF. This might be why no rows are loading.")
                print("💡 If this is RDS, local_infile might be restricted by AWS.")

        with conn.cursor() as cursor:
            cursor.execute(sql)
            affected_rows = cursor.rowcount
            warnings = cursor.execute("SHOW WARNINGS")
            if warnings:
                for warning in cursor.fetchall():
                    print(f"⚠️  MySQL Warning: {warning}")
        conn.commit()
        print(f"✓ Loaded {affected_rows} rows into {args.table}")

        # Verify by counting rows
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM {args.table}")
            count = cursor.fetchone()[0]
            print(f"✓ Total rows in {args.table}: {count}")
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
