import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as apiService from "../services/api";

interface OnboardingState {
  isLoading: boolean;
  needsOnboarding: boolean;
  user: apiService.User | null;
  error: string | null;
}

export const useClientGroupOnboarding = (
  userEmail: string | null,
  cognitoUserId: string | null
) => {
  const [state, setState] = useState<OnboardingState>({
    isLoading: true,
    needsOnboarding: false,
    user: null,
    error: null,
  });

  const queryClient = useQueryClient();
  const hasProcessedRef = useRef(false);
  const processingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Query to get user data
  const {
    data: users,
    refetch: refetchUser,
    error: usersError,
  } = useQuery({
    queryKey: ["user", cognitoUserId],
    queryFn: async () => {
      if (!cognitoUserId) return Promise.resolve([]);
      console.log("🔍 Fetching users for onboarding check...");
      try {
        const result = await apiService.queryUsers({});
        console.log("🔍 Users query result:", result);
        return result;
      } catch (error) {
        console.error("❌ Users query error:", error);
        throw error;
      }
    },
    enabled: !!cognitoUserId && !!userEmail,
    retry: 1, // Limit retries
  });

  // Mutation to create/update user
  const updateUserMutation = useMutation({
    mutationFn: (
      data: apiService.UpdateUserRequest | apiService.CreateUserRequest
    ) => {
      // API now uses sub for user identification
      if (data.sub) {
        // For updates, use the sub to identify the user
        return apiService.updateUser(data.sub, data);
      } else {
        // For creation, call create endpoint
        return apiService.createUser(data);
      }
    },
    onSuccess: () => {
      refetchUser();
    },
  });

  // Mutation to update user's primary client group
  const assignClientGroupMutation = useMutation({
    mutationFn: ({
      userDbId,
      clientGroupId,
    }: {
      userDbId: number;
      clientGroupId: number;
    }) =>
      apiService.updateUser(state.user?.sub!, {
        primary_client_group_id: clientGroupId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      setState((prev) => ({ ...prev, needsOnboarding: false }));
    },
  });

  useEffect(() => {
    console.log("🔍 useClientGroupOnboarding - Parameters:", {
      cognitoUserId,
      userEmail,
      usersError,
    });
    if (!cognitoUserId || !userEmail) {
      console.log("❌ useClientGroupOnboarding - Missing required parameters");
      setState({
        isLoading: false,
        needsOnboarding: false,
        user: null,
        error: null,
      });
      hasProcessedRef.current = false;
      lastUserIdRef.current = null;
      return;
    }

    // If there's a query error, handle it
    if (usersError) {
      console.log("❌ Users query failed:", usersError);
      setState({
        isLoading: false,
        needsOnboarding: true, // Assume onboarding needed if we can't fetch users
        user: null,
        error: usersError.message || "Failed to fetch users",
      });
      hasProcessedRef.current = false;
      return;
    }

    // Skip onboarding if there's a pending invitation being processed
    const pendingInvitationCode = localStorage.getItem("pendingInvitationCode");
    if (pendingInvitationCode) {
      console.log(
        "🔗 Skipping normal onboarding - pending invitation found:",
        pendingInvitationCode
      );
      setState({
        isLoading: false,
        needsOnboarding: false,
        user: null,
        error: null,
      });
      hasProcessedRef.current = false;
      lastUserIdRef.current = null;
      return;
    }

    // Reset processing state if user changed
    if (lastUserIdRef.current !== cognitoUserId) {
      hasProcessedRef.current = false;
      processingRef.current = false;
      lastUserIdRef.current = cognitoUserId;
    }

    // Skip if we're already processing or have already processed this user
    if (processingRef.current || hasProcessedRef.current) {
      return;
    }

    // Skip if users data is not yet loaded
    if (users === undefined) {
      return;
    }

    const handleUserCheck = async () => {
      if (processingRef.current) return;

      try {
        processingRef.current = true;
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Check if user exists
        const existingUsers = users || [];
        console.log("🔍 Checking existing users:", existingUsers);
        console.log("🔍 Looking for user with sub:", cognitoUserId);
        let currentUser = existingUsers.find((u) => u.sub === cognitoUserId);
        console.log("🔍 Found current user:", currentUser);

        if (currentUser) {
          // User exists - update sub and email if needed
          if (
            currentUser.email !== userEmail ||
            currentUser.sub !== cognitoUserId
          ) {
            try {
              await updateUserMutation.mutateAsync({
                user_id: currentUser.user_id,
                sub: cognitoUserId,
                email: userEmail,
              });
              // Invalidate cache and refetch to get updated data
              queryClient.invalidateQueries({
                queryKey: ["user", cognitoUserId],
              });
              const updatedUsers = await refetchUser();

              currentUser =
                updatedUsers.data?.find((u) => u.sub === cognitoUserId) ||
                currentUser;
            } catch (userUpdateError: any) {
              console.error("Failed to update user:", userUpdateError);
              throw new Error(
                `Failed to update user: ${userUpdateError.message}`
              );
            }
          }
        } else {
          // User doesn't exist - create new user
          console.log("🔍 Creating user with:", {
            sub: cognitoUserId,
            email: userEmail,
          });

          // Validate required fields before making API call
          if (!cognitoUserId || !userEmail) {
            throw new Error(
              `Missing required fields: sub=${!!cognitoUserId}, email=${!!userEmail}`
            );
          }

          try {
            const createUserData: apiService.CreateUserRequest = {
              sub: cognitoUserId,
              email: userEmail,
            };
            await updateUserMutation.mutateAsync(createUserData);

            // Invalidate cache and refetch to get the new user data
            queryClient.invalidateQueries({
              queryKey: ["user", cognitoUserId],
            });
            await new Promise((resolve) => setTimeout(resolve, 500));

            const updatedUsers = await refetchUser();
            currentUser = updatedUsers.data?.find(
              (u) => u.sub === cognitoUserId
            );
          } catch (userCreationError: any) {
            console.error("Failed to create user:", userCreationError);
            throw new Error(
              `Failed to create user: ${userCreationError.message}`
            );
          }
        }

        if (!currentUser) {
          throw new Error("Failed to create or retrieve user record");
        }

        // Check if user needs client group assignment
        const needsOnboarding = !currentUser.primary_client_group_id;
        console.log("🔍 User onboarding decision:", {
          primary_client_group_id: currentUser.primary_client_group_id,
          needsOnboarding,
        });

        setState({
          isLoading: false,
          needsOnboarding,
          user: currentUser,
          error: null,
        });

        hasProcessedRef.current = true;
      } catch (error: any) {
        console.error("Client group onboarding error:", error);
        setState({
          isLoading: false,
          needsOnboarding: false,
          user: null,
          error: error.message || "Failed to check user status",
        });
        hasProcessedRef.current = true;
      } finally {
        processingRef.current = false;
      }
    };

    handleUserCheck();
  }, [cognitoUserId, userEmail, users]);

  const completeOnboarding = async (clientGroupId: number) => {
    if (!state.user?.user_id) {
      throw new Error("No user ID available");
    }

    await assignClientGroupMutation.mutateAsync({
      userDbId: state.user.user_id,
      clientGroupId: clientGroupId,
    });

    // Reset processing state after successful onboarding
    hasProcessedRef.current = false;
  };

  return {
    ...state,
    completeOnboarding,
    isUpdating:
      updateUserMutation.isPending || assignClientGroupMutation.isPending,
  };
};
