"""
AWS Glue Job: saveThePandas
Backs up all tables from the onebor database to S3 in BCP (tab-delimited) format.

This script is designed to run as an AWS Glue job with access to:
- The onebor RDS database (via VPC connection)
- The pandas-backups S3 bucket

To deploy this as a Glue job:
1. Upload this script to S3 (e.g., s3://your-glue-scripts-bucket/saveThePandas_glue.py)
2. Create a Glue job with:
   - Type: Python Shell
   - Python version: 3.9
   - IAM role with access to RDS secrets and S3
   - Connections to the VPC where RDS resides
   - Job parameters:
     - --SECRET_ARN: arn:aws:secretsmanager:us-east-2:316490106381:secret:PandaDbSecretCache-pdzjei
     - --BACKUP_BUCKET: pandas-backups
"""

import sys
import json
import boto3
import csv
from datetime import datetime
from io import StringIO
from awsglue.utils import getResolvedOptions

# Import pymysql (available in Glue Python Shell)
try:
    import pymysql
except ImportError:
    import os
    os.system('pip install pymysql')
    import pymysql


def get_db_connection(secret_arn):
    """Get database connection using secrets manager."""
    try:
        # Get secret from AWS Secrets Manager
        secrets_client = boto3.client(
            'secretsmanager', region_name='us-east-2')

        response = secrets_client.get_secret_value(SecretId=secret_arn)
        secret = json.loads(response['SecretString'])

        connection = pymysql.connect(
            host=secret['DB_HOST'],
            user=secret['DB_USER'],
            password=secret['DB_PASS'],
            database=secret['DATABASE'],
            connect_timeout=10,
            read_timeout=60,
            write_timeout=60,
            cursorclass=pymysql.cursors.DictCursor
        )
        return connection
    except Exception as e:
        raise Exception(f"Failed to connect to database: {str(e)}")


def get_all_tables(connection):
    """Get list of all tables in the onebor database."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT TABLE_NAME as table_name
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = 'onebor' AND TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            """)
            results = cursor.fetchall()
            tables = [row['table_name'] for row in results]
            return tables
    except Exception as e:
        raise Exception(f"Failed to get table list: {str(e)}")


def export_table_to_bcp(connection, table_name):
    """
    Export a table to BCP (tab-delimited) format.
    Returns the data as a string and row count.
    """
    try:
        with connection.cursor() as cursor:
            # Get all data from the table
            cursor.execute(f"SELECT * FROM {table_name}")
            rows = cursor.fetchall()

            if not rows:
                # Empty table - just return header
                cursor.execute(f"SHOW COLUMNS FROM {table_name}")
                columns = [col['Field'] for col in cursor.fetchall()]
                return '\t'.join(columns) + '\n', 0

            # Get column names from the first row
            columns = list(rows[0].keys())

            # Create BCP format (tab-delimited)
            output = StringIO()
            writer = csv.DictWriter(
                output,
                fieldnames=columns,
                delimiter='\t',
                lineterminator='\n',
                quoting=csv.QUOTE_MINIMAL
            )

            # Write header
            writer.writeheader()

            # Write all rows
            for row in rows:
                # Convert None to empty string and handle datetime/date objects
                cleaned_row = {}
                for k, v in row.items():
                    if v is None:
                        cleaned_row[k] = ''
                    elif hasattr(v, 'isoformat'):  # datetime or date
                        cleaned_row[k] = v.isoformat()
                    else:
                        cleaned_row[k] = str(v)
                writer.writerow(cleaned_row)

            return output.getvalue(), len(rows)
    except Exception as e:
        raise Exception(f"Failed to export table {table_name}: {str(e)}")


def upload_to_s3(s3_client, bucket, key, data):
    """Upload data to S3."""
    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data.encode('utf-8'),
            ContentType='text/plain'
        )
        return True
    except Exception as e:
        raise Exception(f"Failed to upload to S3 {bucket}/{key}: {str(e)}")


def main():
    """
    Main function for backing up all database tables to S3.
    """
    # Get job parameters
    try:
        args = getResolvedOptions(sys.argv, ['SECRET_ARN', 'BACKUP_BUCKET'])
        secret_arn = args['SECRET_ARN']
        backup_bucket = args['BACKUP_BUCKET']
    except Exception as e:
        print(f"Error getting job parameters: {str(e)}")
        print("Using default values for local testing")
        secret_arn = "arn:aws:secretsmanager:us-east-2:316490106381:secret:PandaDbSecretCache-pdzjei"
        backup_bucket = "pandas-backups"

    connection = None
    s3_client = boto3.client('s3', region_name='us-east-2')

    # Generate timestamp for this backup run
    timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%S')
    backup_prefix = f"{timestamp}/"

    results = {
        'timestamp': timestamp,
        'bucket': backup_bucket,
        'prefix': backup_prefix,
        'tables_backed_up': [],
        'errors': []
    }

    try:
        print(f"Starting backup at {timestamp}")
        print(f"Backup location: s3://{backup_bucket}/{backup_prefix}")

        # Connect to database
        print("Connecting to database...")
        connection = get_db_connection(secret_arn)
        print("Connected to database successfully")

        # Get list of all tables
        print("Fetching table list...")
        tables = get_all_tables(connection)
        print(f"Found {len(tables)} tables to backup: {', '.join(tables)}")

        # Backup each table
        for i, table_name in enumerate(tables, 1):
            try:
                print(f"[{i}/{len(tables)}] Backing up table: {table_name}")

                # Export table to BCP format
                bcp_data, row_count = export_table_to_bcp(
                    connection, table_name)

                # Upload to S3
                s3_key = f"{backup_prefix}{table_name}.bcp"
                upload_to_s3(s3_client, backup_bucket, s3_key, bcp_data)

                results['tables_backed_up'].append({
                    'table': table_name,
                    's3_key': s3_key,
                    'size_bytes': len(bcp_data),
                    'row_count': row_count
                })

                print(
                    f"  ✓ Backed up {row_count:,} rows ({len(bcp_data):,} bytes) to s3://{backup_bucket}/{s3_key}")

            except Exception as e:
                error_msg = f"Error backing up table {table_name}: {str(e)}"
                print(f"  ✗ {error_msg}")
                results['errors'].append(error_msg)

        # Create a manifest file with backup details
        manifest = {
            'backup_timestamp': timestamp,
            'database': 'onebor',
            'tables_count': len(results['tables_backed_up']),
            'total_rows': sum(t['row_count'] for t in results['tables_backed_up']),
            'total_bytes': sum(t['size_bytes'] for t in results['tables_backed_up']),
            'tables': results['tables_backed_up'],
            'errors': results['errors']
        }

        manifest_key = f"{backup_prefix}manifest.json"
        s3_client.put_object(
            Bucket=backup_bucket,
            Key=manifest_key,
            Body=json.dumps(manifest, indent=2).encode('utf-8'),
            ContentType='application/json'
        )

        print(
            f"\nBackup manifest created: s3://{backup_bucket}/{manifest_key}")

        # Summary
        success_count = len(results['tables_backed_up'])
        error_count = len(results['errors'])
        total_rows = sum(t['row_count'] for t in results['tables_backed_up'])
        total_bytes = sum(t['size_bytes'] for t in results['tables_backed_up'])

        print(f"\n{'='*60}")
        print(f"BACKUP COMPLETE")
        print(f"{'='*60}")
        print(f"Timestamp:       {timestamp}")
        print(f"Location:        s3://{backup_bucket}/{backup_prefix}")
        print(f"Tables backed up: {success_count}")
        print(f"Total rows:      {total_rows:,}")
        print(
            f"Total size:      {total_bytes:,} bytes ({total_bytes/1024/1024:.2f} MB)")
        print(f"Errors:          {error_count}")

        if results['errors']:
            print(f"\nErrors encountered:")
            for error in results['errors']:
                print(f"  - {error}")

        return 0 if error_count == 0 else 1

    except Exception as e:
        error_message = f"Fatal error during backup: {str(e)}"
        print(f"\n{'='*60}")
        print(f"BACKUP FAILED")
        print(f"{'='*60}")
        print(error_message)
        return 1

    finally:
        if connection:
            connection.close()
            print("\nDatabase connection closed")


if __name__ == "__main__":
    main()
    # Don't call sys.exit() in Glue jobs - it causes false failure status
