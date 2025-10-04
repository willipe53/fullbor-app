import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  CircularProgress,
  FormControl,
  FormLabel,
  Snackbar,
  Chip,
} from "@mui/material";
import AceEditor from "react-ace";

// Import JSON mode and theme for ace editor
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/ext-language_tools";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as apiService from "../services/api";
import AuditTrail from "./AuditTrail";

interface TransactionType {
  transaction_type_id: number;
  name: string;
  properties?: object | string;
  update_date?: string;
  updated_user_id?: number;
}

interface TransactionTypeFormProps {
  editingTransactionType?: TransactionType;
  onClose?: () => void;
}

const TransactionTypeForm: React.FC<TransactionTypeFormProps> = ({
  editingTransactionType,
  onClose,
}) => {
  const [name, setName] = useState("");
  const [properties, setProperties] = useState("{}");
  const [jsonError, setJsonError] = useState("");
  const [showSuccessSnackbar, setShowSuccessSnackbar] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [initialFormState, setInitialFormState] = useState<{
    name: string;
    properties: string;
  } | null>(null);

  const queryClient = useQueryClient();

  // Function to check if form is dirty
  const checkIfDirty = useCallback(() => {
    if (!initialFormState) return false;

    const currentState = {
      name,
      properties,
    };

    return (
      currentState.name !== initialFormState.name ||
      currentState.properties !== initialFormState.properties
    );
  }, [name, properties, initialFormState]);

  // Update dirty state whenever form values change
  useEffect(() => {
    setIsDirty(checkIfDirty());
  }, [checkIfDirty]);

  // Populate form when editing a transaction type
  useEffect(() => {
    if (editingTransactionType) {
      setName(editingTransactionType.name || "");

      // Set properties string - always format when editing
      if (editingTransactionType.properties) {
        try {
          let propertiesStr;

          if (typeof editingTransactionType.properties === "string") {
            // If it's already a string, parse it first then format it
            const parsed = JSON.parse(editingTransactionType.properties);
            propertiesStr = JSON.stringify(parsed, null, 2);
          } else {
            // If it's an object, format it directly
            propertiesStr = JSON.stringify(
              editingTransactionType.properties,
              null,
              2
            );
          }

          // Validate JSON
          JSON.parse(propertiesStr);
          setProperties(propertiesStr);
          setJsonError("");
        } catch {
          setJsonError("Invalid JSON properties format");
          setProperties("{}");
        }
      } else {
        setProperties("{}");
      }

      // Set initial form state for dirty tracking (after all fields are populated)
      setTimeout(() => {
        let propertiesStr;
        if (editingTransactionType.properties) {
          try {
            if (typeof editingTransactionType.properties === "string") {
              // If it's already a string, parse it first then format it
              const parsed = JSON.parse(editingTransactionType.properties);
              propertiesStr = JSON.stringify(parsed, null, 2);
            } else {
              // If it's an object, format it directly
              propertiesStr = JSON.stringify(
                editingTransactionType.properties,
                null,
                2
              );
            }
          } catch {
            propertiesStr = "{}";
          }
        } else {
          propertiesStr = "{}";
        }

        setInitialFormState({
          name: editingTransactionType.name || "",
          properties: propertiesStr,
        });
        setIsDirty(false); // Reset dirty state when loading existing transaction type
      }, 0);
    } else {
      // For new transaction types, set initial state immediately
      setInitialFormState({
        name: "",
        properties: "{}",
      });
      setIsDirty(false);
    }
  }, [editingTransactionType]);

  const mutation = useMutation({
    mutationFn: apiService.updateTransactionType,
    onSuccess: () => {
      if (!editingTransactionType) {
        // Reset form only for create mode
        setName("");
        setProperties("{}");
        setJsonError("");
      }
      // Show success notification
      setShowSuccessSnackbar(true);

      // Invalidate and refetch transaction types queries to refresh tables immediately
      queryClient.invalidateQueries({ queryKey: ["transaction-types"] });
      queryClient.refetchQueries({ queryKey: ["transaction-types"] });

      // Close modal after successful operation (with a small delay to show the success message)
      if (onClose) {
        setTimeout(() => {
          onClose();
        }, 1000); // 1 second delay to show success message
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiService.deleteRecord(
        editingTransactionType!.transaction_type_id,
        "Transaction Type"
      ),
    onSuccess: () => {
      // Show success notification
      setShowSuccessSnackbar(true);

      // Invalidate and refetch transaction types queries to refresh tables immediately
      queryClient.invalidateQueries({ queryKey: ["transaction-types"] });
      queryClient.refetchQueries({ queryKey: ["transaction-types"] });

      // Close modal after successful deletion
      if (onClose) {
        setTimeout(() => {
          onClose();
        }, 1000); // 1 second delay to show success message
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate JSON properties
    if (jsonError) {
      return;
    }

    try {
      // Parse JSON string to object for API
      let propertiesObject = null;
      if (properties.trim() && properties.trim() !== "{}") {
        propertiesObject = JSON.parse(properties);
      }

      const requestData: apiService.CreateTransactionTypeRequest & {
        transaction_type_id?: number;
      } = {
        name,
        ...(propertiesObject && { properties: propertiesObject }),
      };

      // Add transaction_type_id for updates
      if (editingTransactionType) {
        requestData.transaction_type_id =
          editingTransactionType.transaction_type_id;
      }
      mutation.mutate(requestData);
    } catch (error) {
      console.error("Error preparing request:", error);
    }
  };

  const handleJsonChange = (value: string) => {
    setProperties(value);
    try {
      JSON.parse(value);
      setJsonError("");
    } catch {
      setJsonError("Invalid JSON syntax");
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(properties);
      const formatted = JSON.stringify(parsed, null, 2);
      setProperties(formatted);
      setJsonError("");
    } catch {
      setJsonError("Cannot format: Invalid JSON syntax");
    }
  };

  const isJsonAlreadyFormatted = () => {
    try {
      const parsed = JSON.parse(properties);
      const formatted = JSON.stringify(parsed, null, 2);
      return properties === formatted;
    } catch {
      return false; // Invalid JSON, so not formatted
    }
  };

  const canSubmit =
    name.trim() &&
    !jsonError &&
    !mutation.isPending &&
    (editingTransactionType?.transaction_type_id ? isDirty : true); // For existing types, require dirty; for new types, always allow

  return (
    <Box
      sx={{ height: "100%", display: "flex", flexDirection: "column", p: 3 }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 4,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          maxHeight: "90vh",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h4">
            {editingTransactionType
              ? "Edit Transaction Type"
              : "Create Transaction Type"}
          </Typography>
          {editingTransactionType && (
            <Chip
              label={`ID: ${editingTransactionType.transaction_type_id}`}
              size="small"
              variant="outlined"
              sx={{
                backgroundColor: "rgba(25, 118, 210, 0.1)",
                borderColor: "rgba(25, 118, 210, 0.5)",
                color: "primary.main",
                fontWeight: "500",
              }}
            />
          )}
        </Box>

        {mutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Error:{" "}
            {mutation.error?.message ||
              `Failed to ${
                editingTransactionType ? "update" : "create"
              } transaction type`}
          </Alert>
        )}

        {deleteMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Error:{" "}
            {deleteMutation.error?.message ||
              "Failed to delete transaction type"}
          </Alert>
        )}

        {mutation.isSuccess && !editingTransactionType && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Transaction type created successfully!
          </Alert>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ height: "100%", display: "flex", flexDirection: "column" }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              flex: 1,
              overflow: "auto",
              pr: 1,
              pb: 2,
            }}
          >
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              disabled={mutation.isPending}
            />

            <FormControl fullWidth>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <FormLabel>Properties (JSON)</FormLabel>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={formatJson}
                  disabled={mutation.isPending || isJsonAlreadyFormatted()}
                  sx={{ minWidth: "auto", px: 2 }}
                >
                  Format JSON
                </Button>
              </Box>
              <Box
                sx={{
                  border: jsonError ? "2px solid #f44336" : "1px solid #ccc",
                  borderRadius: 1,
                  height: 300,
                  overflow: "auto",
                  backgroundColor: "#fafafa",
                }}
              >
                <AceEditor
                  mode="json"
                  theme="github"
                  value={properties}
                  onChange={handleJsonChange}
                  name="json-properties-editor"
                  width="100%"
                  height="300px"
                  fontSize={14}
                  showPrintMargin={false}
                  showGutter={true}
                  highlightActiveLine={true}
                  setOptions={{
                    enableBasicAutocompletion: true,
                    enableLiveAutocompletion: true,
                    enableSnippets: true,
                    showLineNumbers: true,
                    tabSize: 2,
                    useWorker: false, // Disable worker for better compatibility
                  }}
                  style={{
                    backgroundColor: "#fafafa",
                    borderRadius: "4px",
                  }}
                />
              </Box>
              {jsonError && (
                <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                  {jsonError}
                </Typography>
              )}
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1 }}
              >
                Optional JSON properties for additional metadata about this
                transaction type.
              </Typography>
            </FormControl>

            {/* Audit Trail */}
            <AuditTrail
              updateDate={editingTransactionType?.update_date}
              updatedUserId={editingTransactionType?.updated_user_id}
            />

            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mt: 2,
                flexShrink: 0,
              }}
            >
              {/* Delete button - only show when editing */}
              {editingTransactionType && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Are you sure you want to delete "${editingTransactionType.name}"?\n\nThis action cannot be undone and may affect related transactions.`
                      )
                    ) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={mutation.isPending || deleteMutation.isPending}
                  sx={{ minWidth: "auto" }}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <CircularProgress size={16} sx={{ mr: 1 }} />
                      Deleting...
                    </>
                  ) : (
                    "Delete"
                  )}
                </Button>
              )}

              <Box sx={{ display: "flex", gap: 2 }}>
                {editingTransactionType && onClose && (
                  <Button
                    variant="outlined"
                    onClick={onClose}
                    disabled={mutation.isPending || deleteMutation.isPending}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!canSubmit || deleteMutation.isPending}
                >
                  {mutation.isPending ? (
                    <>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      {editingTransactionType ? "Updating..." : "Creating..."}
                    </>
                  ) : editingTransactionType?.transaction_type_id ? (
                    `Update ${editingTransactionType.name}`
                  ) : (
                    "Create Transaction Type"
                  )}
                </Button>
              </Box>
            </Box>
          </Box>
        </form>
      </Paper>

      {/* Success notification */}
      <Snackbar
        open={showSuccessSnackbar}
        autoHideDuration={3000}
        onClose={() => setShowSuccessSnackbar(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="success"
          onClose={() => setShowSuccessSnackbar(false)}
          sx={{ width: "100%" }}
        >
          {deleteMutation.isSuccess
            ? "Transaction type deleted successfully!"
            : editingTransactionType
            ? "Transaction type updated successfully!"
            : "Transaction type created successfully!"}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TransactionTypeForm;
