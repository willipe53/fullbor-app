import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as apiService from "../services/api";
import { parseServerDate } from "../utils";

interface ClientGroupOnboardingProps {
  open: boolean;
  userEmail: string;
  userId: string;
  onComplete: (clientGroupId: number) => void;
  onCancel: () => void;
  prefilledInvitationCode?: string;
}

const ClientGroupOnboarding: React.FC<ClientGroupOnboardingProps> = ({
  open,
  userEmail,
  userId,
  onComplete,
  onCancel,
  prefilledInvitationCode,
}) => {
  const [step, setStep] = useState<
    "prompt" | "invitation-code" | "create-group" | "error"
  >(prefilledInvitationCode ? "invitation-code" : "prompt");
  const [organizationName, setOrganizationName] = useState("");
  const [invitationCode, setInvitationCode] = useState(
    prefilledInvitationCode || ""
  );
  const [error, setError] = useState<string>("");

  // Query to get user's current client groups
  const { data: userClientGroups } = useQuery({
    queryKey: ["user-client-groups", userId],
    queryFn: () => {
      console.log("🔍 Fetching client groups for user:", userId);
      return apiService.queryClientGroups({}); // API no longer filters by user_id
    },
    enabled: !!userId,
  });

  const createClientGroupMutation = useMutation({
    mutationFn: async (data: apiService.CreateClientGroupRequest) => {
      console.log("🔍 Creating client group with data:", data);

      // First create the client group
      const result = await apiService.updateClientGroup(data);
      console.log("✅ Client group created:", result);

      // Get the current user's database ID (userId is Cognito UUID, we need database ID)
      console.log("🔍 Getting user database ID for Cognito ID:", userId);
      const currentUserData = await apiService.queryUsers({ sub: userId });
      if (!currentUserData || currentUserData.length === 0) {
        throw new Error("User not found in database");
      }
      const databaseUserId = currentUserData[0].user_id;
      console.log("✅ Found database user_id:", databaseUserId);

      // Then add the user to the newly created group
      console.log("🔍 Adding user to group:", {
        client_group_id: result.id,
        user_id: databaseUserId,
        add_or_remove: "add",
      });

      const membershipResult = await apiService.modifyClientGroupMembership({
        client_group_id: result.id,
        user_id: databaseUserId,
        add_or_remove: "add",
      });
      console.log("✅ Membership result:", membershipResult);

      return result;
    },
    onSuccess: (result) => {
      onComplete(result.id);
    },
    onError: (error: Error) => {
      const friendlyMessage = apiService.parseApiError(error);
      setError(friendlyMessage);
      setStep("error");
    },
  });

  const validateInvitationMutation = useMutation({
    mutationFn: async () => {
      // Query all invitations and filter by code
      const result = await apiService.queryInvitations({});

      // Handle paginated response format
      const invitations = result.data || result;
      const invitation = invitations.find(
        (inv: apiService.Invitation) => inv.code === invitationCode
      );

      if (!invitation) {
        throw new Error("Invalid invitation code");
      }

      return invitation;
    },
    onSuccess: (invitation: apiService.Invitation) => {
      // Check if invitation is expired
      const now = new Date();
      const expiresAt = parseServerDate(invitation.expires_at);
      if (now >= expiresAt) {
        setError("This invitation has expired or has already been used");
        return;
      }

      // Proceed with redemption
      redeemInvitationMutation.mutate(invitation);
    },
    onError: (error: Error) => {
      const friendlyMessage = apiService.parseApiError(error);
      setError(friendlyMessage);
    },
  });

  const redeemInvitationMutation = useMutation({
    mutationFn: async (invitation: apiService.Invitation) => {
      // If this is their only client group, set it as primary first
      const currentGroups = userClientGroups || [];
      if (currentGroups.length === 0) {
        await apiService.updateUser(userId!, {
          sub: userId!,
          email: userEmail!,
          primary_client_group_id: invitation.client_group_id,
        });
      }

      // Redeem the invitation (this handles adding user to group)
      await apiService.redeemInvitation(invitation.code);

      return invitation.client_group_id;
    },
    onSuccess: (clientGroupId) => {
      onComplete(clientGroupId);
    },
    onError: (error: Error) => {
      const friendlyMessage = apiService.parseApiError(error);
      setError(friendlyMessage);
    },
  });

  const handleCreateOrganization = () => {
    if (!organizationName.trim()) {
      setError("Organization name is required");
      return;
    }

    createClientGroupMutation.mutate({
      name: organizationName.trim(),
    });
  };

  const handleValidateInvitation = useCallback(() => {
    if (!invitationCode.trim()) {
      setError("Invitation code is required");
      return;
    }

    setError("");
    validateInvitationMutation.mutate();
  }, [invitationCode, validateInvitationMutation]);

  const handleCancel = () => {
    setStep("error");
  };

  const handleTryAgain = () => {
    setStep("prompt");
    setError("");
    setOrganizationName("");
    setInvitationCode("");
  };

  // Auto-validate when prefilled invitation code is provided
  React.useEffect(() => {
    if (
      prefilledInvitationCode &&
      step === "invitation-code" &&
      invitationCode &&
      !validateInvitationMutation.isPending
    ) {
      handleValidateInvitation();
    }
  }, [
    prefilledInvitationCode,
    step,
    invitationCode,
    validateInvitationMutation.isPending,
    handleValidateInvitation,
  ]);

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      {step === "prompt" && (
        <>
          <DialogTitle sx={{ pb: 2 }}>
            <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
              Client Organization Required
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.6 }}>
              I was unable to associate your email address{" "}
              <strong>({userEmail})</strong> with a client organization.
            </Typography>
            <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.6 }}>
              Please choose one of the following options:
            </Typography>
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 2 }}
            >
              <Button
                onClick={() => setStep("invitation-code")}
                variant="outlined"
                fullWidth
                sx={{ justifyContent: "flex-start", textAlign: "left" }}
              >
                I have an invitation code from my administrator
              </Button>
              <Button
                onClick={() => setStep("create-group")}
                variant="outlined"
                fullWidth
                sx={{ justifyContent: "flex-start", textAlign: "left" }}
              >
                Create a new client organization
              </Button>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button
              onClick={handleCancel}
              variant="outlined"
              color="error"
              sx={{ mr: 1 }}
            >
              Cancel
            </Button>
          </DialogActions>
        </>
      )}

      {step === "create-group" && (
        <>
          <DialogTitle sx={{ pb: 2 }}>
            <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
              Create Client Organization
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.6 }}>
              Please provide a name for your client organization:
            </Typography>
            <TextField
              fullWidth
              label="Organization Name"
              placeholder="e.g., Acme Corporation, Smith & Associates"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              disabled={createClientGroupMutation.isPending}
              autoFocus
              sx={{ mb: 2 }}
              helperText="This will be used to identify your organization in the app"
            />
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button
              onClick={() => setStep("prompt")}
              variant="outlined"
              disabled={createClientGroupMutation.isPending}
              sx={{ mr: 1 }}
            >
              Back
            </Button>
            <Button
              onClick={handleCreateOrganization}
              variant="contained"
              color="primary"
              disabled={
                !organizationName.trim() || createClientGroupMutation.isPending
              }
              startIcon={
                createClientGroupMutation.isPending ? (
                  <CircularProgress size={20} />
                ) : null
              }
            >
              {createClientGroupMutation.isPending
                ? "Creating..."
                : "Create Organization"}
            </Button>
          </DialogActions>
        </>
      )}

      {step === "invitation-code" && (
        <>
          <DialogTitle sx={{ pb: 2 }}>
            <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
              Enter Invitation Code
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.6 }}>
              Please enter the invitation code you received from your
              administrator:
            </Typography>
            <TextField
              fullWidth
              label="Invitation Code"
              placeholder="Enter your invitation code here"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              disabled={
                validateInvitationMutation.isPending ||
                redeemInvitationMutation.isPending
              }
              autoFocus
              sx={{ mb: 2 }}
              helperText="The code should have been sent to you via email"
            />
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button
              onClick={() => setStep("prompt")}
              variant="outlined"
              disabled={
                validateInvitationMutation.isPending ||
                redeemInvitationMutation.isPending
              }
              sx={{ mr: 1 }}
            >
              Back
            </Button>
            <Button
              onClick={handleValidateInvitation}
              variant="contained"
              color="primary"
              disabled={
                !invitationCode.trim() ||
                validateInvitationMutation.isPending ||
                redeemInvitationMutation.isPending
              }
              startIcon={
                validateInvitationMutation.isPending ||
                redeemInvitationMutation.isPending ? (
                  <CircularProgress size={20} />
                ) : null
              }
            >
              {validateInvitationMutation.isPending ||
              redeemInvitationMutation.isPending
                ? "Processing..."
                : "Validate Code"}
            </Button>
          </DialogActions>
        </>
      )}

      {step === "error" && (
        <>
          <DialogTitle sx={{ pb: 2 }}>
            <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
              {error &&
              error.includes("organization name") &&
              error.includes("already in use")
                ? "Unable to Create Organization"
                : "Access Denied"}
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                {error &&
                error.includes("organization name") &&
                error.includes("already in use")
                  ? error
                  : "We are sorry we cannot give you access to fullbor.ai without assigning you to a client organization."}
              </Typography>
            </Alert>
            {!(
              error &&
              error.includes("organization name") &&
              error.includes("already in use")
            ) && (
              <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                Please contact the person at your firm who administers
                fullbor.ai for further instructions.
              </Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            {error && (
              <Button
                onClick={handleTryAgain}
                variant="outlined"
                color="primary"
                sx={{ mr: 1 }}
              >
                Try Again
              </Button>
            )}
            <Button onClick={onCancel} variant="contained" color="error">
              Sign Out
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default ClientGroupOnboarding;
