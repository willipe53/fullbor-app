#!/usr/bin/env python3
from urllib.parse import unquote
from botocore.exceptions import ClientError
from datetime import datetime
import os
import pymysql
import boto3
import pandas as pd
from datetime import date
import json
import dotenv

dotenv.load_dotenv()


def get_db_connection():
    try:
        connection = pymysql.connect(
            host=os.getenv('DB_HOST'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASS'),
            database=os.getenv('DATABASE'),
            connect_timeout=10,
            read_timeout=10,
            write_timeout=10
        )
        return connection
    except Exception as e:
        raise Exception(f"Failed to connect to database: {str(e)}")


def insert_trading_day(connection, trading_day):
    try:
        with connection.cursor() as cursor:
            # Try to insert the lock
            cursor.execute(
                "INSERT INTO trading_days (trading_day) VALUES (%s)",
                (trading_day)
            )
            connection.commit()
            return True
    except pymysql.IntegrityError:
        # Lock already exists (primary key constraint violation)
        return False
    except Exception as e:
        raise Exception(f"Failed to acquire lock: {str(e)}")


# 1. Generate all weekdays (Mon–Fri) from Jan 1, 2025 to Dec 31, 2027
all_days = pd.date_range(start="2025-01-01", end="2027-12-31", freq="D")
weekdays = all_days[all_days.weekday < 5]

# 2. Define the holiday dates (from above table) as Timestamps
holidays = pd.to_datetime([
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18",
    "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01",
    "2025-11-27", "2025-12-25",
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
    "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
    "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26",
    "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06",
    "2027-11-25", "2027-12-25",
])

# 3. Filter out holidays
open_days = weekdays.difference(holidays)

# 4. If you want, convert to list of date strings
open_dates = open_days.strftime("%Y-%m-%d").tolist()

# Print or inspect
# print(len(open_dates), "open trading days between 2025–2027")
# print(open_dates[:10], "...", open_dates[-10:])
connection = get_db_connection()

for trading_day in open_dates:
    print(f"Inserting trading day: {trading_day}")
    insert_trading_day(connection, trading_day)
