import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Autocomplete,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as apiService from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import FormHeader from "./FormHeader";

interface UserFormProps {
  onClose: () => void;
  editingUser?: any;
}

const UserForm: React.FC<UserFormProps> = ({ onClose, editingUser }) => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [sub, setSub] = useState("");
  const [email, setEmail] = useState("");
  const [primaryClientGroupId, setPrimaryClientGroupId] = useState<
    number | null
  >(null);
  const [preferences, setPreferences] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // State for JSON toggle
  const [preferencesMode, setPreferencesMode] = useState<"form" | "json">(
    "form"
  );
  const [jsonPreferences, setJsonPreferences] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const containerSx = {
    width: "100%",
    maxWidth: "800px",
    margin: "0 auto",
    height: "600px", // Fixed height for the form
    display: "flex",
    flexDirection: "column",
    position: "relative", // Enable absolute positioning for header/footer
  };

  // Get current user's database ID
  const { data: currentUser } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiService.getUserBySub(userId!),
    enabled: !!userId,
  });

  // Fetch all client groups (for dropdown selection)
  const { data: clientGroupsData } = useQuery({
    queryKey: ["client-groups"],
    queryFn: () => apiService.queryClientGroups({}),
    enabled: true,
  });

  // Extract client groups array from paginated response
  const clientGroups = useMemo(() => {
    if (!clientGroupsData) return [];
    const groups = Array.isArray(clientGroupsData)
      ? clientGroupsData
      : clientGroupsData.data || [];
    console.log("Client groups for dropdown:", groups);
    return groups;
  }, [clientGroupsData]);

  // Initialize form when editingUser changes
  useEffect(() => {
    if (editingUser) {
      console.log("Initializing form with editingUser:", editingUser);
      setSub(editingUser.sub || "");
      setEmail(editingUser.email || "");
      setPrimaryClientGroupId(editingUser.primary_client_group_id || null);
      console.log(
        "Setting primary client group ID:",
        editingUser.primary_client_group_id
      );
      setPreferences(editingUser.preferences || {});
      setJsonPreferences(
        JSON.stringify(editingUser.preferences || {}, null, 2)
      );
    } else {
      // Reset form for new user
      setSub("");
      setEmail("");
      setPrimaryClientGroupId(null);
      setPreferences({});
      setJsonPreferences("{}");
    }
    setErrors({});
  }, [editingUser]);

  // Handle JSON toggle
  const handlePreferencesModeChange = (
    _: React.MouseEvent<HTMLElement>,
    newMode: "form" | "json" | null
  ) => {
    if (newMode !== null) {
      if (newMode === "json") {
        // Switch to JSON mode - convert form data to JSON
        setJsonPreferences(JSON.stringify(preferences, null, 2));
      } else {
        // Switch to form mode - parse JSON to form data
        try {
          const parsed = JSON.parse(jsonPreferences);
          setPreferences(parsed);
          setJsonError(null);
        } catch (error) {
          setJsonError("Invalid JSON format");
        }
      }
      setPreferencesMode(newMode);
    }
  };

  // Handle JSON changes
  const handleJsonPreferencesChange = (value: string) => {
    setJsonPreferences(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (error) {
      setJsonError("Invalid JSON format");
    }
  };

  // Handle preference changes in form mode
  const handlePreferenceChange = (key: string, value: string) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Create/Update user mutation
  const mutation = useMutation({
    mutationFn: (data: any) => {
      console.log("🔍 UserForm mutation called with data:", data);
      if (editingUser?.sub) {
        console.log("🔍 Updating user with sub:", editingUser.sub);
        return apiService.updateUser(editingUser.sub, data);
      } else {
        console.log("🔍 Creating new user");
        return apiService.createUser(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (error: any) => {
      setErrors({ general: error.message || "An error occurred" });
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: () => apiService.deleteUser(editingUser!.sub),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (error: any) => {
      setErrors({ general: error.message || "Failed to delete user" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validation
    const newErrors: Record<string, string> = {};
    if (!primaryClientGroupId)
      newErrors.primaryClientGroup = "Primary Client Group is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const requestData = {
        sub: sub.trim(),
        email: email.trim(),
        primary_client_group_id: primaryClientGroupId,
        preferences,
      };

      mutation.mutate(requestData);
    } catch (error) {
      console.error("Error preparing request:", error);
    }
  };

  const handleDelete = () => {
    if (
      editingUser &&
      window.confirm("Are you sure you want to delete this user?")
    ) {
      deleteMutation.mutate();
    }
  };

  return (
    <Paper sx={containerSx}>
      {/* Header */}
      <FormHeader
        title="User"
        isEditing={true}
        email={editingUser?.email}
        sub={editingUser?.sub}
        onClose={onClose}
        onEmailChange={(newEmail) => {
          setEmail(newEmail);
        }}
        onDirtyChange={() => {
          // UserForm doesn't use dirty state - button is only disabled during mutation
        }}
        isEmailEditDisabled={mutation.isPending}
        editable={false}
        update_date={editingUser?.update_date}
        updated_user_id={editingUser?.updated_user_id}
        updated_by_user_name={editingUser?.updated_by_user_name}
      />

      {/* Scrollable Content */}
      <Box
        sx={{
          position: "absolute",
          top: "80px", // Height of header
          left: 0,
          right: 0,
          bottom: "80px", // Height of footer
          overflow: "auto",
          p: 3,
        }}
      >
        <Box component="form" onSubmit={handleSubmit}>
          {/* Error Display */}
          {errors.general && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {errors.general}
            </Alert>
          )}

          {/* Primary Client Group */}
          <Autocomplete
            options={clientGroups}
            getOptionLabel={(option) => option.client_group_name || ""}
            getOptionKey={(option) => option.client_group_id}
            value={
              clientGroups.find(
                (group) => group.client_group_id === primaryClientGroupId
              ) || null
            }
            onChange={(_, newValue) => {
              console.log("Autocomplete onChange:", newValue);
              setPrimaryClientGroupId(newValue?.client_group_id || null);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Primary Client Group *"
                error={!!errors.primaryClientGroup}
                helperText={errors.primaryClientGroup}
                required
              />
            )}
            sx={{ mb: 3 }}
          />

          {/* Preferences Toggle */}
          <Box sx={{ mb: 3 }}>
            <ToggleButtonGroup
              value={preferencesMode}
              exclusive
              onChange={handlePreferencesModeChange}
              aria-label="preferences mode"
            >
              <ToggleButton value="form" aria-label="form mode">
                Form
              </ToggleButton>
              <ToggleButton value="json" aria-label="json mode">
                JSON
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Preferences Form Mode */}
          {preferencesMode === "form" && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                User Preferences
              </Typography>
              {Object.keys(preferences).length === 0 ? (
                <Typography color="text.secondary">
                  No preferences set. Add some using the JSON editor.
                </Typography>
              ) : (
                Object.entries(preferences).map(([key, value]) => (
                  <TextField
                    key={key}
                    fullWidth
                    label={key}
                    value={String(value)}
                    onChange={(e) =>
                      handlePreferenceChange(key, e.target.value)
                    }
                    sx={{ mb: 2 }}
                  />
                ))
              )}
            </Box>
          )}

          {/* Preferences JSON Mode */}
          {preferencesMode === "json" && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                User Preferences (JSON)
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={10}
                value={jsonPreferences}
                onChange={(e) => handleJsonPreferencesChange(e.target.value)}
                error={!!jsonError}
                helperText={
                  jsonError || "Enter valid JSON for user preferences"
                }
                sx={{
                  "& .MuiInputBase-input": {
                    fontFamily: "monospace",
                  },
                }}
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* Fixed Footer with Action Buttons */}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.paper",
          zIndex: 1,
        }}
      >
        {/* Delete button - only show when editing */}
        {editingUser && (
          <Button
            variant="outlined"
            color="error"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        )}

        {/* Action buttons */}
        <Box sx={{ display: "flex", gap: 2, ml: "auto" }}>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            onClick={handleSubmit}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? editingUser
                ? "Updating..."
                : "Creating..."
              : editingUser
              ? "Update"
              : "Create"}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default UserForm;
