import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Alert,
} from "@mui/material";
import { Grid } from "@mui/material";
import AceEditor from "react-ace";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-github";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import * as apiService from "../services/api";
import FormHeader from "./FormHeader";
import FormJsonToggle from "./FormJsonToggle";

interface ClientGroupFormProps {
  editingClientGroup: apiService.ClientGroup | null;
  onClose: () => void;
  onAddEntities?: (clientGroup: apiService.ClientGroup) => void;
}

interface PreferenceField {
  key: string;
  label: string;
  type: string;
  description: string;
  isCustom: boolean;
}

const ClientGroupForm: React.FC<ClientGroupFormProps> = ({
  editingClientGroup,
  onClose,
  onAddEntities,
}) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>("");
  const [preferences, setPreferences] = useState<apiService.JSONValue>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // State for JSON toggle
  const [preferencesMode, setPreferencesMode] = useState<"form" | "json">(
    "form"
  );
  const [jsonPreferences, setJsonPreferences] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const [initialFormState, setInitialFormState] = useState<{
    name: string;
    preferences: apiService.JSONValue;
  } | null>(null);

  const isCreate = !editingClientGroup?.client_group_id;

  // Query to get entity count for this client group
  const { data: entityCountData } = useQuery({
    queryKey: ["entities", "count", editingClientGroup?.client_group_id],
    queryFn: () =>
      apiService.queryEntities({
        client_group_id: editingClientGroup!.client_group_id,
        count: true,
      }),
    enabled: !!editingClientGroup?.client_group_id && !isCreate,
  });

  const entityCount =
    entityCountData && "count" in entityCountData ? entityCountData.count : 0;

  // Function to check if form is dirty
  const checkIfDirty = useCallback(() => {
    if (!initialFormState) return false;

    const currentState = {
      name,
      preferences,
    };

    return (
      currentState.name !== initialFormState.name ||
      JSON.stringify(currentState.preferences) !==
        JSON.stringify(initialFormState.preferences)
    );
  }, [name, preferences, initialFormState]);

  // Update dirty state whenever form values change
  useEffect(() => {
    setIsDirty(checkIfDirty());
  }, [checkIfDirty]);

  // Handle preference change
  const handlePreferenceChange = useCallback((key: string, value: unknown) => {
    setPreferences((prev) => {
      const prevObj =
        typeof prev === "object" && prev !== null
          ? (prev as Record<string, unknown>)
          : {};
      return {
        ...prevObj,
        [key]: value,
      } as apiService.JSONValue;
    });
    setIsDirty(true);
  }, []);

  // Handle JSON change
  const handleJsonChange = useCallback((value: string) => {
    setJsonPreferences(value);
    setJsonError(null);

    try {
      if (value.trim()) {
        const parsed = JSON.parse(value);
        setPreferences(parsed);
      } else {
        setPreferences({});
      }
      setIsDirty(true);
    } catch {
      setJsonError("Invalid JSON format");
    }
  }, []);

  // Handle mode change
  const handleModeChange = useCallback(
    (_: unknown, newMode: "form" | "json" | null) => {
      if (newMode !== null) {
        setPreferencesMode(newMode);

        if (newMode === "json") {
          // Convert preferences to JSON string
          setJsonPreferences(JSON.stringify(preferences, null, 2));
        }
      }
    },
    [preferences]
  );

  // Format JSON
  const formatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonPreferences);
      setJsonPreferences(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON format");
    }
  }, [jsonPreferences]);

  // Check if JSON is formatted
  const isJsonFormatted = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonPreferences);
      const formatted = JSON.stringify(parsed, null, 2);
      return jsonPreferences === formatted;
    } catch {
      return false;
    }
  }, [jsonPreferences]);

  // Get preference fields
  const preferenceFields = useMemo((): PreferenceField[] => {
    const preferenceKeys = Object.keys(
      typeof preferences === "object" && preferences !== null
        ? (preferences as Record<string, unknown>)
        : {}
    );

    return preferenceKeys.map((key): PreferenceField => {
      return {
        key,
        label: key,
        type: "text",
        description: "",
        isCustom: true, // All preference fields are custom
      };
    });
  }, [preferences]);

  // Initialize form when editingClientGroup changes
  useEffect(() => {
    if (editingClientGroup) {
      setName(editingClientGroup.client_group_name || "");
      setPreferences(editingClientGroup.preferences || {});

      // Set initial form state for dirty tracking
      setInitialFormState({
        name: editingClientGroup.client_group_name || "",
        preferences: editingClientGroup.preferences || {},
      });
    } else {
      setName("");
      setPreferences({});
      setInitialFormState({
        name: "",
        preferences: {},
      });
    }
    setIsDirty(false);
  }, [editingClientGroup]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editingClientGroup?.client_group_name) {
        throw new Error("No client group to delete");
      }
      return apiService.deleteClientGroup(editingClientGroup.client_group_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-groups"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: Partial<apiService.ClientGroup>) => {
      if (editingClientGroup?.client_group_id) {
        return apiService.updateClientGroup(
          editingClientGroup.client_group_name,
          data as apiService.ClientGroup
        );
      } else {
        return apiService.createClientGroup(data as apiService.ClientGroup);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-groups"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setTimeout(() => {
        onClose();
      }, 1000);
    },
  });

  // Handle opening entities table
  const handleOpenEntitiesTable = useCallback(async () => {
    // If form is dirty, save it first
    if (isDirty) {
      const newErrors: Record<string, string> = {};

      if (!name.trim()) {
        newErrors.name = "Client group name is required";
      }

      if (jsonError) {
        newErrors.json = jsonError;
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return; // Don't proceed if there are validation errors
      }

      setErrors({});

      // Prepare the data for API call
      const requestData: Partial<apiService.ClientGroup> = {
        client_group_name: name.trim(),
        preferences: preferences,
      };

      if (editingClientGroup?.client_group_id) {
        requestData.client_group_id = editingClientGroup.client_group_id;
      }

      try {
        const savedClientGroup = await mutation.mutateAsync(requestData);
        // After successful save, close this modal and open entities table
        onClose();
        if (onAddEntities) {
          // For create operations, savedClientGroup will be undefined, so use the request data
          // For update operations, savedClientGroup will be the updated ClientGroup
          const clientGroupToPass =
            savedClientGroup ||
            ({
              ...requestData,
              client_group_id: editingClientGroup?.client_group_id || 0,
            } as apiService.ClientGroup);
          onAddEntities(clientGroupToPass);
        }
      } catch (error) {
        console.error(
          "Failed to save client group before opening entities table:",
          error
        );
        // Don't proceed to entities table if save failed
      }
    } else {
      // No changes to save, close this modal and open entities table directly
      onClose();
      if (onAddEntities && editingClientGroup) {
        onAddEntities(editingClientGroup);
      }
    }
  }, [
    isDirty,
    name,
    jsonError,
    preferences,
    editingClientGroup,
    mutation,
    onClose,
    onAddEntities,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Client group name is required";
    }

    if (jsonError) {
      newErrors.json = jsonError;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    // Basic form submission logic
    const requestData: Partial<apiService.ClientGroup> = {
      client_group_name: name.trim(),
      preferences: preferences,
    };

    if (editingClientGroup?.client_group_id) {
      requestData.client_group_id = editingClientGroup.client_group_id;
    }

    mutation.mutate(requestData);
  };

  const containerSx = {
    width: "100%",
    maxWidth: "800px",
    margin: "0 auto",
    height: "600px",
    display: "flex",
    flexDirection: "column",
  };

  return (
    <Paper sx={containerSx}>
      {/* Fixed Header */}
      <FormHeader
        title="Client Group"
        isEditing={!isCreate}
        name={editingClientGroup?.client_group_name}
        id={editingClientGroup?.client_group_id}
        onClose={onClose}
        onNameChange={(newName) => {
          setName(newName);
        }}
        onDirtyChange={() => setIsDirty(true)}
        isNameEditDisabled={mutation.isPending || deleteMutation.isPending}
        update_date={editingClientGroup?.update_date}
        updated_by_user_name={editingClientGroup?.updated_by_user_name}
      />

      {/* Scrollable Body Content */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 3,
          minHeight: 0, // Allow flex child to shrink
        }}
      >
        <Box component="form" onSubmit={handleSubmit}>
          {/* Error Display */}
          {errors.general && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {errors.general}
            </Alert>
          )}

          {/* Preferences Section */}
          <Paper
            variant="outlined"
            sx={{ p: 3, mb: 3, backgroundColor: "rgba(0, 0, 0, 0.02)" }}
          >
            {/* Header with title and mode toggle */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 3,
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: "medium", color: "primary.main" }}
              >
                Preferences
              </Typography>

              <FormJsonToggle
                value={preferencesMode}
                onChange={handleModeChange}
              />
            </Box>

            {/* Form fields mode */}
            {preferencesMode === "form" && (
              <Grid container spacing={3}>
                {preferenceFields.map((field) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={field.key}>
                    <TextField
                      fullWidth
                      label={field.label || field.key}
                      value={
                        (typeof preferences === "object" && preferences !== null
                          ? (preferences as Record<string, unknown>)[field.key]
                          : undefined) || ""
                      }
                      onChange={(e) =>
                        handlePreferenceChange(field.key, e.target.value)
                      }
                      type={field.type === "number" ? "number" : "text"}
                      helperText={
                        field.isCustom ? "Custom preference" : field.description
                      }
                      color={field.isCustom ? "warning" : "primary"}
                      variant={field.isCustom ? "outlined" : "outlined"}
                    />
                  </Grid>
                ))}
                {preferenceFields.length === 0 && (
                  <Grid size={12}>
                    <Typography variant="body2" color="text.secondary">
                      No preferences set. Add preferences by switching to JSON
                      mode or by adding them programmatically.
                    </Typography>
                  </Grid>
                )}
              </Grid>
            )}

            {/* JSON mode */}
            {preferencesMode === "json" && (
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Edit preferences as JSON (Advanced)
                  </Typography>
                  <Button
                    size="small"
                    onClick={formatJson}
                    disabled={
                      !jsonPreferences.trim() ||
                      isJsonFormatted() ||
                      !!jsonError
                    }
                    sx={{ textTransform: "none" }}
                  >
                    Format JSON
                  </Button>
                </Box>

                {jsonError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {jsonError}
                  </Alert>
                )}

                <Box
                  sx={{
                    border: jsonError ? "2px solid #f44336" : "1px solid #ccc",
                    borderRadius: 1,
                    overflow: "hidden",
                  }}
                >
                  <AceEditor
                    mode="json"
                    theme="github"
                    value={jsonPreferences}
                    onChange={handleJsonChange}
                    name="json-preferences-editor"
                    width="100%"
                    height="300px"
                    fontSize={14}
                    showPrintMargin={false}
                    showGutter={true}
                    highlightActiveLine={true}
                    setOptions={{
                      enableBasicAutocompletion: false,
                      enableLiveAutocompletion: false,
                      enableSnippets: false,
                      showLineNumbers: true,
                      tabSize: 2,
                      useWorker: false,
                    }}
                  />
                </Box>

                {errors.json && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {errors.json}
                  </Alert>
                )}
              </Box>
            )}
          </Paper>

          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Membership
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Membership goes Here
            </Typography>
          </Box>

          {/* Entity Selection - only show for existing client groups */}
          {!isCreate && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Entity Selection
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Typography variant="body1" color="text.secondary">
                  Client Group currently contains {entityCount} entities.
                </Typography>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleOpenEntitiesTable}
                  sx={{
                    borderRadius: "8px",
                    textTransform: "none",
                    fontWeight: 600,
                  }}
                >
                  Add/Remove Entities
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Fixed Footer with Action Buttons */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 2,
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.paper",
          flexShrink: 0,
        }}
      >
        {/* Delete Button - only show for existing groups */}
        {!isCreate && (
          <Button
            variant="outlined"
            color="error"
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to delete "${editingClientGroup.client_group_name}"? This action cannot be undone.`
                )
              ) {
                deleteMutation.mutate();
              }
            }}
            disabled={mutation.isPending || deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <CircularProgress size={20} />
            ) : (
              "DELETE"
            )}
          </Button>
        )}

        <Button
          variant="outlined"
          onClick={onClose}
          disabled={mutation.isPending || deleteMutation.isPending}
        >
          Cancel
        </Button>

        <Button
          type="submit"
          variant="contained"
          disabled={mutation.isPending || deleteMutation.isPending}
        >
          {mutation.isPending ? (
            <CircularProgress size={20} />
          ) : isCreate ? (
            "Create Client Group"
          ) : (
            `Update ${editingClientGroup.client_group_name}`
          )}
        </Button>
      </Box>
    </Paper>
  );
};

export default ClientGroupForm;
