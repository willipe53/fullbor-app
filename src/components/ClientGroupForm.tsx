import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Chip,
  CircularProgress,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import * as apiService from "../services/api";
import FormJsonToggle from "./FormJsonToggle";
import { prepareJsonForForm } from "../utils";
import TransferList, { type TransferListItem } from "./TransferList";
import AuditTrail from "./AuditTrail";

interface ClientGroupFormProps {
  editingClientGroup: any;
  onClose: () => void;
  onAddEntities?: (clientGroup: any) => void;
}

const ClientGroupForm: React.FC<ClientGroupFormProps> = ({
  editingClientGroup,
  onClose,
  onAddEntities,
}) => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [name, setName] = useState<string>("");
  const [preferencesMode, setPreferencesMode] = useState<"form" | "json">(
    "form"
  );
  const [dynamicFields, setDynamicFields] = useState<Record<string, any>>({});
  const [fieldKeys, setFieldKeys] = useState<string[]>([]); // Stable keys for React
  const [jsonPreferences, setJsonPreferences] = useState<string>("{}");
  const [jsonError, setJsonError] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedUsers, setSelectedUsers] = useState<TransferListItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [initialFormState, setInitialFormState] = useState<{
    name: string;
    dynamicFields: Record<string, any>;
    jsonPreferences: string;
    selectedUsers: TransferListItem[];
  } | null>(null);

  // Get current user's database ID for queries
  const { data: currentUserData } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiService.queryUsers({ sub: userId! }),
    enabled: !!userId,
  });

  const currentUser =
    currentUserData && currentUserData.length > 0 ? currentUserData[0] : null;

  // Function to check if form is dirty
  const checkIfDirty = useCallback(() => {
    if (!initialFormState) return false;

    const currentState = {
      name,
      dynamicFields,
      jsonPreferences,
      selectedUsers,
    };

    return (
      currentState.name !== initialFormState.name ||
      JSON.stringify(currentState.dynamicFields) !==
        JSON.stringify(initialFormState.dynamicFields) ||
      currentState.jsonPreferences !== initialFormState.jsonPreferences ||
      JSON.stringify(currentState.selectedUsers) !==
        JSON.stringify(initialFormState.selectedUsers)
    );
  }, [name, dynamicFields, jsonPreferences, selectedUsers, initialFormState]);

  // Update dirty state whenever form values change
  useEffect(() => {
    setIsDirty(checkIfDirty());
  }, [checkIfDirty]);

  // Get current entity count for this client group (only for existing groups)
  const { data: currentGroupEntityCount } = useQuery({
    queryKey: [
      "entity-count",
      editingClientGroup?.client_group_id,
      currentUser?.user_id,
    ],
    queryFn: () =>
      apiService.queryEntityCount({
        user_id: currentUser!.user_id,
        client_group_id: editingClientGroup!.client_group_id,
      }),
    enabled: !!editingClientGroup?.client_group_id && !!currentUser?.user_id, // Only for existing groups and when user is loaded
  });

  // Fetch all users that the current user can see
  const { data: allUsersData } = useQuery({
    queryKey: ["users", "all", currentUser?.user_id],
    queryFn: () =>
      apiService.queryUsers({ requesting_user_id: currentUser!.user_id }),
    enabled: !!currentUser?.user_id,
  });

  // Fetch all client groups for name validation
  const { data: allClientGroups } = useQuery({
    queryKey: ["client-groups", "all", currentUser?.user_id],
    queryFn: () =>
      apiService.queryClientGroups({
        user_id: currentUser!.user_id,
      }),
    enabled: !!currentUser?.user_id,
  });

  // Get current members of the client group (for existing groups)
  const { data: currentMembersData } = useQuery({
    queryKey: ["users", "group-members", editingClientGroup?.client_group_id],
    queryFn: () =>
      apiService.queryUsers({
        client_group_id: editingClientGroup!.client_group_id,
      }),
    enabled: !!editingClientGroup?.client_group_id,
  });

  // Initialize form with editing client group data
  useEffect(() => {
    if (editingClientGroup?.client_group_id) {
      setName(editingClientGroup.name || "");

      // Use utility to safely parse preferences
      const { object: preferences, jsonString } = prepareJsonForForm(
        editingClientGroup.preferences
      );

      setDynamicFields(preferences);
      setFieldKeys(
        Object.keys(preferences).map((_, index) => `field_${index}`)
      );
      setJsonPreferences(jsonString);

      // For existing groups, we'll set selected users when currentMembersData loads
      // This will be handled in a separate useEffect below

      // Set initial form state for dirty tracking (after all fields are populated)
      setTimeout(() => {
        const { object: preferences, jsonString } = prepareJsonForForm(
          editingClientGroup.preferences
        );
        const members = currentMembersData
          ? currentMembersData.map((user: any) => ({
              id: user.user_id,
              label: user.email,
            }))
          : [];

        setInitialFormState({
          name: editingClientGroup.name || "",
          dynamicFields: preferences,
          jsonPreferences: jsonString,
          selectedUsers: members,
        });
        setIsDirty(false); // Reset dirty state when loading existing client group
      }, 100); // Small delay to allow currentMembersData to load
    } else {
      // New client group
      setName("");
      setDynamicFields({});
      setFieldKeys([]);
      setJsonPreferences("{}");
      setSelectedUsers([]);

      // Set initial state for new client group
      setInitialFormState({
        name: "",
        dynamicFields: {},
        jsonPreferences: "{}",
        selectedUsers: [],
      });
      setIsDirty(false);
    }
  }, [editingClientGroup, currentMembersData]);

  // Update selectedUsers when currentMembersData changes
  useEffect(() => {
    if (editingClientGroup?.client_group_id && currentMembersData) {
      const members = currentMembersData.map((user: any) => ({
        id: user.user_id,
        label: user.email,
      }));
      setSelectedUsers(members);
    }
  }, [currentMembersData, editingClientGroup?.client_group_id]);

  // Handle JSON mode changes
  useEffect(() => {
    if (preferencesMode === "json") {
      try {
        JSON.parse(jsonPreferences);
        setJsonError("");
      } catch (error) {
        setJsonError("Invalid JSON syntax");
      }
    }
  }, [jsonPreferences, preferencesMode]);

  // Mutation for making this client group primary
  const makePrimaryMutation = useMutation({
    mutationFn: async () => {
      return apiService.updateUser({
        user_id: currentUser!.user_id,
        sub: userId!,
        email: currentUser!.email,
        primary_client_group_id: editingClientGroup.client_group_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      queryClient.invalidateQueries({
        queryKey: ["client-groups", currentUser!.user_id],
      });

      // Invalidate the primary client group query used by the title bar
      queryClient.invalidateQueries({
        queryKey: ["client-groups", editingClientGroup.client_group_id],
      });

      // Also invalidate any queries that depend on the old primary group
      if (currentUser?.primary_client_group_id) {
        queryClient.invalidateQueries({
          queryKey: ["client-groups", currentUser.primary_client_group_id],
        });
      }

      // Close modal after short delay
      setTimeout(() => {
        onClose();
      }, 1000);
    },
    onError: (error: any) => {
      console.error("Make primary failed:", error);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      console.log(
        "🗑️ Starting delete for client group:",
        editingClientGroup.client_group_id
      );
      const result = await apiService.deleteClientGroup(
        editingClientGroup.client_group_name
      );
      console.log("🗑️ Delete API result:", result);
      return result;
    },
    onSuccess: (data) => {
      console.log("✅ Delete successful:", data);
      // Invalidate all client groups related queries
      queryClient.invalidateQueries({
        queryKey: ["client-groups"],
      });
      queryClient.invalidateQueries({
        queryKey: ["users"],
      });
      queryClient.invalidateQueries({
        queryKey: ["current-user"],
      });

      // Close the form and refresh the table
      onClose();
    },
    onError: (error: any) => {
      console.error("❌ Error deleting client group:", error);
      setErrors({
        submit: `Failed to delete client group: ${
          error.message || "Unknown error"
        }`,
      });
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      let result;

      if (editingClientGroup?.client_group_id) {
        // Update existing client group
        result = await apiService.updateClientGroup(data);

        // Also update membership if this is an existing group
        if (selectedUsers.length > 0 || !isCreate) {
          const membershipPromises = selectedUsers.map((user) =>
            apiService.modifyClientGroupMembership({
              add_or_remove: "add",
              client_group_id: editingClientGroup.client_group_id,
              user_id: Number(user.id),
            })
          );
          await Promise.all(membershipPromises);
        }
      } else {
        // Create new client group
        result = await apiService.createClientGroup(data);
      }

      return result;
    },
    onSuccess: () => {
      // Invalidate all client groups related queries
      queryClient.invalidateQueries({
        queryKey: ["client-groups", currentUser!.user_id],
      });
      queryClient.invalidateQueries({ queryKey: ["client-groups"] });
      queryClient.invalidateQueries({
        queryKey: ["clientGroups", currentUser!.user_id],
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });

      // Refetch the main table query
      queryClient.refetchQueries({
        queryKey: ["client-groups", currentUser!.user_id],
      });

      // Close modal after short delay
      setTimeout(() => {
        onClose();
      }, 1000);
    },
    onError: (error: any) => {
      console.error("Client group operation failed:", error);
      const friendlyError = apiService.parseApiError(error);
      setErrors({ general: friendlyError });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = "Name is required";
    } else {
      // Check for duplicate names (case-insensitive)
      const trimmedName = name.trim();
      const isDuplicate = allClientGroups?.some(
        (group: any) =>
          group.name.toLowerCase() === trimmedName.toLowerCase() &&
          group.client_group_id !== editingClientGroup?.client_group_id
      );

      if (isDuplicate) {
        newErrors.name =
          "An organization with this name already exists. Please choose a different name.";
      }
    }

    // Validate JSON mode if applicable
    let finalPreferences = dynamicFields;
    if (preferencesMode === "json") {
      if (jsonError) {
        newErrors.json = "Please fix JSON syntax errors before submitting";
      } else {
        try {
          finalPreferences = JSON.parse(jsonPreferences);
        } catch {
          newErrors.json = "Invalid JSON syntax";
        }
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) return;

    // Prepare request data
    const requestData: any = {
      name: name.trim(),
      preferences: finalPreferences,
    };

    if (editingClientGroup?.client_group_id) {
      // Include ID for updates
      requestData.client_group_id = editingClientGroup.client_group_id;
    } else {
      // Include user_id for new client groups
      requestData.user_id = currentUser!.user_id;
    }

    mutation.mutate(requestData);
  };

  const handlePreferencesFieldChange = (key: string, value: any) => {
    setDynamicFields((prev) => ({
      ...prev,
      [key]: value,
    }));

    // Update JSON representation
    const updated = { ...dynamicFields, [key]: value };
    setJsonPreferences(JSON.stringify(updated, null, 2));
  };

  const handleFieldKeyChange = (
    oldKey: string,
    newKey: string,
    _stableKey: string
  ) => {
    if (newKey === oldKey) return;

    const value = dynamicFields[oldKey];
    const updated = { ...dynamicFields };
    delete updated[oldKey];
    if (newKey) {
      updated[newKey] = value;
    }
    setDynamicFields(updated);
    setJsonPreferences(JSON.stringify(updated, null, 2));
  };

  const handleJsonChange = (value: string) => {
    setJsonPreferences(value);
    try {
      const parsed = JSON.parse(value);
      setDynamicFields(parsed);
      setJsonError("");
    } catch (error) {
      setJsonError("Invalid JSON syntax");
    }
  };

  const addPreferenceField = () => {
    const key = `setting_${Object.keys(dynamicFields).length + 1}`;
    const stableKey = `field_${fieldKeys.length}`;
    setFieldKeys((prev) => [...prev, stableKey]);
    handlePreferencesFieldChange(key, "");
  };

  const removePreferenceField = (key: string, stableKey: string) => {
    const updated = { ...dynamicFields };
    delete updated[key];
    setDynamicFields(updated);
    setFieldKeys((prev) => prev.filter((k) => k !== stableKey));
    setJsonPreferences(JSON.stringify(updated, null, 2));
  };

  const isCreate = !editingClientGroup?.client_group_id;

  const handleAddEntities = async () => {
    // First, save any pending changes (same logic as handleSubmit)
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Client group name is required";
    } else {
      // Check for duplicate names (case-insensitive)
      const trimmedName = name.trim();
      const isDuplicate = allClientGroups?.some(
        (group: any) =>
          group.name.toLowerCase() === trimmedName.toLowerCase() &&
          group.client_group_id !== editingClientGroup?.client_group_id
      );

      if (isDuplicate) {
        newErrors.name =
          "An organization with this name already exists. Please choose a different name.";
      }
    }

    let finalPreferences = dynamicFields;
    if (preferencesMode === "json") {
      if (jsonError) {
        newErrors.json = "Please fix JSON syntax errors before submitting";
      } else {
        try {
          finalPreferences = JSON.parse(jsonPreferences);
        } catch {
          newErrors.json = "Invalid JSON syntax";
        }
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) return; // Don't proceed if there are validation errors

    // Prepare request data
    const requestData: any = {
      name: name.trim(),
      preferences: finalPreferences,
    };

    if (editingClientGroup?.client_group_id) {
      // Include ID for updates
      requestData.client_group_id = editingClientGroup.client_group_id;
    } else {
      // Include user_id for new client groups
      requestData.user_id = currentUser!.user_id;
    }

    try {
      // Execute the same mutation logic as the form submission
      const result = await mutation.mutateAsync(requestData);

      // After successful save, notify parent with updated client group info
      const updatedClientGroup = {
        ...editingClientGroup,
        ...requestData,
        client_group_id: editingClientGroup?.client_group_id || result?.id,
      };

      if (onAddEntities) {
        onAddEntities(updatedClientGroup);
      }
    } catch (error) {
      console.error(
        "❌ Failed to save client group before adding entities:",
        error
      );
      // Don't proceed to entity editor if save failed
    }
  };

  return (
    <Box
      sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%" }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          flexShrink: 0,
        }}
      >
        <Typography variant="h6">
          {isCreate ? "Create Client Group" : "Edit Client Group"}
        </Typography>
        {!isCreate && (
          <Chip
            label={`ID: ${editingClientGroup.client_group_id}`}
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

      {/* Scrollable Content */}
      <Box sx={{ flex: 1, overflow: "auto", pb: 2 }}>
        {errors.general && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errors.general}
          </Alert>
        )}

        {mutation.isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Client group {isCreate ? "created" : "updated"} successfully!
          </Alert>
        )}

        {makePrimaryMutation.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to make primary:{" "}
            {makePrimaryMutation.error instanceof Error
              ? makePrimaryMutation.error.message
              : "Unknown error"}
          </Alert>
        )}

        {makePrimaryMutation.isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Client group set as primary successfully!
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          {/* Name */}
          <TextField
            fullWidth
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={!!errors.name}
            helperText={errors.name}
            disabled={mutation.isPending}
            sx={{ mb: 3 }}
            required
          />

          {/* Preferences Section */}
          <Box sx={{ mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6">Preferences</Typography>
              <FormJsonToggle
                value={preferencesMode}
                onChange={(_, newMode) => {
                  if (newMode !== null) {
                    setPreferencesMode(newMode);
                  }
                }}
                disabled={mutation.isPending}
              />
            </Box>

            {preferencesMode === "form" ? (
              <Box>
                {Object.entries(dynamicFields).map(([key, value], index) => {
                  const stableKey = fieldKeys[index] || `field_${index}`;
                  return (
                    <Box
                      key={stableKey}
                      sx={{ display: "flex", gap: 1, mb: 2 }}
                    >
                      <TextField
                        label="Setting Name"
                        value={key}
                        onChange={(e) => {
                          handleFieldKeyChange(key, e.target.value, stableKey);
                        }}
                        size="small"
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="Value"
                        value={value}
                        onChange={(e) =>
                          handlePreferencesFieldChange(key, e.target.value)
                        }
                        size="small"
                        sx={{ flex: 2 }}
                      />
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => removePreferenceField(key, stableKey)}
                      >
                        Remove
                      </Button>
                    </Box>
                  );
                })}
                <Box
                  sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}
                >
                  <Button variant="outlined" onClick={addPreferenceField}>
                    Add Preference
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box>
                <TextField
                  fullWidth
                  multiline
                  rows={8}
                  value={jsonPreferences}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  error={!!jsonError}
                  helperText={jsonError}
                  placeholder="Enter JSON preferences..."
                  sx={{
                    "& .MuiInputBase-input": {
                      fontFamily: "monospace",
                      fontSize: "0.875rem",
                    },
                  }}
                />
                {errors.json && (
                  <Typography color="error" variant="caption" sx={{ mt: 1 }}>
                    {errors.json}
                  </Typography>
                )}
              </Box>
            )}
          </Box>

          {/* Membership - only for existing groups */}
          {!isCreate && allUsersData && (
            <TransferList
              title="Membership"
              leftTitle="Available Users"
              rightTitle="Group Members"
              availableItems={allUsersData.map((user: any) => ({
                id: user.user_id,
                label: user.email,
              }))}
              selectedItems={selectedUsers}
              onSelectionChange={setSelectedUsers}
              disabled={mutation.isPending}
            />
          )}

          {/* Entity management - only for existing groups */}
          {!isCreate && (
            <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
              <Typography variant="body1" color="text.secondary">
                {editingClientGroup.name} contains{" "}
                {currentGroupEntityCount || 0} entities.
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleAddEntities}
                sx={{
                  borderRadius: "8px",
                  textTransform: "none",
                  fontWeight: 600,
                }}
              >
                Change {editingClientGroup.name} Entities
              </Button>
            </Box>
          )}

          {/* Audit Trail */}
          <AuditTrail
            updateDate={editingClientGroup.update_date}
            updatedUserId={editingClientGroup.updated_user_id}
          />
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
                    `Are you sure you want to delete "${editingClientGroup.name}"? This action cannot be undone.`
                  )
                ) {
                  deleteMutation.mutate();
                }
              }}
              disabled={
                mutation.isPending ||
                makePrimaryMutation.isPending ||
                deleteMutation.isPending
              }
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
            disabled={
              mutation.isPending ||
              makePrimaryMutation.isPending ||
              deleteMutation.isPending
            }
          >
            Cancel
          </Button>

          {/* Make Primary Button - only show for existing groups that aren't already primary */}
          {!isCreate &&
            currentUser?.primary_client_group_id !==
              editingClientGroup.client_group_id && (
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => makePrimaryMutation.mutate()}
                disabled={
                  mutation.isPending ||
                  makePrimaryMutation.isPending ||
                  deleteMutation.isPending
                }
              >
                {makePrimaryMutation.isPending ? (
                  <CircularProgress size={20} />
                ) : (
                  "Make Primary"
                )}
              </Button>
            )}

          <Button
            type="submit"
            variant="contained"
            disabled={
              mutation.isPending ||
              makePrimaryMutation.isPending ||
              deleteMutation.isPending ||
              !!jsonError ||
              (!isCreate && !isDirty) // Disable if editing existing group and not dirty
            }
          >
            {mutation.isPending ? (
              <CircularProgress size={20} />
            ) : isCreate ? (
              "Create Client Group"
            ) : (
              `Update ${editingClientGroup.name}`
            )}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default ClientGroupForm;
