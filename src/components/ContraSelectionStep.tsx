import React from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Autocomplete,
  Stack,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import * as apiService from "../services/api";

interface ContraSelectionStepProps {
  validContraEntities: apiService.Entity[] | undefined;
  selectedContraId: string;
  isContraRequired: boolean;
  isAutoContraSet: boolean;
  showChangeContra: boolean;
  selectedPortfolio: apiService.Entity | null;
  isLoading: boolean;
  onContraChange: (contraId: string) => void;
  onChangeContraClick: () => void;
  onAddNewContra: () => void;
}

const ContraSelectionStep: React.FC<ContraSelectionStepProps> = ({
  validContraEntities,
  selectedContraId,
  isContraRequired,
  isAutoContraSet,
  showChangeContra,
  selectedPortfolio,
  isLoading,
  onContraChange,
  onChangeContraClick,
  onAddNewContra,
}) => {
  const selectedContra = validContraEntities?.find(
    (e) => e.entity_id.toString() === selectedContraId
  );

  // If contra is not required, don't render
  if (!isContraRequired) {
    return null;
  }

  // If auto-contra is set and user hasn't clicked "Change Contra"
  if (isAutoContraSet && !showChangeContra) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          4. Contra Selection
        </Typography>
        <Box sx={{ p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
          <Typography variant="body1" gutterBottom>
            Currency amount will be reduced in{" "}
            <strong>{selectedPortfolio?.entity_name}</strong>.
          </Typography>
          <Button
            variant="outlined"
            onClick={onChangeContraClick}
            disabled={isLoading}
            sx={{ mt: 1 }}
          >
            Change Contra
          </Button>
        </Box>
      </Box>
    );
  }

  // Show contra selection interface
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        4. Contra Selection
      </Typography>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Autocomplete
          options={validContraEntities || []}
          getOptionLabel={(option) => option.entity_name}
          value={selectedContra || null}
          onChange={(_, newValue) =>
            onContraChange(newValue?.entity_id.toString() || "")
          }
          renderInput={(params) => (
            <TextField {...params} label="Contra *" required fullWidth />
          )}
          disabled={isLoading}
          sx={{ flex: 1 }}
        />
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={onAddNewContra}
          disabled={isLoading}
          sx={{ minWidth: "auto", px: 2 }}
        >
          Add New
        </Button>
      </Stack>
    </Box>
  );
};

export default ContraSelectionStep;
