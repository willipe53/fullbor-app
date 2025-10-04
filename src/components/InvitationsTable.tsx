import React, { useState, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Chip,
  Tooltip,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { parseServerDate, formatLocalDateShort } from "../utils";
import { Add, InfoOutlined } from "@mui/icons-material";
import { InviteUserForm } from "./InviteUserForm";
import * as apiService from "../services/api";

const InvitationsTable: React.FC = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [inviteUserOpen, setInviteUserOpen] = useState(false);
  const [filter, setFilter] = useState<"unexpired" | "all">("unexpired");

  // Get current user's database ID
  const { data: currentUser } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiService.queryUsers({ sub: userId! }),
    enabled: !!userId,
    select: (data) => data[0], // Get first user from array
  });

  // Get all client groups the user belongs to for debugging
  const { data: userClientGroups } = useQuery({
    queryKey: ["client-groups", currentUser?.user_id],
    queryFn: () =>
      apiService.queryClientGroups({ user_id: currentUser!.user_id }),
    enabled: !!currentUser?.user_id,
  });

  // Get primary client group details (including name)
  const { data: primaryClientGroup } = useQuery({
    queryKey: ["primary-client-group", currentUser?.primary_client_group_id],
    queryFn: () =>
      apiService.queryClientGroups({
        client_group_id: currentUser!.primary_client_group_id!,
      }),
    enabled: !!currentUser?.primary_client_group_id,
    select: (data) => data[0], // Get first group from array
  });

  // Debug: Try fetching invitations for ALL the user's client groups
  const { data: debugInvitations } = useQuery({
    queryKey: ["debug-all-invitations", userClientGroups],
    queryFn: async () => {
      if (!userClientGroups || userClientGroups.length === 0) return [];

      const allInvitations = [];
      for (const group of userClientGroups) {
        try {
          const invitations = await apiService.queryClientGroupInvitations(
            group.client_group_name,
            {}
          );

          // Handle paginated response format
          const invitationsArray = invitations.data || invitations;
          if (Array.isArray(invitationsArray)) {
            allInvitations.push(
              ...invitationsArray.map((inv) => ({
                ...inv,
                group_name: group.client_group_name,
              }))
            );
          } else if (invitationsArray) {
            allInvitations.push({
              ...invitationsArray,
              group_name: group.client_group_name,
            });
          }
        } catch (error) {
          console.error(
            `Error fetching invitations for group ${group.client_group_id}:`,
            error
          );
        }
      }
      return allInvitations;
    },
    enabled: !!userClientGroups && userClientGroups.length > 0,
  });

  // Fetch invitations for the user's client group
  const {
    data: rawInvitationsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["invitations", currentUser?.primary_client_group_id],
    queryFn: () => {
      return apiService.queryClientGroupInvitations(
        primaryClientGroup?.client_group_name!,
        {}
      );
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    enabled:
      !!currentUser?.primary_client_group_id &&
      !!primaryClientGroup?.client_group_name,
  });

  // Mutation to expire an invitation
  const expireInvitationMutation = useMutation({
    mutationFn: (invitationId: number) => {
      return apiService.deleteInvitation(invitationId);
    },
    onSuccess: () => {
      // Refresh the invitations list
      refetch();
      // Invalidate the count cache to update badges
      queryClient.invalidateQueries({ queryKey: ["invitation-count"] });
      queryClient.invalidateQueries({ queryKey: ["invitation-count-all"] });
      queryClient.invalidateQueries({
        queryKey: ["invitation-count-unexpired"],
      });
    },
    onError: (error) => {
      console.error("Failed to expire invitation:", error);
    },
  });

  // Create client groups map for O(1) lookups
  const clientGroupsMap = useMemo(() => {
    if (!userClientGroups) return new Map();
    return new Map(
      userClientGroups.map((group) => [group.client_group_id, group.name])
    );
  }, [userClientGroups]);

  // Transform array data to proper format
  const invitationsData = useMemo(() => {
    // For now, use debugInvitations (all groups) if rawInvitationsData is empty
    const sourceData =
      rawInvitationsData &&
      Array.isArray(rawInvitationsData) &&
      rawInvitationsData.length > 0
        ? rawInvitationsData
        : debugInvitations || [];

    if (!sourceData || (Array.isArray(sourceData) && sourceData.length === 0)) {
      return [];
    }

    // Handle both array and object responses
    const dataArray = Array.isArray(sourceData) ? sourceData : [sourceData];

    const processed = dataArray.map((invitation: any) => {
      // Parse server date (UTC) and compare with current time
      const expiresAt = parseServerDate(invitation.expires_at);
      const now = new Date();
      const isExpired = expiresAt < now;

      // Find the group name if not already included
      const groupName =
        invitation.group_name ||
        clientGroupsMap.get(invitation.client_group_id) ||
        "Unknown";

      return {
        id: invitation.invitation_id,
        invitation_id: invitation.invitation_id,
        code: invitation.code,
        expires_at: invitation.expires_at,
        expires_at_local: formatLocalDateShort(expiresAt), // Store formatted local time for display
        client_group_id: invitation.client_group_id,
        group_name: groupName,
        email_sent_to: invitation.email_sent_to,
        isExpired: isExpired,
      };
    });

    // Apply filter based on the toggle
    const filteredProcessed =
      filter === "unexpired"
        ? processed.filter((invitation) => !invitation.isExpired)
        : processed;

    return filteredProcessed;
  }, [rawInvitationsData, debugInvitations, clientGroupsMap, filter]);

  const handleExpireInvitation = useCallback(
    (invitationId: number) => {
      expireInvitationMutation.mutate(invitationId);
    },
    [expireInvitationMutation]
  );

  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "invitation_id",
        headerName: "ID",
        width: 80,
        type: "number",
        align: "left",
        headerAlign: "left",
      },
      {
        field: "code",
        headerName: "Invitation Code",
        width: 180,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" fontFamily="monospace">
            {params.value}
          </Typography>
        ),
      },
      {
        field: "group_name",
        headerName: "Client Group",
        width: 150,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2">{params.value || "Unknown"}</Typography>
        ),
      },
      {
        field: "email_sent_to",
        headerName: "Email Sent To",
        width: 200,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2">{params.value || "—"}</Typography>
        ),
      },
      {
        field: "expires_at_local",
        headerName: "Expires At",
        width: 220,
        renderCell: (params: GridRenderCellParams) => {
          const isExpired = params.row.isExpired;

          return (
            <Chip
              label={params.value} // Already formatted in local time
              color={isExpired ? "error" : "success"}
              variant="outlined"
              size="small"
            />
          );
        },
      },
      {
        field: "actions",
        headerName: "Expire Code",
        flex: 1,
        sortable: false,
        renderCell: (params: GridRenderCellParams) => {
          const isExpired = params.row.isExpired;
          const isExpiring = expireInvitationMutation.isPending;

          return (
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => handleExpireInvitation(params.row.invitation_id)}
              disabled={isExpired || isExpiring}
              sx={{ minWidth: "140px" }}
            >
              {isExpired ? "Already Expired" : "Expire Invitation"}
            </Button>
          );
        },
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error" variant="h6">
          Error loading invitations
        </Typography>
        <Typography color="error" variant="body2">
          {error instanceof Error ? error.message : "Unknown error occurred"}
        </Typography>
        <Button onClick={() => refetch()} variant="outlined" sx={{ mt: 2 }}>
          Try Again
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Typography variant="h5">Invitations</Typography>
        <Tooltip
          title="Invitations are the way that new users are set up in fullbor. The user receives an email containing a code that will allow them to get access to your organization."
          placement="right"
          arrow
        >
          <IconButton size="small" sx={{ color: "text.secondary" }}>
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Tooltip>

        <Button
          variant="contained"
          color="success"
          size="small"
          startIcon={<Add />}
          onClick={() => setInviteUserOpen(true)}
          sx={{
            borderRadius: "20px",
            textTransform: "none",
            fontWeight: 600,
            ml: "auto",
          }}
        >
          New
        </Button>

        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, newFilter) => {
            if (newFilter !== null) {
              setFilter(newFilter);
            }
          }}
          size="small"
          sx={{ ml: 1 }}
        >
          <ToggleButton value="unexpired">Unexpired</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Data Grid */}
      <Box sx={{ height: 600, width: "100%" }}>
        {invitationsData.length === 0 && !isLoading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {!currentUser?.primary_client_group_id ? (
                "User doesn't have a primary client group set"
              ) : (
                <>
                  No {filter === "unexpired" ? "unexpired " : ""}invitations
                  found
                  <br />
                  No {filter === "unexpired" ? "unexpired " : ""}invitations
                  exist for {primaryClientGroup?.name || "this client group"}
                  <br />
                  Click "New" to invite a user to join{" "}
                  {primaryClientGroup?.name || "this client group"} via email.
                </>
              )}
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={invitationsData}
            columns={columns}
            pagination
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 10, page: 0 },
              },
            }}
            disableRowSelectionOnClick
            sx={{
              "& .MuiDataGrid-cell": {
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
              },
              "& .MuiDataGrid-columnHeaders": {
                backgroundColor: "#f5f5f5 !important", // Solid light gray background
                borderBottom: "1px solid rgba(25, 118, 210, 0.2) !important",
              },
              "& .MuiDataGrid-columnHeader": {
                backgroundColor: "#f5f5f5 !important", // Solid light gray background
                display: "flex",
                alignItems: "center",
              },
            }}
          />
        )}
      </Box>

      {/* Invite User Modal */}
      <InviteUserForm
        open={inviteUserOpen}
        onClose={() => {
          setInviteUserOpen(false);
          refetch(); // Refresh the invitations list
          // Invalidate the count cache to update badges
          queryClient.invalidateQueries({ queryKey: ["invitation-count"] });
          queryClient.invalidateQueries({ queryKey: ["invitation-count-all"] });
          queryClient.invalidateQueries({
            queryKey: ["invitation-count-unexpired"],
          });
        }}
      />
    </Box>
  );
};

export default React.memo(InvitationsTable);
