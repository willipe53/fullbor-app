import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Box,
  Typography,
  Chip,
  CircularProgress,
} from "@mui/material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as apiService from "../services/api";
import type {
  ClientGroup,
  CreateInvitationRequest,
  User,
} from "../services/api";
import { useAuth } from "../contexts/AuthContext";

interface InviteUserFormProps {
  open: boolean;
  onClose: () => void;
}

interface FormData {
  clientGroupId: number | "";
  clientGroupName: string | "";
  email: string;
  expiresAt: Date | null;
}

interface ValidationError {
  field: string;
  message: string;
}

export const InviteUserForm: React.FC<InviteUserFormProps> = ({
  open,
  onClose,
}) => {
  const { userId } = useAuth();

  const [formData, setFormData] = useState<FormData>({
    clientGroupId: "",
    clientGroupName: "",
    email: "",
    expiresAt: null,
  });

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [invitationCode, setInvitationCode] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Fetch current user data to get primary client group
  const { data: currentUser } = useQuery({
    queryKey: ["user", userId],
    queryFn: async () => {
      const result = await apiService.queryUsers({ sub: userId! });

      // Handle paginated response
      const users: User[] = (
        Array.isArray(result)
          ? result
          : result && "data" in result
          ? result.data
          : []
      ) as User[];

      // Find the user with matching sub
      return users.find((user) => user.sub === userId) || null;
    },
    enabled: !!userId,
  });

  // Fetch all client groups the user has access to
  const {
    data: clientGroups = [],
    isLoading: clientGroupsLoading,
    error: clientGroupsError,
  } = useQuery<ClientGroup[]>({
    queryKey: ["allClientGroups", currentUser?.user_id],
    queryFn: async () => {
      console.log(
        "🔍 InviteUserForm - Fetching all client groups for user:",
        currentUser?.user_id,
        "currentUser:",
        currentUser
      );

      // Get all client groups (the backend filters by X-Current-User-Id header)
      const result = await apiService.queryClientGroups({});
      console.log("🔍 InviteUserForm - Client groups result:", result);
      console.log(
        "🔍 InviteUserForm - Result type:",
        typeof result,
        "isArray:",
        Array.isArray(result)
      );

      // Handle paginated response
      const groups = Array.isArray(result)
        ? result
        : result && "data" in result
        ? result.data
        : [];

      console.log(
        "🔍 InviteUserForm - Processed groups:",
        groups,
        "length:",
        groups.length
      );
      return groups;
    },
    enabled: open && !!userId,
  });

  console.log(
    "🔍 InviteUserForm - clientGroups:",
    clientGroups,
    "length:",
    clientGroups?.length,
    "isLoading:",
    clientGroupsLoading,
    "error:",
    clientGroupsError,
    "enabled (open && !!userId):",
    open && !!userId,
    "open:",
    open,
    "userId:",
    userId
  );

  // Check if email is already a member of selected client group
  const { refetch: checkExistingUser } = useQuery({
    queryKey: ["existingUsers", formData.email, formData.clientGroupId],
    queryFn: async () => {
      const result = await apiService.queryUsers({ email: formData.email });

      // Handle paginated response
      const users: User[] = (
        Array.isArray(result)
          ? result
          : result && "data" in result
          ? result.data
          : []
      ) as User[];

      return users;
    },
    enabled: false, // Only run when manually triggered
    retry: false,
  });

  // Create invitation mutation
  const createInvitationMutation = useMutation({
    mutationFn: (data: CreateInvitationRequest) => {
      console.log(
        "🔍 InviteUserForm - Mutation function called with data:",
        data
      );
      return apiService.createInvitation(data);
    },
    onSuccess: (response) => {
      console.log("🔍 InviteUserForm - Mutation success:", response);
      // The API actually returns the invitation data, not void!
      if (response && response.code) {
        setInvitationCode(response.code);
        setCopySuccess(false); // Reset copy state for new invitation
      }
      setIsGenerating(false);
    },
    onError: (error) => {
      console.error("🔍 InviteUserForm - Mutation error:", error);
      setIsGenerating(false);
    },
  });

  // Clear validation errors when email changes
  useEffect(() => {
    if (formData.email) {
      setValidationErrors((prev) =>
        prev.filter((error) => error.field !== "email")
      );
    }
  }, [formData.email]);

  // Initialize form with default values
  useEffect(() => {
    console.log("🔍 InviteUserForm - Form initialization effect triggered:", {
      open,
      currentUser: currentUser
        ? {
            user_id: currentUser.user_id,
            email: currentUser.email,
            primary_client_group_id: currentUser.primary_client_group_id,
          }
        : null,
      clientGroupsLength: clientGroups.length,
      clientGroups: clientGroups.map((cg) => ({
        client_group_id: cg.client_group_id,
        client_group_name: cg.client_group_name,
      })),
    });

    if (open && currentUser && clientGroups.length > 0) {
      const primaryClientGroup = clientGroups.find(
        (cg) => cg.client_group_id === currentUser.primary_client_group_id
      );

      console.log(
        "🔍 InviteUserForm - Found primary client group:",
        primaryClientGroup
      );

      setFormData({
        clientGroupId: currentUser.primary_client_group_id || "",
        clientGroupName: primaryClientGroup?.client_group_name || "",
        email: "",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      });
      setValidationErrors([]);
      setInvitationCode("");
    } else {
      console.log("🔍 InviteUserForm - Form initialization skipped:", {
        open,
        hasCurrentUser: !!currentUser,
        clientGroupsLength: clientGroups.length,
      });
    }
  }, [open, currentUser, clientGroups]);

  // Validate email format
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Check if user is already a member of the selected client group
  const checkUserMembership = async () => {
    if (!formData.email || !formData.clientGroupId) return;

    console.log("🔍 InviteUserForm - Checking user membership:", {
      email: formData.email,
      clientGroupId: formData.clientGroupId,
    });

    try {
      const result = await checkExistingUser();
      console.log("🔍 InviteUserForm - Check existing user result:", result);

      if (result.data && result.data.length > 0) {
        const existingUser = result.data[0];
        console.log("🔍 InviteUserForm - Found existing user:", {
          user: existingUser,
          primaryClientGroupId: existingUser.primary_client_group_id,
          selectedClientGroupId: formData.clientGroupId,
          isMember:
            existingUser.primary_client_group_id === formData.clientGroupId,
        });

        if (existingUser.primary_client_group_id === formData.clientGroupId) {
          const clientGroup = clientGroups.find(
            (cg) => cg.client_group_id === formData.clientGroupId
          );
          console.log(
            "🔍 InviteUserForm - Setting validation error for existing member"
          );
          setValidationErrors([
            {
              field: "email",
              message: `${formData.email} is already a member of ${
                clientGroup?.client_group_name || "this client group"
              }`,
            },
          ]);
          return false;
        }
      }
      console.log(
        "🔍 InviteUserForm - User is not a member, validation passed"
      );
      return true;
    } catch (error) {
      console.error("Error checking user membership:", error);
      return true;
    }
  };

  // Validate form
  const validateForm = async (): Promise<boolean> => {
    console.log("🔍 InviteUserForm - Starting form validation");
    const errors: ValidationError[] = [];

    if (!formData.clientGroupId) {
      console.log("🔍 InviteUserForm - Missing client group ID");
      errors.push({
        field: "clientGroupId",
        message: "Please select a client group",
      });
    }

    if (!formData.email) {
      errors.push({ field: "email", message: "Email is required" });
    } else if (!validateEmail(formData.email)) {
      errors.push({
        field: "email",
        message: "Please enter a valid email address",
      });
    }

    if (!formData.expiresAt) {
      errors.push({
        field: "expiresAt",
        message: "Expiration date is required",
      });
    } else if (formData.expiresAt <= new Date()) {
      errors.push({
        field: "expiresAt",
        message: "Expiration date must be in the future",
      });
    }

    console.log("🔍 InviteUserForm - Validation errors found:", errors);
    setValidationErrors(errors);

    if (errors.length === 0) {
      console.log(
        "🔍 InviteUserForm - No validation errors, checking user membership"
      );
      // Check if user is already a member
      const isNotMember = await checkUserMembership();
      console.log(
        "🔍 InviteUserForm - User membership check result:",
        isNotMember
      );
      return isNotMember ?? true;
    }

    console.log("🔍 InviteUserForm - Validation failed with errors:", errors);
    return false;
  };

  // Handle form submission
  const handleGenerateInvitation = async () => {
    console.log("🔍 InviteUserForm - Generate invitation clicked");
    console.log("🔍 InviteUserForm - Current form data:", formData);
    console.log(
      "🔍 InviteUserForm - Current validation errors:",
      validationErrors
    );

    const isValid = await validateForm();
    console.log("🔍 InviteUserForm - Form validation result:", isValid);

    if (!isValid) {
      console.log("🔍 InviteUserForm - Form validation failed, stopping");
      return;
    }

    console.log("🔍 InviteUserForm - Starting invitation creation");
    setIsGenerating(true);

    const invitationData = {
      expires_at: formData.expiresAt!.toISOString(),
      client_group_name: formData.clientGroupName as string,
      email_sent_to: formData.email,
    };

    console.log("🔍 InviteUserForm - Invitation data:", invitationData);
    console.log(
      "🔍 InviteUserForm - About to call createInvitationMutation.mutate"
    );
    createInvitationMutation.mutate(invitationData);
    console.log("🔍 InviteUserForm - createInvitationMutation.mutate called");
  };

  // Handle send invitation
  const handleSendInvitation = () => {
    const selectedClientGroup = clientGroups.find(
      (cg) => cg.client_group_id === formData.clientGroupId
    );
    const expiresAtFormatted = formData.expiresAt!.toLocaleString();
    const invitationUrl = `https://fullbor.ai/accept_invitation/${invitationCode}`;

    const subject = `Invitation to join ${selectedClientGroup?.client_group_name} on fullbor.ai`;
    const body = `You have been invited to join "${selectedClientGroup?.client_group_name}" on fullbor.ai.

This invitation will expire at ${expiresAtFormatted}.

To accept your invitation, please click the link below:

${invitationUrl}

Alternatively, you can manually enter this invitation code: ${invitationCode}

If you have any questions, please contact the person at your firm who administers fullbor.ai.`;

    const mailtoUrl = `mailto:${formData.email}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl);
  };

  // Handle close
  const handleClose = () => {
    setFormData({
      clientGroupId: "",
      clientGroupName: "",
      email: "",
      expiresAt: null,
    });
    setValidationErrors([]);
    setInvitationCode("");
    setIsGenerating(false);
    setCopySuccess(false);
    onClose();
  };

  // Get error message for a field
  const getFieldError = (field: string): string | undefined => {
    return validationErrors.find((error) => error.field === field)?.message;
  };

  // Check if form is valid for generating invitation
  const canGenerateInvitation =
    !!formData.clientGroupId &&
    !!formData.email &&
    !!formData.expiresAt &&
    validationErrors.length === 0;

  // Debug the button state
  console.log("🔍 InviteUserForm - Button state:", {
    canGenerateInvitation,
    clientGroupId: formData.clientGroupId,
    email: formData.email,
    expiresAt: formData.expiresAt,
    validationErrorsLength: validationErrors.length,
    isGenerating,
  });

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disablePortal
    >
      <DialogTitle>Invite User</DialogTitle>

      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} sx={{ mt: 1 }}>
          {/* Client Group Selection */}
          <FormControl fullWidth error={!!getFieldError("clientGroupId")}>
            <InputLabel>Invite To Join</InputLabel>
            <Select
              value={formData.clientGroupId}
              onChange={(e) => {
                const selectedId = e.target.value as number;
                const selectedGroup = clientGroups.find(
                  (cg) => cg.client_group_id === selectedId
                );
                setFormData({
                  ...formData,
                  clientGroupId: selectedId,
                  clientGroupName: selectedGroup?.client_group_name || "",
                });
              }}
              label="Invite To Join"
            >
              {clientGroups.length === 0 ? (
                <MenuItem disabled>
                  {currentUser
                    ? "Loading client groups..."
                    : "No client groups available"}
                </MenuItem>
              ) : (
                clientGroups.map((group) => {
                  const isPrimary =
                    group.client_group_id ===
                    currentUser?.primary_client_group_id;
                  console.log("🔍 InviteUserForm - Rendering group:", {
                    group: {
                      client_group_id: group.client_group_id,
                      client_group_name: group.client_group_name,
                    },
                    isPrimary,
                    currentUserPrimaryId: currentUser?.primary_client_group_id,
                  });

                  return (
                    <MenuItem
                      key={group.client_group_id}
                      value={group.client_group_id}
                    >
                      {group.client_group_name}
                      {isPrimary && " (Primary)"}
                    </MenuItem>
                  );
                })
              )}
            </Select>
            {getFieldError("clientGroupId") && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                {getFieldError("clientGroupId")}
              </Typography>
            )}
          </FormControl>

          {/* Email Field */}
          <TextField
            fullWidth
            label="Invitee Email"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            error={!!getFieldError("email")}
            helperText={getFieldError("email")}
            type="email"
          />

          {/* Expiration Date */}
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DateTimePicker
              label="Invite Expires At"
              value={formData.expiresAt}
              onChange={(newValue) =>
                setFormData({ ...formData, expiresAt: newValue })
              }
              slotProps={{
                textField: {
                  fullWidth: true,
                  error: !!getFieldError("expiresAt"),
                  helperText: getFieldError("expiresAt"),
                },
              }}
            />
          </LocalizationProvider>

          {/* Invitation Code Display */}
          {invitationCode && (
            <>
              <Alert severity="success">
                <Typography variant="body2">
                  Invitation generated successfully! Use the "Send Invitation"
                  button to email the invitation.
                </Typography>
              </Alert>

              {/* Code with Copy Button */}
              <Box display="flex" alignItems="center" gap={1} sx={{ mt: 1 }}>
                <Chip
                  label={`Code: ${invitationCode}`}
                  color="primary"
                  size="medium"
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(invitationCode);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    } catch (err) {
                      console.error("Failed to copy code:", err);
                    }
                  }}
                  title="Copy code to clipboard"
                  sx={{ minWidth: "auto", px: 1 }}
                  color={copySuccess ? "success" : "primary"}
                >
                  {copySuccess ? "Copied!" : "Copy"}
                </Button>
              </Box>
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>

        {!invitationCode ? (
          <Button
            variant="contained"
            onClick={handleGenerateInvitation}
            disabled={!canGenerateInvitation || isGenerating}
            startIcon={isGenerating ? <CircularProgress size={20} /> : null}
          >
            {isGenerating ? "Generating..." : "Generate Invitation"}
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSendInvitation}
            color="success"
          >
            Send Invitation
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
