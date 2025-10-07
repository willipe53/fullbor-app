import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  FormControl,
  FormLabel,
  Snackbar,
} from "@mui/material";
import AceEditor from "react-ace";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as apiService from "../services/api";
import FormHeader from "./FormHeader";

// Import JSON mode and theme for ace editor
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/ext-language_tools";

interface TransactionType {
  transaction_type_id: number;
  transaction_type_name: string;
  properties?: object | string;
  update_date?: string;
  updated_by_user_name?: string;
}

interface TransactionTypeFormProps {
  editingTransactionType?: TransactionType;
  onClose?: () => void;
}

const TransactionTypeForm: React.FC<TransactionTypeFormProps> = ({
  editingTransactionType,
  onClose,
}) => {
  // Keep track of the original transaction type name for API calls (URL path)
  const originalTransactionTypeName =
    editingTransactionType?.transaction_type_name;

  const [transactionTypeName, setTransactionTypeName] = useState("");
  const [properties, setProperties] = useState("{}");
  const [jsonError, setJsonError] = useState("");
  const [showSuccessSnackbar, setShowSuccessSnackbar] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [initialFormState, setInitialFormState] = useState<{
    transactionTypeName: string;
    properties: string;
  } | null>(null);

  const queryClient = useQueryClient();

  // Function to check if form is dirty
  const checkIfDirty = useCallback(() => {
    if (!initialFormState) return false;

    const currentState = {
      transactionTypeName,
      properties,
    };

    return (
      currentState.transactionTypeName !==
        initialFormState.transactionTypeName ||
      currentState.properties !== initialFormState.properties
    );
  }, [transactionTypeName, properties, initialFormState]);

  // Update dirty state whenever form values change
  useEffect(() => {
    setIsDirty(checkIfDirty());
  }, [checkIfDirty]);

  // Populate form when editing a transaction type
  useEffect(() => {
    if (editingTransactionType) {
      setTransactionTypeName(
        editingTransactionType.transaction_type_name || ""
      );

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
              const parsed = JSON.parse(editingTransactionType.properties);
              propertiesStr = JSON.stringify(parsed, null, 2);
            } else {
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
          transactionTypeName:
            editingTransactionType.transaction_type_name || "",
          properties: propertiesStr,
        });
        setIsDirty(false); // Reset dirty state when loading existing transaction type
      }, 0);
    } else {
      // For new transaction types, set initial state immediately
      setInitialFormState({
        transactionTypeName: "",
        properties: "{}",
      });
      setIsDirty(false);
    }
  }, [editingTransactionType]);

  const mutation = useMutation({
    mutationFn: async (data: apiService.TransactionType) => {
      if (editingTransactionType) {
        return await apiService.updateTransactionType(
          originalTransactionTypeName!,
          data
        );
      } else {
        await apiService.createTransactionType(data);
        // Return a mock TransactionType for create operations to satisfy TypeScript
        return {
          transaction_type_id: 0,
          transaction_type_name: data.transaction_type_name,
          properties: data.properties,
          update_date: new Date().toISOString(),
          updated_by_user_name: undefined,
        } as apiService.TransactionType;
      }
    },
    onSuccess: () => {
      if (!editingTransactionType) {
        // Reset form only for create mode
        setTransactionTypeName("");
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
      apiService.deleteTransactionType(
        editingTransactionType!.transaction_type_name
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

      const requestData: apiService.TransactionType = {
        transaction_type_id: editingTransactionType?.transaction_type_id || 0,
        transaction_type_name: transactionTypeName,
        ...(propertiesObject && { properties: propertiesObject }),
      };

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
    transactionTypeName.trim() &&
    !jsonError &&
    !mutation.isPending &&
    (editingTransactionType?.transaction_type_id ? isDirty : true); // For existing types, require dirty; for new types, always allow

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <FormHeader
        title="Transaction Type"
        name={editingTransactionType?.transaction_type_name}
        onNameChange={(newName) => {
          setTransactionTypeName(newName);
        }}
        isEditing={true}
        update_date={editingTransactionType?.update_date}
        updated_by_user_name={editingTransactionType?.updated_by_user_name}
        onDirtyChange={() => setIsDirty(true)}
        onClose={onClose || (() => {})}
      />

      {/* Body */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          minHeight: 0,
          p: 3,
        }}
      >
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
          </Box>
        </form>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.paper",
          flexShrink: 0,
        }}
      >
        {/* Delete button - only show when editing existing transaction type */}
        {editingTransactionType && (
          <Button
            variant="outlined"
            color="error"
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to delete "${editingTransactionType.transaction_type_name}"?\n\nThis action cannot be undone and may affect related transactions.`
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
          {onClose && (
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
            onClick={handleSubmit}
          >
            {mutation.isPending ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                {editingTransactionType ? "Updating..." : "Creating..."}
              </>
            ) : (
              "Update"
            )}
          </Button>
        </Box>
      </Box>

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
