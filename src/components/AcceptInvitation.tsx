import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  Container,
  Button,
} from "@mui/material";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import * as apiService from "../services/api";
import { parseServerDate } from "../utils";
import LoginDialog from "./LoginDialog";
import SignupDialog from "./SignupDialog";
import ErrorSnackbar from "./ErrorSnackbar";

const AcceptInvitation: React.FC = () => {
  const { invitationCode } = useParams<{ invitationCode: string }>();
  const navigate = useNavigate();
  const {
    isAuthenticated,
    userEmail,
    userName,
    userId,
    isLoading: authLoading,
  } = useAuth();

  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showSignupDialog, setShowSignupDialog] = useState(false);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [invitation, setInvitation] = useState<apiService.Invitation | null>(
    null
  );

  // Store invitation code in localStorage when component mounts
  useEffect(() => {
    if (invitationCode) {
      console.log(
        "💾 Storing invitation code in localStorage:",
        invitationCode
      );
      localStorage.setItem("pendingInvitationCode", invitationCode);
    }
  }, [invitationCode]);

  // Store invitation code but DON'T fetch data until user is authenticated
  // The invitation validation will happen AFTER login/signup

  // Invitation validation is now handled inline in the useEffect

  // Query to get current user data by sub first, then email fallback
  const {
    data: currentUser,
    refetch: refetchUser,
    isLoading: currentUserLoading,
    error: currentUserError,
  } = useQuery({
    queryKey: ["user", userId, userEmail], // Use both sub and email for lookup
    queryFn: async () => {
      console.log(
        "Fetching user data for userId:",
        userId,
        "and userEmail:",
        userEmail
      );

      // Try to find user by sub (Cognito ID) first
      if (userId) {
        try {
          const usersBySub = await apiService.queryUsers({ sub: userId });
          console.log("User query by sub response:", usersBySub);
          if (usersBySub.length > 0) {
            return usersBySub[0];
          }
        } catch (error) {
          console.error("User query by sub failed:", error);
        }
      }

      // Fallback to email lookup
      if (userEmail) {
        try {
          const usersByEmail = await apiService.queryUsers({
            email: userEmail,
          });
          console.log("User query by email response:", usersByEmail);
          if (usersByEmail.length > 0) {
            return usersByEmail[0];
          }
        } catch (error) {
          console.error("User query by email failed:", error);
        }
      }

      return null;
    },
    enabled: !!(userId || userEmail) && isAuthenticated,
    retry: false,
  });

  // Query to get client group details
  const { data: clientGroups } = useQuery({
    queryKey: ["clientGroups"],
    queryFn: () => apiService.queryClientGroups({}),
    enabled: !!invitation,
  });

  // Query to check if user is already a member of the invited group
  // We don't need to check existing memberships since we're handling duplicates in the backend

  // Mutation to add user to client group and handle all related updates
  const addToGroupMutation = useMutation({
    mutationFn: async () => {
      if (!invitation || !currentUser)
        throw new Error("Missing data for group addition");

      console.log(
        "Step 3: Checking if user needs primary_client_group_id set first..."
      );
      // If user doesn't have a primary client group, set this as their primary
      if (!currentUser.primary_client_group_id) {
        console.log("Setting primary_client_group_id for user...");
        // We need to get client group ID first
        const groups = await apiService.queryClientGroups({
          client_group_name: invitation.client_group_name,
        });
        const clientGroupData = groups.data || groups;
        const clientGroup = Array.isArray(clientGroupData)
          ? clientGroupData[0]
          : clientGroupData;

        if (clientGroup?.client_group_id) {
          await apiService.updateUser(currentUser.sub!, {
            sub: userId!,
            email: userEmail!,
            primary_client_group_id: clientGroup.client_group_id,
          });
        }
      }

      console.log(
        "Step 4: Redeeming invitation (this adds user to client group)..."
      );
      // Mark invitation as redeemed and add user to client group
      await apiService.redeemInvitation(invitation.code);

      return invitation.client_group_name;
    },
    onSuccess: (clientGroupName) => {
      const clientGroup = clientGroups?.find(
        (cg) => cg.client_group_name === clientGroupName
      );
      console.log("Workflow completed successfully!");

      // Clear the invitation from localStorage since it's been processed
      localStorage.removeItem("pendingInvitationCode");

      setSuccessMessage(
        `${userEmail} has been successfully added to client group ${
          clientGroup?.name || "Unknown"
        }`
      );
      // Redirect to main app after 3 seconds
      setTimeout(() => {
        navigate("/");
      }, 3000);
    },
    onError: (error: Error) => {
      console.error("Failed to complete invitation workflow:", error);
      setError(error.message || "Failed to add user to client group");
    },
  });

  // Invitation processing is now handled in validateInvitationMutation.onSuccess

  // Removed userGroups error handling since we're not using that query anymore

  // Handle currentUser error
  useEffect(() => {
    if (currentUserError) {
      console.error("Failed to load current user:", currentUserError);
      setError("Failed to load your user information. Please try again.");
    }
  }, [currentUserError]);

  // Handle authenticated user flow - check localStorage for pending invitation
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const pendingInvitationCode = localStorage.getItem(
        "pendingInvitationCode"
      );

      console.log("Auth flow check:", {
        authLoading,
        isAuthenticated,
        userEmail,
        pendingInvitationCode,
        invitation: !!invitation,
        currentUser: !!currentUser,
        currentUserLoading,
        currentUserError: !!currentUserError,
      });

      // Step 1: If there's a pending invitation and we haven't validated it yet
      if (pendingInvitationCode && !invitation) {
        console.log(
          "🚀 User authenticated, validating pending invitation:",
          pendingInvitationCode
        );

        // Update the mutation to use the localStorage code
        const validateInvitation = async () => {
          try {
            // Query all invitations and filter by code
            const result = await apiService.queryInvitations({});

            // Handle paginated response format
            const invitations = result.data || result;
            const foundInvitation = invitations.find(
              (inv: apiService.Invitation) => inv.code === pendingInvitationCode
            );

            if (foundInvitation) {
              // Validate invitation (check if expired/redeemed)
              const now = new Date();
              const expiresAt = parseServerDate(foundInvitation.expires_at);

              if (now >= expiresAt) {
                setError(
                  "This invitation has expired or has already been used"
                );
                localStorage.removeItem("pendingInvitationCode");
                return;
              }

              console.log("🎉 Invitation is valid, proceeding with workflow");
              setInvitation(foundInvitation);
            } else {
              setError("Invalid invitation code");
              localStorage.removeItem("pendingInvitationCode");
            }
          } catch (error) {
            console.error("❌ Failed to validate invitation:", error);
            setError("Failed to validate invitation. Please try again.");
            localStorage.removeItem("pendingInvitationCode");
          }
        };

        validateInvitation();
        return;
      }

      // Step 2: Once invitation is validated, proceed with workflow
      if (invitation && !currentUserLoading) {
        console.log("Processing authenticated user workflow...");

        // Step 2a: Ensure user record exists in database and update sub field
        if (!currentUser && !currentUserError) {
          console.log("User not found in database, creating user record...");
          const createUserData = {
            sub: userId!, // Store Cognito user ID in sub field
            email: userEmail!,
          };
          console.log("Creating user with data:", createUserData);

          apiService
            .updateUser(createUserData)
            .then(() => {
              console.log("User created, refetching user data...");
              refetchUser();
            })
            .catch((error) => {
              console.error("Failed to create user:", error);
              setError("Failed to create user account. Please try again.");
            });
          return;
        }

        // Step 2a.5: If user exists but doesn't have sub field populated, update it
        if (currentUser && !currentUser.sub && userId) {
          console.log("User exists but sub field is missing, updating...");
          apiService
            .updateUser({
              user_id: currentUser.user_id,
              sub: userId,
              email: userEmail!,
            })
            .then(() => {
              console.log("User sub field updated, refetching user data...");
              refetchUser();
            })
            .catch((error) => {
              console.error("Failed to update user sub field:", error);
              // Continue with workflow even if sub update fails
            });
        }

        // Step 2b: User exists, proceed with invitation workflow
        if (currentUser) {
          console.log("User exists in database, showing invitation prompt");
          const clientGroup = clientGroups?.find(
            (cg) => cg.client_group_id === invitation.client_group_id
          );

          // Show confirmation prompt
          setSuccessMessage(
            `You have been invited to join ${
              clientGroup?.name || "a client organization"
            }. Accepting invitation...`
          );

          // Proceed with adding to group
          setTimeout(() => {
            addToGroupMutation.mutate();
          }, 1500);
        }
      }
    }
  }, [
    authLoading,
    isAuthenticated,
    !!invitation,
    !!currentUser,
    currentUserLoading,
    !!currentUserError,
    userEmail,
    userName,
    clientGroups,
  ]);

  const handleLoginSuccess = () => {
    setShowLoginDialog(false);
    // Refetch user data after login
    refetchUser();
  };

  const handleSignupSuccess = () => {
    setShowSignupDialog(false);
    // After signup, user workflow will be handled automatically
  };

  // Removed onboarding handlers since we handle workflow directly

  if (authLoading) {
    return (
      <Container maxWidth="sm">
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          sx={{ mt: 8 }}
        >
          <CircularProgress />
          <Typography variant="body1" sx={{ mt: 2 }}>
            Loading...
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm">
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          sx={{ mt: 8 }}
        >
          <Paper elevation={3} sx={{ p: 4, width: "100%" }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="h6">Invitation Error</Typography>
            </Alert>
            <Typography variant="body1">
              {error || "Failed to load invitation details"}
            </Typography>
          </Paper>
        </Box>
      </Container>
    );
  }

  if (successMessage) {
    return (
      <Container maxWidth="sm">
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          sx={{ mt: 8 }}
        >
          <Paper elevation={3} sx={{ p: 4, width: "100%" }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="h6">Success!</Typography>
            </Alert>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {successMessage}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Redirecting to the main application...
            </Typography>
          </Paper>
        </Box>
      </Container>
    );
  }

  // Render dialogs and components for all states
  return (
    <>
      {/* Show welcome screen only for unauthenticated users */}
      {!isAuthenticated && (
        <Container maxWidth="sm">
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            sx={{ mt: 8 }}
          >
            <Paper elevation={3} sx={{ p: 4, width: "100%" }}>
              <Typography
                variant="h4"
                component="h1"
                gutterBottom
                align="center"
              >
                Welcome to One Book of Record
              </Typography>
              <Typography variant="body1" align="center" sx={{ mb: 3 }}>
                You've been invited to join a client organization.
              </Typography>
              <Alert severity="info" sx={{ mb: 3 }}>
                Please sign in or create an account to accept this invitation.
              </Alert>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => setShowLoginDialog(true)}
                  size="large"
                >
                  Sign In
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => setShowSignupDialog(true)}
                  size="large"
                >
                  Create Account
                </Button>
              </Box>
            </Paper>
          </Box>
        </Container>
      )}

      {/* For authenticated users, show loading while processing */}
      {isAuthenticated &&
        invitation &&
        (currentUserLoading || (!currentUser && !currentUserError)) && (
          <Container maxWidth="sm">
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              sx={{ mt: 8 }}
            >
              <CircularProgress />
              <Typography variant="body1" sx={{ mt: 2 }}>
                Processing invitation...
              </Typography>
            </Box>
          </Container>
        )}

      {/* Login Dialog */}
      <LoginDialog
        open={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
        onSuccess={handleLoginSuccess}
        onSwitchToSignup={() => {
          setShowLoginDialog(false);
          setShowSignupDialog(true);
        }}
      />

      {/* Signup Dialog */}
      <SignupDialog
        open={showSignupDialog}
        onClose={() => setShowSignupDialog(false)}
        onSuccess={handleSignupSuccess}
        onSwitchToLogin={() => {
          setShowSignupDialog(false);
          setShowLoginDialog(true);
        }}
      />

      {/* Removed onboarding component - we handle invitation workflow directly */}

      {/* Error Snackbar */}
      <ErrorSnackbar
        open={!!error}
        message={error}
        onClose={() => setError("")}
      />
    </>
  );
};

export default AcceptInvitation;
