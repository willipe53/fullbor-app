#!/usr/bin/env python3
"""
generate-trigger.py

Generate SQL for AFTER INSERT, UPDATE, and DELETE audit triggers
for a given MySQL table. Captures changes to regular columns and
first-level JSON fields.

Usage:
    python generate-trigger.py <table_name> <primary_key_column> <column1[:json]> <column2[:json]> ...

Examples:
    # Track regular columns only
    python generate-trigger.py entities entity_id name age status
    
    # Track regular columns and JSON columns
    python generate-trigger.py entities entity_id name unitized properties:json attributes:json
    
    # Track only JSON columns
    python generate-trigger.py entities entity_id properties:json attributes:json
"""

import sys
import textwrap


def generate_triggers(table: str, pk: str, columns: list[tuple[str, bool]]) -> str:
    """
    Generate audit triggers for a table.

    Args:
        table: Table name
        pk: Primary key column name
        columns: List of (column_name, is_json) tuples
    """
    table_safe = table.replace('`', '')
    pk_safe = pk.replace('`', '')
    audit_table = "audit_log"

    if not columns:
        # No columns to track
        diff_expr = "JSON_OBJECT()"
    else:
        # Build the "changes" expression for UPDATE trigger
        diff_expr_parts = []

        for col, is_json in columns:
            col_safe = col.replace('`', '')
            if is_json:
                # For JSON columns, use json_diff_simple which handles first-level comparison
                diff_expr_parts.append(
                    f"json_diff_simple(OLD.`{col_safe}`, NEW.`{col_safe}`)"
                )
            else:
                # For regular columns, compare and create JSON object with [old, new]
                # Only include if values are different
                diff_expr_parts.append(
                    f"IF(OLD.`{col_safe}` <=> NEW.`{col_safe}`, "
                    f"JSON_OBJECT(), "
                    f"JSON_OBJECT('{col_safe}', JSON_ARRAY(OLD.`{col_safe}`, NEW.`{col_safe}`)))"
                )

        # Merge all the JSON objects using JSON_MERGE_PATCH
        if len(diff_expr_parts) == 1:
            diff_expr = diff_expr_parts[0]
        else:
            diff_expr = f"JSON_MERGE_PATCH({', '.join(diff_expr_parts)})"

    sql = f"""
    -- Audit triggers for table `{table_safe}`

    DELIMITER $$

    CREATE TRIGGER `after_{table_safe}_insert`
    AFTER INSERT ON `{table_safe}`
    FOR EACH ROW
    BEGIN
        INSERT INTO `{audit_table}` (table_name, primary_key, updated_user_id, action, changes)
        VALUES ('{table_safe}', NEW.`{pk_safe}`, NEW.`updated_user_id`, 'INSERT', JSON_OBJECT());
    END$$

    CREATE TRIGGER `after_{table_safe}_update`
    AFTER UPDATE ON `{table_safe}`
    FOR EACH ROW
    BEGIN
        INSERT INTO `{audit_table}` (table_name, primary_key, updated_user_id, action, changes)
        VALUES ('{table_safe}', NEW.`{pk_safe}`, NEW.`updated_user_id`, 'UPDATE', {diff_expr});
    END$$

    CREATE TRIGGER `after_{table_safe}_delete`
    AFTER DELETE ON `{table_safe}`
    FOR EACH ROW
    BEGIN
        INSERT INTO `{audit_table}` (table_name, primary_key, updated_user_id, action, changes)
        VALUES ('{table_safe}', OLD.`{pk_safe}`, OLD.`updated_user_id`, 'DELETE', JSON_OBJECT());
    END$$

    DELIMITER ;
    """

    return textwrap.dedent(sql).strip()


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: python generate-trigger.py <table_name> <primary_key_column> [column1[:json] column2[:json] ...]")
        print("\nExamples:")
        print("  python generate-trigger.py entities entity_id name unitized properties:json attributes:json")
        print("  python generate-trigger.py transaction_types type_id name properties:json")
        sys.exit(1)

    table = sys.argv[1]
    pk = sys.argv[2]

    # Parse columns: "column_name" or "column_name:json"
    columns = []
    for arg in sys.argv[3:]:
        if ':json' in arg.lower():
            col_name = arg.split(':')[0]
            columns.append((col_name, True))
        else:
            columns.append((arg, False))

    print(generate_triggers(table, pk, columns))


if __name__ == "__main__":
    main()
