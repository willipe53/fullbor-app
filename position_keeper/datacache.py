# /home/ec2-user/fullbor-pk/datacache.py

import pymysql
import pandas as pd
import time
import logging
from contextlib import contextmanager


logger = logging.getLogger("DataCache")
logger.setLevel(logging.INFO)


class DataCache:
    """Keeps hot data from MySQL in memory (as pandas DataFrames)."""

    def __init__(self, host, user, password, db, tables=None, reconnect_interval=60):
        self.db_config = dict(host=host, user=user,
                              password=password, database=db)
        self.tables = tables or ["entities",
                                 "transaction_types", "entity_types"]
        self.conn = None
        self.reconnect_interval = reconnect_interval
        self.last_conn_attempt = 0
        self.cache = {}
        self.last_refresh = {}

        self._connect()
        self.refresh_all()

    def _connect(self):
        now = time.time()
        if self.conn and self.conn.open:
            return
        if now - self.last_conn_attempt < self.reconnect_interval:
            return
        try:
            self.conn = pymysql.connect(**self.db_config)
            self.last_conn_attempt = now
            logger.info("Connected to MySQL successfully.")
        except Exception as e:
            self.last_conn_attempt = now
            logger.error(f"MySQL connection failed: {e}")

    @contextmanager
    def cursor(self):
        try:
            self._connect()
            yield self.conn.cursor()
        except Exception as e:
            logger.error(f"MySQL cursor error: {e}")
            self.conn = None
            raise

    def refresh(self, table):
        try:
            logger.info(f"Refreshing table: {table}")
            if self.conn is None or not self.conn.open:
                logger.warning(
                    f"No database connection available, skipping {table}")
                return
            df = pd.read_sql(f"SELECT * FROM {table}", self.conn)
            self.cache[table] = df
            self.last_refresh[table] = time.time()
            logger.info(f"Loaded {len(df)} rows from {table}")
        except Exception as e:
            logger.error(f"Error refreshing {table}: {e}")

    def refresh_all(self):
        for t in self.tables:
            self.refresh(t)

    def refresh_record(self, table, primary_key, primary_key_column='id'):
        """Refresh a single record in a cached table, or remove it if deleted."""
        try:
            logger.info(
                f"Refreshing single record from {table} with {primary_key_column}={primary_key}")
            if self.conn is None or not self.conn.open:
                logger.warning(
                    f"No database connection available, skipping refresh of {table}")
                return

            # Get the current cached table
            df = self.cache.get(table)
            if df is None:
                logger.info(
                    f"Table {table} not in cache, loading entire table")
                self.refresh(table)
                return

            # Fetch the single record
            query = f"SELECT * FROM {table} WHERE {primary_key_column} = %s"
            df_new_record = pd.read_sql(
                query, self.conn, params=(primary_key,))

            if df_new_record.empty:
                # Record not found in database - likely deleted, remove from cache
                logger.info(
                    f"Record not found in database (likely deleted), removing from cache: {table}.{primary_key_column}={primary_key}")
                df = df[df[primary_key_column] != primary_key]
                self.cache[table] = df
                self.last_refresh[table] = time.time()
                return

            # Remove old record if it exists and append new one
            df = df[df[primary_key_column] != primary_key]
            df = pd.concat([df, df_new_record], ignore_index=True)
            self.cache[table] = df
            self.last_refresh[table] = time.time()
            logger.info(
                f"Successfully refreshed record {primary_key_column}={primary_key} in {table}")

        except Exception as e:
            logger.error(f"Error refreshing record in {table}: {e}")

    def get(self, table):
        return self.cache.get(table)

    def lookup(self, table, **kwargs):
        df = self.cache.get(table)
        if df is None:
            return None
        filtered = df.copy()
        for col, val in kwargs.items():
            filtered = filtered[filtered[col] == val]
        return filtered

    def last_updated(self, table):
        ts = self.last_refresh.get(table)
        if ts:
            return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
        return "never"
