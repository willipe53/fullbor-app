import React from "react";
import { Box, Typography, TextField, Autocomplete } from "@mui/material";
import * as apiService from "../services/api";

interface TransactionTypeSelectionStepProps {
  filteredTransactionTypes: apiService.TransactionType[] | undefined;
  selectedTransactionTypeId: string;
  isInvestorTransaction: boolean;
  isLoading: boolean;
  onTransactionTypeChange: (transactionTypeId: string) => void;
}

const TransactionTypeSelectionStep: React.FC<
  TransactionTypeSelectionStepProps
> = ({
  filteredTransactionTypes,
  selectedTransactionTypeId,
  isInvestorTransaction,
  isLoading,
  onTransactionTypeChange,
}) => {
  const selectedTransactionType = filteredTransactionTypes?.find(
    (tt) => tt.transaction_type_id.toString() === selectedTransactionTypeId
  );

  const stepTitle = isInvestorTransaction
    ? "3. Select Transaction Type"
    : "3. Select Transaction Type";

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {stepTitle}
      </Typography>
      <Autocomplete
        options={filteredTransactionTypes || []}
        getOptionLabel={(option) => option.transaction_type_name}
        value={selectedTransactionType || null}
        onChange={(_, newValue) =>
          onTransactionTypeChange(
            newValue?.transaction_type_id.toString() || ""
          )
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Transaction Type *"
            required
            fullWidth
          />
        )}
        disabled={isLoading}
      />
    </Box>
  );
};

export default TransactionTypeSelectionStep;
