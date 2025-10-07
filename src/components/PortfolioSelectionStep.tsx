import React from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Autocomplete,
  Stack,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import * as apiService from "../services/api";

interface PortfolioSelectionStepProps {
  portfolioEntities: apiService.Entity[] | undefined;
  selectedPortfolioId: string;
  isInvestorTransaction: boolean;
  isLoading: boolean;
  onPortfolioChange: (portfolioId: string) => void;
  onInvestorToggle: (isInvestor: boolean) => void;
  onAddNewPortfolio: () => void;
}

const PortfolioSelectionStep: React.FC<PortfolioSelectionStepProps> = ({
  portfolioEntities,
  selectedPortfolioId,
  isInvestorTransaction,
  isLoading,
  onPortfolioChange,
  onInvestorToggle,
  onAddNewPortfolio,
}) => {
  const selectedPortfolio = portfolioEntities?.find(
    (e) => e.entity_id.toString() === selectedPortfolioId
  );

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        1. Select Portfolio
      </Typography>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Autocomplete
          options={portfolioEntities || []}
          getOptionLabel={(option) => option.entity_name}
          value={selectedPortfolio || null}
          onChange={(_, newValue) =>
            onPortfolioChange(newValue?.entity_id.toString() || "")
          }
          renderInput={(params) => (
            <TextField {...params} label="Portfolio *" required fullWidth />
          )}
          disabled={isLoading}
          sx={{ flex: 1 }}
        />
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={onAddNewPortfolio}
          disabled={isLoading}
          sx={{ minWidth: "auto", px: 2 }}
        >
          Add New
        </Button>
      </Stack>

      {/* Investor Transaction Toggle */}
      <Box sx={{ mt: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={isInvestorTransaction}
              onChange={(e) => onInvestorToggle(e.target.checked)}
              disabled={isLoading}
            />
          }
          label="Investor Txn"
        />
        {isInvestorTransaction && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Investor transactions use capital accounts instead of instruments
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default PortfolioSelectionStep;
