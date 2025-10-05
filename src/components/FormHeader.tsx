import React, { useState } from "react";
import { Box, Typography, IconButton, TextField, Chip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CancelIcon from "@mui/icons-material/Cancel";

export interface FormHeaderProps {
  // Common props
  title: string; // The main title (e.g., "Client Group", "Entity", "User")
  onClose: () => void;
  isEditing?: boolean; // Whether this is editing an existing record or creating new

  // For records with name/id (Entity, EntityType, ClientGroup)
  name?: string;
  id?: number | string;

  // For User records (email/sub instead of name/id)
  email?: string;
  sub?: string;

  // Inline editing functionality
  onNameChange?: (newName: string) => void;
  onEmailChange?: (newEmail: string) => void;
  onDirtyChange?: () => void; // Callback to notify parent that form is dirty
  isNameEditDisabled?: boolean;
  isEmailEditDisabled?: boolean;
  editable?: boolean; // Whether the name/email should be editable inline (default: true)

  // Optional additional content
  additionalContent?: React.ReactNode;
}

const FormHeader: React.FC<FormHeaderProps> = ({
  title,
  onClose,
  isEditing = false,
  name,
  id,
  email,
  sub,
  onNameChange,
  onEmailChange,
  onDirtyChange,
  isNameEditDisabled = false,
  isEmailEditDisabled = false,
  editable = true,
  additionalContent,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [tempName, setTempName] = useState(name || "");
  const [tempEmail, setTempEmail] = useState(email || "");

  const handleNameEditStart = () => {
    setTempName(name || "");
    setIsEditingName(true);
  };

  const handleNameEditCancel = () => {
    setTempName(name || "");
    setIsEditingName(false);
  };

  const handleNameEditSave = () => {
    if (onNameChange && tempName.trim() !== name) {
      onNameChange(tempName.trim());
      if (onDirtyChange) {
        onDirtyChange();
      }
    }
    setIsEditingName(false);
  };

  const handleEmailEditStart = () => {
    setTempEmail(email || "");
    setIsEditingEmail(true);
  };

  const handleEmailEditCancel = () => {
    setTempEmail(email || "");
    setIsEditingEmail(false);
  };

  const handleEmailEditSave = () => {
    if (onEmailChange && tempEmail.trim() !== email) {
      onEmailChange(tempEmail.trim());
      if (onDirtyChange) {
        onDirtyChange();
      }
    }
    setIsEditingEmail(false);
  };

  const handleKeyPress = (
    event: React.KeyboardEvent,
    type: "name" | "email"
  ) => {
    if (event.key === "Enter") {
      if (type === "name") {
        handleNameEditSave();
      } else {
        handleEmailEditSave();
      }
    } else if (event.key === "Escape") {
      if (type === "name") {
        handleNameEditCancel();
      } else {
        handleEmailEditCancel();
      }
    }
  };

  // Determine the main display value and label
  const isUserForm = email !== undefined;
  const displayValue = isUserForm ? email : name;
  const label = isUserForm ? "Email" : "Name";
  const secondaryValue = isUserForm ? sub : id;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        p: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
        backgroundColor: "background.paper",
        zIndex: 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
        <Typography variant="h5" component="h2">
          {isEditing ? (
            <>
              Edit {title}
              {displayValue && (
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    ml: 2,
                    gap: 1,
                  }}
                >
                  {isUserForm && isEditingEmail ? (
                    <TextField
                      value={tempEmail}
                      onChange={(e) => {
                        setTempEmail(e.target.value);
                        if (onDirtyChange && e.target.value !== email) {
                          onDirtyChange();
                        }
                      }}
                      onKeyDown={(e) => handleKeyPress(e, "email")}
                      size="small"
                      variant="standard"
                      disabled={isEmailEditDisabled}
                      autoFocus
                      sx={{
                        minWidth: 200,
                        "& .MuiInputBase-input": {
                          fontSize: "1.25rem",
                          fontWeight: 600,
                        },
                      }}
                      InputProps={{
                        endAdornment: (
                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <IconButton
                              size="small"
                              onClick={handleEmailEditSave}
                              disabled={
                                isEmailEditDisabled || !tempEmail.trim()
                              }
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={handleEmailEditCancel}
                              disabled={isEmailEditDisabled}
                            >
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ),
                      }}
                    />
                  ) : !isUserForm && isEditingName ? (
                    <TextField
                      value={tempName}
                      onChange={(e) => {
                        setTempName(e.target.value);
                        if (onDirtyChange && e.target.value !== name) {
                          onDirtyChange();
                        }
                      }}
                      onKeyDown={(e) => handleKeyPress(e, "name")}
                      size="small"
                      variant="standard"
                      disabled={isNameEditDisabled}
                      autoFocus
                      sx={{
                        minWidth: 200,
                        "& .MuiInputBase-input": {
                          fontSize: "1.25rem",
                          fontWeight: 600,
                        },
                      }}
                      InputProps={{
                        endAdornment: (
                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <IconButton
                              size="small"
                              onClick={handleNameEditSave}
                              disabled={isNameEditDisabled || !tempName.trim()}
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={handleNameEditCancel}
                              disabled={isNameEditDisabled}
                            >
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ),
                      }}
                    />
                  ) : (
                    <>
                      <Typography
                        component="span"
                        variant="h5"
                        sx={{ fontWeight: 600, color: "text.primary" }}
                      >
                        {displayValue || `New ${title}`}
                      </Typography>
                      {displayValue &&
                        !isUserForm &&
                        !isEditingName &&
                        editable && (
                          <IconButton
                            size="small"
                            onClick={handleNameEditStart}
                            disabled={isNameEditDisabled}
                            sx={{ ml: 1 }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                      {displayValue &&
                        isUserForm &&
                        !isEditingEmail &&
                        editable && (
                          <IconButton
                            size="small"
                            onClick={handleEmailEditStart}
                            disabled={isEmailEditDisabled}
                            sx={{ ml: 1 }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                    </>
                  )}
                </Box>
              )}
            </>
          ) : (
            `New ${title}`
          )}
        </Typography>

        {isEditing && secondaryValue && (
          <Chip
            label={`${isUserForm ? "Sub" : "ID"}: ${secondaryValue}`}
            size="small"
            color="primary"
            variant="outlined"
          />
        )}

        {additionalContent}
      </Box>

      <IconButton onClick={onClose} size="small">
        <CloseIcon />
      </IconButton>
    </Box>
  );
};

export default FormHeader;
