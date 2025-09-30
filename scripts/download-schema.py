#!/usr/bin/env python3
"""
Download complete database schema from MySQL database
Exports tables, views, indexes, procedures, triggers, and events
"""

import os
import sys
import subprocess
import datetime
from dotenv import load_dotenv

# Load environment variables from .env in the same directory as this script
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(script_dir, '.env')
load_dotenv(env_path)


def get_db_config():
    """Get database configuration from environment variables"""
    config = {
        'host': os.getenv('DB_HOST'),
        'port': os.getenv('DB_PORT', '3306'),
        'database': os.getenv('DATABASE'),
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASS')
    }

    # Validate required environment variables
    missing = [key for key, value in config.items() if not value]
    if missing:
        print(
            f"❌ Missing required environment variables: {', '.join(missing.upper())}")
        print("Please ensure these are set in scripts/.env:")
        for var in missing:
            print(f"  {var.upper()}=your_value")
        sys.exit(1)

    return config


def run_mysqldump(config, output_file):
    """Run mysqldump to export the complete database schema"""

    # Build mysqldump command with comprehensive options
    # Use less privileged options to avoid FLUSH TABLES issues
    mysqldump_path = '/opt/homebrew/opt/mysql-client/bin/mysqldump'
    cmd = [
        mysqldump_path,
        f'--host={config["host"]}',
        f'--port={config["port"]}',
        f'--user={config["user"]}',
        f'--password={config["password"]}',
        # Skip table locking (avoids FLUSH TABLES)
        '--skip-lock-tables',
        # Skip tablespace info (may require extra privileges)
        '--no-tablespaces',
        '--routines',                 # Include stored procedures and functions
        '--triggers',                 # Include triggers
        '--events',                   # Include events
        '--no-data',                  # Schema only (no data)
        '--add-drop-table',          # Add DROP TABLE statements
        '--add-drop-trigger',        # Add DROP TRIGGER statements
        '--comments',                # Include comments
        '--dump-date',               # Add dump date comment
        '--set-charset',             # Set character set info
        '--default-character-set=utf8mb4',  # Use UTF8MB4
        '--verbose',                 # Verbose output
        config['database']           # Database name
    ]

    print(f"🚀 Starting schema export from database '{config['database']}'...")
    print(f"📡 Host: {config['host']}:{config['port']}")
    print(f"👤 User: {config['user']}")
    print(f"📁 Output: {output_file}")
    print()

    try:
        # Run mysqldump and capture output
        print("⏳ Running mysqldump...")
        with open(output_file, 'w', encoding='utf-8') as f:
            # Add header comment
            header = f"""-- =============================================================================
-- OneBor Database Schema Export
-- Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
-- Database: {config['database']}
-- Host: {config['host']}:{config['port']}
-- 
-- This file contains the complete schema including:
-- * Tables with structure and indexes
-- * Views
-- * Stored procedures and functions
-- * Triggers
-- * Events
-- * Character set and collation settings
-- =============================================================================

"""
            f.write(header)

            # Run mysqldump
            result = subprocess.run(
                cmd,
                stdout=f,
                stderr=subprocess.PIPE,
                text=True,
                timeout=300  # 5 minute timeout
            )

        if result.returncode == 0:
            # Get file size
            file_size = os.path.getsize(output_file)
            file_size_mb = file_size / (1024 * 1024)

            print(f"✅ Schema export completed successfully!")
            print(f"📊 Output file: {output_file}")
            print(f"📏 File size: {file_size_mb:.2f} MB ({file_size:,} bytes)")

            # Show a preview of what was exported
            show_schema_summary(output_file)

        else:
            print(f"❌ mysqldump failed with return code {result.returncode}")
            if result.stderr:
                print(f"Error output: {result.stderr}")
            sys.exit(1)

    except subprocess.TimeoutExpired:
        print("❌ mysqldump timed out after 5 minutes")
        sys.exit(1)
    except FileNotFoundError:
        print(f"❌ mysqldump not found at: {mysqldump_path}")
        print("Please ensure MySQL client is installed:")
        print("  • macOS: brew install mysql-client")
        print("  • Ubuntu/Debian: sudo apt-get install mysql-client")
        print("  • CentOS/RHEL: sudo yum install mysql")
        print(f"  • Or update the script to use your mysqldump path")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        sys.exit(1)


def show_schema_summary(output_file):
    """Show a summary of what was exported"""
    print("\n📋 Schema Export Summary:")
    print("=" * 50)

    try:
        with open(output_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Count different schema objects
        counts = {
            'Tables': content.count('CREATE TABLE'),
            'Views': content.count('CREATE VIEW'),
            'Procedures': content.count('CREATE PROCEDURE'),
            'Functions': content.count('CREATE FUNCTION'),
            'Triggers': content.count('CREATE TRIGGER'),
            'Events': content.count('CREATE EVENT'),
            'Indexes': content.count('CREATE INDEX') + content.count('ADD INDEX'),
        }

        for item_type, count in counts.items():
            if count > 0:
                print(f"  📊 {item_type}: {count}")

        print()
        print("💡 The schema file includes:")
        print("  • Complete table structures with all columns, data types, and constraints")
        print("  • All indexes (primary keys, foreign keys, unique, and regular indexes)")
        print("  • Views with their complete definitions")
        print("  • Stored procedures and functions")
        print("  • Triggers with their event definitions")
        print("  • Scheduled events")
        print("  • Character set and collation information")
        print("  • Comments and documentation")

    except Exception as e:
        print(f"⚠️  Could not analyze schema file: {str(e)}")


def main():
    """Main function"""
    print("🗄️  OneBor Database Schema Downloader")
    print("=" * 60)

    # Get database configuration
    config = get_db_config()

    # Define output file path (relative to project root, not script location)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    database_dir = os.path.join(project_root, 'database')
    output_file = os.path.join(database_dir, 'full_database_schema.sql')

    # Ensure database directory exists
    os.makedirs(database_dir, exist_ok=True)

    # Download schema
    run_mysqldump(config, output_file)

    print(f"\n🎉 Schema download completed!")
    print(f"📁 Schema saved to: {output_file}")
    print("\n💡 Usage tips:")
    print("  • This file can be used to recreate the database structure")
    print("  • Run with: mysql -u username -p database_name < full_database_schema.sql")
    print("  • Keep this file in version control to track schema changes")
    print("  • Review the file to understand the complete database structure")


if __name__ == "__main__":
    main()
