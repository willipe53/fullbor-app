import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Chip,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import * as apiService from "../services/api";
import FormJsonToggle from "./FormJsonToggle";
import { prepareJsonForForm } from "../utils";
import TransferList, { type TransferListItem } from "./TransferList";

interface UserFormProps {
  editingUser: any;
  onClose: () => void;
}

const UserForm: React.FC<UserFormProps> = ({ editingUser, onClose }) => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [primaryClientGroupId, setPrimaryClientGroupId] = useState<
    number | null
  >(null);
  const [preferencesMode, setPreferencesMode] = useState<"form" | "json">(
    "form"
  );
  const [dynamicFields, setDynamicFields] = useState<Record<string, any>>({});
  const [fieldKeys, setFieldKeys] = useState<string[]>([]); // Stable keys for React
  const [jsonPreferences, setJsonPreferences] = useState<string>("{}");
  const [jsonError, setJsonError] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedClientGroups, setSelectedClientGroups] = useState<
    TransferListItem[]
  >([]);
  const [originalClientGroups, setOriginalClientGroups] = useState<
    TransferListItem[]
  >([]);
  const [isDirty, setIsDirty] = useState(false);
  const [initialFormState, setInitialFormState] = useState<{
    primaryClientGroupId: number | null;
    dynamicFields: Record<string, any>;
    jsonPreferences: string;
    selectedClientGroups: TransferListItem[];
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
      primaryClientGroupId,
      dynamicFields,
      jsonPreferences,
      selectedClientGroups,
    };

    return (
      currentState.primaryClientGroupId !==
        initialFormState.primaryClientGroupId ||
      JSON.stringify(currentState.dynamicFields) !==
        JSON.stringify(initialFormState.dynamicFields) ||
      currentState.jsonPreferences !== initialFormState.jsonPreferences ||
      JSON.stringify(currentState.selectedClientGroups) !==
        JSON.stringify(initialFormState.selectedClientGroups)
    );
  }, [
    primaryClientGroupId,
    dynamicFields,
    jsonPreferences,
    selectedClientGroups,
    initialFormState,
  ]);

  // Update dirty state whenever form values change
  useEffect(() => {
    setIsDirty(checkIfDirty());
  }, [checkIfDirty]);

  // Fetch ALL client groups available to current user (for left side of transfer list)
  const { data: availableGroupsData, isLoading: availableGroupsLoading } =
    useQuery({
      queryKey: ["available-client-groups", currentUser?.user_id],
      queryFn: () => {
        console.log(
          "🔍 UserForm - Fetching available groups for current user:",
          currentUser!.user_id
        );
        return apiService.queryClientGroups({ user_id: currentUser!.user_id });
      },
      enabled: !!currentUser?.user_id,
    });

  // Fetch client groups that the editing user is currently a member of (for right side)
  const { data: userGroupsData, isLoading: userGroupsLoading } = useQuery({
    queryKey: ["user-client-groups", editingUser?.user_id],
    queryFn: () => {
      console.log(
        "🔍 UserForm - Fetching groups for editing user:",
        editingUser!.user_id
      );
      return apiService.queryClientGroups({ user_id: editingUser!.user_id });
    },
    enabled: !!editingUser?.user_id,
  });

  console.log("🔍 UserForm - availableGroupsData:", availableGroupsData);
  console.log("🔍 UserForm - userGroupsData:", userGroupsData);

  // Initialize form with editing user data
  useEffect(() => {
    if (editingUser) {
      setPrimaryClientGroupId(editingUser.primary_client_group_id || null);

      // Use utility to safely parse preferences
      const { object: preferences, jsonString } = prepareJsonForForm(
        editingUser.preferences
      );
      setDynamicFields(preferences);
      setFieldKeys(
        Object.keys(preferences).map((_, index) => `field_${index}`)
      );
      setJsonPreferences(jsonString);

      // Initialize selected client groups with the user's actual current memberships
      if (userGroupsData && userGroupsData.length > 0) {
        console.log(
          "🔍 UserForm - Initializing with user's actual groups:",
          userGroupsData
        );
        const currentMemberships = userGroupsData.map((group: any) => ({
          id: group.client_group_id,
          label: group.name,
        }));
        setSelectedClientGroups(currentMemberships);
        setOriginalClientGroups(currentMemberships);
      } else {
        console.log(
          "🔍 UserForm - No current memberships found, starting empty"
        );
        setSelectedClientGroups([]);
        setOriginalClientGroups([]);
      }

      // Set initial form state for dirty tracking (after all fields are populated)
      setTimeout(() => {
        const { object: preferences, jsonString } = prepareJsonForForm(
          editingUser.preferences
        );
        const currentMemberships =
          userGroupsData && userGroupsData.length > 0
            ? userGroupsData.map((group: any) => ({
                id: group.client_group_id,
                label: group.name,
              }))
            : [];

        setInitialFormState({
          primaryClientGroupId: editingUser.primary_client_group_id || null,
          dynamicFields: preferences,
          jsonPreferences: jsonString,
          selectedClientGroups: currentMemberships,
        });
        setIsDirty(false); // Reset dirty state when loading existing user
      }, 0);
    } else {
      // For new users, set initial state immediately
      setInitialFormState({
        primaryClientGroupId: null,
        dynamicFields: {},
        jsonPreferences: "{}",
        selectedClientGroups: [],
      });
      setIsDirty(false);
    }
  }, [editingUser, userGroupsData]);

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

  const mutation = useMutation({
    mutationFn: async (data: apiService.UpdateUserRequest) => {
      // Update user data first
      const result = await apiService.updateUser(data);

      // Update client group memberships
      console.log(
        "🔄 UserForm - Updating client group memberships for user:",
        editingUser.user_id
      );
      console.log("🔄 UserForm - Original groups:", originalClientGroups);
      console.log("🔄 UserForm - Selected groups:", selectedClientGroups);

      // Find groups to add (in selected but not in original)
      const groupsToAdd = selectedClientGroups.filter(
        (selected) =>
          !originalClientGroups.some((original) => original.id === selected.id)
      );

      // Find groups to remove (in original but not in selected)
      const groupsToRemove = originalClientGroups.filter(
        (original) =>
          !selectedClientGroups.some((selected) => selected.id === original.id)
      );

      console.log("🔄 UserForm - Groups to add:", groupsToAdd);
      console.log("🔄 UserForm - Groups to remove:", groupsToRemove);

      const membershipPromises = [];

      // Add new memberships
      for (const group of groupsToAdd) {
        const addData = {
          add_or_remove: "add" as const,
          client_group_id: Number(group.id),
          user_id: editingUser.user_id,
        };
        console.log("🔄 UserForm - Adding membership:", addData);
        membershipPromises.push(
          apiService.modifyClientGroupMembership(addData)
        );
      }

      // Remove old memberships
      for (const group of groupsToRemove) {
        const removeData = {
          add_or_remove: "remove" as const,
          client_group_id: Number(group.id),
          user_id: editingUser.user_id,
        };
        console.log("🔄 UserForm - Removing membership:", removeData);
        membershipPromises.push(
          apiService.modifyClientGroupMembership(removeData).then((result) => {
            console.log("✅ UserForm - Remove result:", result);
            return result;
          })
        );
      }

      if (membershipPromises.length > 0) {
        await Promise.all(membershipPromises);
      }

      return result;
    },
    onSuccess: () => {
      console.log("✅ UserForm - Mutation successful, invalidating caches...");
      console.log("✅ UserForm - Current user ID:", currentUser?.user_id);
      console.log("✅ UserForm - Editing user ID:", editingUser.user_id);

      // Invalidate and refetch users queries
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["client-groups"] });

      // Invalidate the specific queries used in this form
      queryClient.invalidateQueries({
        queryKey: ["available-client-groups", currentUser?.user_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["user-client-groups", editingUser.user_id],
      });

      // Invalidate all client group related queries to be safe
      queryClient.invalidateQueries({ queryKey: ["client-groups"] });
      queryClient.invalidateQueries({ queryKey: ["available-client-groups"] });
      queryClient.invalidateQueries({ queryKey: ["user-client-groups"] });

      // Refetch to get updated data
      queryClient.refetchQueries({ queryKey: ["users"] });
      queryClient.refetchQueries({
        queryKey: ["user-client-groups", editingUser.user_id],
      });

      // Force a complete cache clear for this user's data
      queryClient.removeQueries({
        queryKey: ["user-client-groups", editingUser.user_id],
      });

      console.log("✅ UserForm - Cache invalidation complete");

      // Close modal after short delay
      setTimeout(() => {
        onClose();
      }, 1000);
    },
    onError: (error: any) => {
      console.error("User update failed:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

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
    const requestData: apiService.UpdateUserRequest = {
      user_id: editingUser.user_id,
      sub: editingUser.sub,
      email: editingUser.email,
      preferences: finalPreferences,
      primary_client_group_id: primaryClientGroupId || undefined,
    };

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

  if (availableGroupsLoading || userGroupsLoading) {
    return (
      <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h6">Edit User</Typography>
        <Chip
          label={`ID: ${editingUser.user_id}`}
          size="small"
          variant="outlined"
          sx={{
            backgroundColor: "rgba(25, 118, 210, 0.1)",
            borderColor: "rgba(25, 118, 210, 0.5)",
            color: "primary.main",
            fontWeight: "500",
          }}
        />
      </Box>

      {mutation.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to update user:{" "}
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Unknown error"}
        </Alert>
      )}

      {errors.general && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errors.general}
        </Alert>
      )}

      {mutation.isSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          User updated successfully!
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        {/* Sub (non-editable) */}
        <TextField
          fullWidth
          label="Cognito Sub ID"
          value={editingUser.sub}
          disabled
          sx={{ mb: 3 }}
        />

        {/* Email (non-editable) */}
        <TextField
          fullWidth
          label="Email"
          value={editingUser.email}
          disabled
          sx={{ mb: 3 }}
        />

        {/* Primary Client Group */}
        <TextField
          select
          fullWidth
          label="Primary Client Group"
          value={primaryClientGroupId || ""}
          onChange={(e) =>
            setPrimaryClientGroupId(Number(e.target.value) || null)
          }
          disabled={mutation.isPending}
          sx={{ mb: 3 }}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {(availableGroupsData || []).map((group: any) => (
            <MenuItem key={group.client_group_id} value={group.client_group_id}>
              {group.name}
            </MenuItem>
          ))}
        </TextField>

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
                  <Box key={stableKey} sx={{ display: "flex", gap: 1, mb: 2 }}>
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
              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
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
            </Box>
          )}
        </Box>

        {/* Client Groups Management */}
        {availableGroupsData && (
          <TransferList
            title="Client Groups"
            leftTitle="Available Groups"
            rightTitle="User's Groups"
            availableItems={availableGroupsData.map((group: any) => ({
              id: group.client_group_id,
              label: group.name,
            }))}
            selectedItems={selectedClientGroups}
            onSelectionChange={setSelectedClientGroups}
            disabled={mutation.isPending}
          />
        )}

        {/* Submit Button */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
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
            disabled={mutation.isPending || !!jsonError || !isDirty}
          >
            {mutation.isPending ? (
              <CircularProgress size={20} />
            ) : (
              `Update ${editingUser.email}`
            )}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default UserForm;
