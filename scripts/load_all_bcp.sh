#!/bin/bash

# Script to load all BCP files in the correct order (respecting foreign key constraints)

BCP_DIR="${1:-../database/20251006T191722}"

if [ ! -d "$BCP_DIR" ]; then
    echo "❌ Error: Directory not found: $BCP_DIR"
    exit 1
fi

echo "🚀 Loading BCP files from: $BCP_DIR"
echo ""

# Order is important due to foreign key constraints!
TABLES=(
    "transaction_statuses"
    "transaction_types"
    "entity_types"
    "client_groups"
    "users"
    "entities"
    "transactions"
    "client_group_entities"
    "client_group_users"
    "invitations"
    "lambda_locks"
)

for table in "${TABLES[@]}"; do
    bcp_file="$BCP_DIR/$table.bcp"
    if [ -f "$bcp_file" ]; then
        echo "📦 Loading $table..."
        python3 load_bcp_file.py --table "$table" "$bcp_file"
        echo ""
    else
        echo "⚠️  Skipping $table (file not found: $bcp_file)"
        echo ""
    fi
done

echo "✅ Done!"

