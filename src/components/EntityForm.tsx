import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Paper,
  Box,
  Typography,
  IconButton,
  Button,
  Chip,
  TextField,
  Autocomplete,
  Alert,
} from "@mui/material";
import { Grid } from "@mui/material";
import AceEditor from "react-ace";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-github";
import FormJsonToggle from "./FormJsonToggle";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as apiService from "../services/api";

interface EntityFormProps {
  onClose: () => void;
  editingEntity?: any;
}

const EntityForm: React.FC<EntityFormProps> = ({ onClose, editingEntity }) => {
  const queryClient = useQueryClient();

  // State for form fields
  const [name, setName] = useState(editingEntity?.entity_name || "");
  const [selectedEntityType, setSelectedEntityType] = useState<any>(null);
  const [attributes, setAttributes] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // State for JSON toggle
  const [attributesMode, setAttributesMode] = useState<"form" | "json">("form");
  const [jsonAttributes, setJsonAttributes] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const containerSx = {
    width: "100%",
    maxWidth: "800px",
    margin: "0 auto",
  };

  // Fetch entity types
  const { data: entityTypesData } = useQuery({
    queryKey: ["entityTypes"],
    queryFn: () => apiService.queryEntityTypes({}),
  });

  // Create/Update entity mutation
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("Mutation function called with data:", data);
      console.log("Editing entity:", editingEntity);

      if (editingEntity?.entity_id) {
        // Update existing entity
        console.log(
          "Calling updateEntity with name:",
          editingEntity.entity_name
        );
        return await apiService.updateEntity(editingEntity.entity_name, data);
      } else {
        // Create new entity
        console.log("Calling createEntity");
        return await apiService.createEntity(data);
      }
    },
    onSuccess: (result) => {
      console.log("Mutation successful:", result);
      // Invalidate and refetch entities
      queryClient.invalidateQueries({ queryKey: ["entities"] });
      queryClient.invalidateQueries({ queryKey: ["entityTypes"] });
      onClose();
    },
    onError: (error) => {
      console.error("Entity operation failed:", error);
      setErrors({ general: "Failed to save entity. Please try again." });
    },
  });

  // Delete entity mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      console.log("Deleting entity:", editingEntity.entity_name);
      return await apiService.deleteEntity(editingEntity.entity_name);
    },
    onSuccess: () => {
      console.log("Entity deleted successfully");
      // Invalidate and refetch entities
      queryClient.invalidateQueries({ queryKey: ["entities"] });
      queryClient.invalidateQueries({ queryKey: ["entityTypes"] });
      onClose();
    },
    onError: (error) => {
      console.error("Entity deletion failed:", error);
      setErrors({ general: "Failed to delete entity. Please try again." });
    },
  });

  // Initialize form when editingEntity changes
  useEffect(() => {
    if (editingEntity) {
      setName(editingEntity.entity_name || "");
      setAttributes(editingEntity.attributes || {});

      // Find and set the selected entity type
      if (entityTypesData && editingEntity.entity_type_name) {
        const data = Array.isArray(entityTypesData)
          ? entityTypesData
          : entityTypesData.data || [];
        const entityType = data.find(
          (et: any) => et.entity_type_name === editingEntity.entity_type_name
        );
        setSelectedEntityType(entityType || null);
      }
    } else {
      setName("");
      setAttributes({});
      setSelectedEntityType(null);
    }
    setIsDirty(false);
  }, [editingEntity, entityTypesData]);

  // Handle entity type change
  const handleEntityTypeChange = useCallback((newValue: any) => {
    setSelectedEntityType(newValue);
    setIsDirty(true);
  }, []);

  // Handle name change
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value);
      setIsDirty(true);
    },
    []
  );

  // Handle attribute change
  const handleAttributeChange = useCallback((key: string, value: any) => {
    setAttributes((prev) => ({
      ...prev,
      [key]: value,
    }));
    setIsDirty(true);
  }, []);

  // Handle JSON change
  const handleJsonChange = useCallback((value: string) => {
    setJsonAttributes(value);
    setJsonError(null);
    setIsDirty(true);

    try {
      if (value.trim()) {
        const parsed = JSON.parse(value);
        setAttributes(parsed);
      } else {
        setAttributes({});
      }
    } catch (error) {
      setJsonError("Invalid JSON format");
    }
  }, []);

  // Handle mode change
  const handleModeChange = useCallback(
    (_, newMode: "form" | "json" | null) => {
      if (newMode !== null) {
        setAttributesMode(newMode);

        if (newMode === "json") {
          // Convert attributes to JSON string
          setJsonAttributes(JSON.stringify(attributes, null, 2));
        }
      }
    },
    [attributes]
  );

  // Format JSON
  const formatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonAttributes);
      setJsonAttributes(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (error) {
      setJsonError("Invalid JSON format");
    }
  }, [jsonAttributes]);

  // Check if JSON is formatted
  const isJsonFormatted = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonAttributes);
      const formatted = JSON.stringify(parsed, null, 2);
      return jsonAttributes === formatted;
    } catch {
      return false;
    }
  }, [jsonAttributes]);

  // Form submission
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const newErrors: Record<string, string> = {};

      if (!name.trim()) {
        newErrors.name = "Entity name is required";
      }

      if (!selectedEntityType) {
        newErrors.entityType = "Entity type is required";
      }

      if (jsonError) {
        newErrors.json = jsonError;
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      setErrors({});

      // Prepare the data for API call
      const entityData = {
        entity_name: name.trim(),
        entity_type_name: selectedEntityType.entity_type_name,
        attributes: attributes,
      };

      console.log("Submitting entity data:", entityData);
      console.log("Is editing:", !!editingEntity?.entity_id);
      console.log("Entity ID:", editingEntity?.entity_id);

      mutation.mutate(entityData);
    },
    [name, selectedEntityType, attributes, jsonError, mutation]
  );

  // Get schema fields for the selected entity type
  const schemaFields = useMemo(() => {
    if (!selectedEntityType?.attributes_schema) return [];

    const schema = selectedEntityType.attributes_schema;
    const attributeKeys = Object.keys(attributes);

    // Extract properties from JSON schema
    let schemaKeys: string[] = [];
    if (schema.properties) {
      schemaKeys = Object.keys(schema.properties);
    }

    // Create a superset of all keys from both schema properties and existing attributes
    const allKeys = [...new Set([...schemaKeys, ...attributeKeys])];

    return allKeys.map((key) => {
      const fieldDef = schema.properties?.[key] || {};
      return {
        key,
        ...fieldDef,
        // If it's not in the schema properties, it's a custom attribute
        isCustom: !schema.properties?.[key],
      };
    });
  }, [selectedEntityType, attributes]);

  return (
    <Paper sx={{ ...containerSx, p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="h5" component="h2">
            {editingEntity?.entity_name || "Create New Entity"}
          </Typography>
          {editingEntity?.entity_id && (
            <Chip
              label={`ID: ${editingEntity.entity_id}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Form Content */}
      <Box component="form" onSubmit={handleSubmit}>
        {/* Error Display */}
        {errors.general && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {errors.general}
          </Alert>
        )}

        {/* Entity Name */}
        <TextField
          fullWidth
          label="Entity Name *"
          value={name}
          onChange={handleNameChange}
          error={!!errors.name}
          helperText={errors.name}
          sx={{ mb: 3 }}
          required
        />

        {/* Entity Type */}
        <Autocomplete
          options={
            Array.isArray(entityTypesData)
              ? entityTypesData
              : entityTypesData?.data || []
          }
          getOptionLabel={(option) => option.entity_type_name || ""}
          getOptionKey={(option) => option.entity_type_name}
          value={selectedEntityType}
          onChange={(_, newValue) => handleEntityTypeChange(newValue)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Entity Type *"
              error={!!errors.entityType}
              helperText={errors.entityType}
            />
          )}
          sx={{ mb: 3 }}
        />

        {/* Dynamic Schema Fields */}
        {selectedEntityType && schemaFields.length > 0 && (
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
                {selectedEntityType.entity_type_name} Properties
              </Typography>

              <FormJsonToggle
                value={attributesMode}
                onChange={handleModeChange}
              />
            </Box>

            {/* Form fields mode */}
            {attributesMode === "form" && (
              <Grid container spacing={3}>
                {schemaFields.map((field) => (
                  <Grid item xs={12} sm={6} key={field.key}>
                    <TextField
                      fullWidth
                      label={field.label || field.key}
                      value={attributes[field.key] || ""}
                      onChange={(e) =>
                        handleAttributeChange(field.key, e.target.value)
                      }
                      type={field.type === "number" ? "number" : "text"}
                      helperText={
                        field.isCustom
                          ? "Custom attribute (not defined in schema)"
                          : field.description
                      }
                      color={field.isCustom ? "warning" : "primary"}
                      variant={field.isCustom ? "outlined" : "outlined"}
                    />
                  </Grid>
                ))}
              </Grid>
            )}

            {/* JSON mode */}
            {attributesMode === "json" && (
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
                    Edit attributes as JSON (Advanced)
                  </Typography>
                  <Button
                    size="small"
                    onClick={formatJson}
                    disabled={
                      !jsonAttributes.trim() || isJsonFormatted() || !!jsonError
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
                    value={jsonAttributes}
                    onChange={handleJsonChange}
                    name="json-attributes-editor"
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
        )}

        {/* Show message if no schema fields */}
        {selectedEntityType && schemaFields.length === 0 && (
          <Alert severity="info" sx={{ mb: 3 }}>
            No additional properties defined for{" "}
            {selectedEntityType.entity_type_name}
          </Alert>
        )}

        {/* Action Buttons */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            gap: 2,
            mt: 3,
          }}
        >
          {/* Delete button - only show when editing */}
          {editingEntity && (
            <Button
              variant="outlined"
              color="error"
              onClick={() => {
                if (
                  window.confirm(
                    `Are you sure you want to delete "${editingEntity.entity_name}"? This action cannot be undone.`
                  )
                ) {
                  deleteMutation.mutate();
                }
              }}
              disabled={mutation.isPending || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "DELETE"}
            </Button>
          )}

          <Box sx={{ display: "flex", gap: 2, ml: "auto" }}>
            <Button
              variant="outlined"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant="contained"
              disabled={!isDirty || !!jsonError || mutation.isPending}
            >
              {mutation.isPending
                ? "Saving..."
                : editingEntity?.entity_id
                ? "Update Entity"
                : "Create Entity"}
            </Button>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default EntityForm;
