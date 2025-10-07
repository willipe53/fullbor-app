import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Autocomplete,
  TextField,
  Button,
  Typography,
  Chip,
} from "@mui/material";
import { Clear } from "@mui/icons-material";

export interface FilterOption {
  label: string;
  value: string;
}

export interface TableFilterProps {
  filters: string[];
  data: any[];
  onFilterChange: (filters: Record<string, string>) => void;
  getFieldValue: (item: any, field: string) => string;
  getFieldLabel?: (item: any, field: string) => string;
}

const TableFilter: React.FC<TableFilterProps> = ({
  filters,
  data,
  onFilterChange,
  getFieldValue,
  getFieldLabel,
}) => {
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(
    {}
  );

  // Generate unique options for each filter field
  const filterOptions = useMemo(() => {
    const options: Record<string, FilterOption[]> = {};

    filters.forEach((filter) => {
      const uniqueValues = new Set<string>();

      data.forEach((item) => {
        const value = getFieldValue(item, filter);
        if (value && value.trim() !== "") {
          uniqueValues.add(value);
        }
      });

      options[filter] = Array.from(uniqueValues)
        .sort()
        .map((value) => ({
          label: getFieldLabel
            ? getFieldLabel(
                data.find((item) => getFieldValue(item, filter) === value)!,
                filter
              )
            : value,
          value,
        }));
    });

    return options;
  }, [data, filters, getFieldValue, getFieldLabel]);

  // Check if any filters are active
  const isDirty = useMemo(() => {
    return Object.values(activeFilters).some((value) => value !== "");
  }, [activeFilters]);

  // Handle filter changes
  const handleFilterChange = (field: string, value: string) => {
    const newFilters = { ...activeFilters, [field]: value };
    console.log(`TableFilter: Filter changed - ${field}: "${value}"`);
    console.log(`TableFilter: New filters:`, newFilters);
    setActiveFilters(newFilters);
    onFilterChange(newFilters);
  };

  // Clear all filters
  const handleClearFilters = () => {
    const clearedFilters: Record<string, string> = {};
    filters.forEach((filter) => {
      clearedFilters[filter] = "";
    });
    setActiveFilters(clearedFilters);
    onFilterChange(clearedFilters);
  };

  // Get the current value for a filter field
  const getCurrentValue = (field: string) => {
    const currentValue = activeFilters[field] || "";
    if (!currentValue) return null;

    return (
      filterOptions[field]?.find((option) => option.value === currentValue) ||
      null
    );
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        mb: 2,
        flexWrap: "wrap",
      }}
    >
      <Typography variant="subtitle2" sx={{ minWidth: "fit-content" }}>
        Filters:
      </Typography>

      {filters.map((filter) => (
        <Autocomplete
          key={filter}
          size="small"
          options={filterOptions[filter] || []}
          getOptionLabel={(option) => option.label}
          value={getCurrentValue(filter)}
          onChange={(_, newValue) => {
            handleFilterChange(filter, newValue?.value || "");
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={`${filter}...`}
              variant="outlined"
              sx={{ minWidth: 150 }}
            />
          )}
          renderOption={(props, option) => {
            const { key, ...otherProps } = props;
            return (
              <li key={key} {...otherProps}>
                <Box>
                  <Typography variant="body2">{option.label}</Typography>
                </Box>
              </li>
            );
          }}
          isOptionEqualToValue={(option, value) => option.value === value.value}
          noOptionsText="No matches found"
          clearOnEscape
          selectOnFocus
          handleHomeEndKeys
        />
      ))}

      {isDirty && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<Clear />}
          onClick={handleClearFilters}
          sx={{
            minWidth: "fit-content",
            color: "error.main",
            borderColor: "error.main",
            "&:hover": {
              backgroundColor: "error.light",
              borderColor: "error.main",
              color: "white",
            },
          }}
        >
          Clear Filters
        </Button>
      )}

      {isDirty && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Active filters:
          </Typography>
          {Object.entries(activeFilters).map(([field, value]) => {
            if (!value) return null;
            return (
              <Chip
                key={field}
                label={`${field}: ${value}`}
                size="small"
                variant="outlined"
                color="primary"
                onDelete={() => handleFilterChange(field, "")}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default TableFilter;
