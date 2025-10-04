import React from "react";
import { ToggleButtonGroup, ToggleButton } from "@mui/material";
import { CodeRounded, ViewListRounded } from "@mui/icons-material";

interface FormJsonToggleProps {
  value: "form" | "json";
  onChange: (
    event: React.MouseEvent<HTMLElement>,
    mode: "form" | "json"
  ) => void;
  disabled?: boolean;
}

const FormJsonToggle: React.FC<FormJsonToggleProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={onChange}
      size="small"
      disabled={disabled}
    >
      <ToggleButton value="form" aria-label="form mode">
        <ViewListRounded sx={{ mr: 1 }} />
        Form
      </ToggleButton>
      <ToggleButton value="json" aria-label="json mode">
        <CodeRounded sx={{ mr: 1 }} />
        JSON
      </ToggleButton>
    </ToggleButtonGroup>
  );
};

export default FormJsonToggle;
