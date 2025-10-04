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

interface InstrumentSelectionStepProps {
  instrumentEntities: apiService.Entity[] | undefined;
  selectedInstrumentId: string;
  isInvestorTransaction: boolean;
  isLoading: boolean;
  onInstrumentChange: (instrumentId: string) => void;
  onAddNewInstrument: () => void;
}

const InstrumentSelectionStep: React.FC<InstrumentSelectionStepProps> = ({
  instrumentEntities,
  selectedInstrumentId,
  isInvestorTransaction,
  isLoading,
  onInstrumentChange,
  onAddNewInstrument,
}) => {
  // Don't render if this is an investor transaction
  if (isInvestorTransaction) {
    return null;
  }

  const selectedInstrument = instrumentEntities?.find(
    (e) => e.entity_id.toString() === selectedInstrumentId
  );

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        2. Select Instrument
      </Typography>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Autocomplete
          options={instrumentEntities || []}
          getOptionLabel={(option) => option.name}
          value={selectedInstrument || null}
          onChange={(_, newValue) =>
            onInstrumentChange(newValue?.entity_id.toString() || "")
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Instrument *"
              required
              fullWidth
            />
          )}
          disabled={isLoading}
          sx={{ flex: 1 }}
        />
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={onAddNewInstrument}
          disabled={isLoading}
          sx={{ minWidth: "auto", px: 2 }}
        >
          Add New
        </Button>
      </Stack>
    </Box>
  );
};

export default InstrumentSelectionStep;

