import React, { useState, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Modal,
  Chip,
  Tooltip,
  IconButton,
} from "@mui/material";
import { InfoOutlined, ArrowBack } from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import type {
  GridColDef,
  GridRenderCellParams,
  GridRowParams,
} from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import * as apiService from "../services/api";
import UserForm from "./UserForm";
import ClientGroupsTable from "./ClientGroupsTable";
import InvitationsTable from "./InvitationsTable";

const UsersTable: React.FC = () => {
  const { userId } = useAuth();
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClientGroupsModalOpen, setIsClientGroupsModalOpen] = useState(false);
  const [isInvitationsModalOpen, setIsInvitationsModalOpen] = useState(false);

  // Get current user's database ID
  const { data: currentUserData } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiService.queryUsers({ sub: userId! }),
    enabled: !!userId,
  });

  const currentUser =
    currentUserData && currentUserData.length > 0 ? currentUserData[0] : null;

  // Get primary client group details
  const { data: primaryClientGroup } = useQuery({
    queryKey: ["primary-client-group", currentUser?.primary_client_group_id],
    queryFn: () =>
      apiService.queryClientGroups({
        client_group_id: currentUser!.primary_client_group_id!,
      }),
    enabled: !!currentUser?.primary_client_group_id,
    select: (data) => data[0],
  });

  // Fetch all users (admin functionality)
  const {
    data: rawUsersData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["users", "client-group", currentUser?.primary_client_group_id],
    queryFn: async () => {
      const queryParams = {
        requesting_user_id: currentUser!.user_id,
        client_group_id: currentUser!.primary_client_group_id,
      };
      return await apiService.queryUsers(queryParams);
    },
    enabled: !!currentUser?.primary_client_group_id && !!currentUser?.user_id,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Fetch client groups to map IDs to names
  const { data: clientGroupsData } = useQuery({
    queryKey: ["client-groups", currentUser?.user_id],
    queryFn: () =>
      apiService.queryClientGroups({ user_id: currentUser!.user_id }),
    enabled: !!currentUser?.user_id,
  });

  // Create client groups map for O(1) lookups
  const clientGroupsMap = useMemo(() => {
    if (!clientGroupsData) return new Map();
    return new Map(
      clientGroupsData.map((group: any) => [group.client_group_id, group.name])
    );
  }, [clientGroupsData]);

  // Transform users data
  const usersData = useMemo(() => {
    if (!rawUsersData) return [];

    // Check if data is already in object format
    if (
      Array.isArray(rawUsersData) &&
      rawUsersData.length > 0 &&
      typeof rawUsersData[0] === "object"
    ) {
      return rawUsersData;
    }

    // Transform array format to object format if needed
    if (Array.isArray(rawUsersData)) {
      return rawUsersData.map((row: any) => {
        if (Array.isArray(row) && row.length >= 3) {
          return {
            user_id: row[0],
            sub: row[1],
            email: row[2],
            preferences:
              typeof row[3] === "string"
                ? JSON.parse(row[3] || "{}")
                : row[3] || {},
            primary_client_group_id: row[4] || null,
          };
        }
        return row;
      });
    }

    return rawUsersData;
  }, [rawUsersData]);

  const formatPreferences = (preferences: any) => {
    if (!preferences) return "None";

    let parsedPreferences;

    // Handle different data types - parse to object first
    if (typeof preferences === "string") {
      try {
        parsedPreferences = JSON.parse(preferences);
      } catch {
        return `Invalid JSON: ${preferences.substring(0, 50)}...`;
      }
    } else if (typeof preferences === "object") {
      parsedPreferences = preferences;
    } else {
      return String(preferences);
    }

    try {
      const entries = Object.entries(parsedPreferences);
      if (entries.length === 0) return "None";

      return entries
        .map(([key, value]) => {
          // Determine the type of the value for better formatting
          let valueType: string = typeof value;
          let displayValue = String(value);

          // Handle special cases
          if (value === null) {
            valueType = "null";
            displayValue = "null";
          } else if (Array.isArray(value)) {
            valueType = "array";
            displayValue = `[${value.length} items]`;
          } else if (typeof value === "object") {
            valueType = "object";
            displayValue = "{...}";
          } else if (typeof value === "string" && value.length > 20) {
            displayValue = `${value.substring(0, 20)}...`;
          }

          return `${key}(${valueType}): ${displayValue}`;
        })
        .join(", ");
    } catch {
      return "Invalid preferences";
    }
  };

  // Define DataGrid columns
  const columns: GridColDef[] = useMemo(() => {
    // Helper function to get client group name by ID
    const getClientGroupName = (groupId: number | null) => {
      if (!groupId) return "None";
      return clientGroupsMap.get(groupId) || `Group ${groupId}`;
    };

    return [
      {
        field: "user_id",
        headerName: "ID",
        width: 80,
        type: "number",
        align: "left",
        headerAlign: "left",
      },
      {
        field: "email",
        headerName: "Email",
        width: 250,
        minWidth: 200,
        renderCell: (params: GridRenderCellParams) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2">{params.value}</Typography>
            {currentUser && params.row.sub === currentUser.sub && (
              <Chip
                label="You"
                size="small"
                color="success"
                sx={{
                  height: 20,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                }}
              />
            )}
          </Box>
        ),
      },
      {
        field: "primary_client_group_id",
        headerName: "Primary Group",
        width: 180,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2">
            {getClientGroupName(params.value)}
          </Typography>
        ),
      },
      {
        field: "preferences",
        headerName: "User Specific Preferences",
        flex: 1,
        renderCell: (params: GridRenderCellParams) => (
          <Typography
            variant="body2"
            sx={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              lineHeight: 1.2,
              padding: "4px 0",
            }}
          >
            {formatPreferences(params.value)}
          </Typography>
        ),
      },
    ];
  }, [currentUser, clientGroupsMap]);

  const handleRowClick = useCallback((params: GridRowParams) => {
    setEditingUser(params.row);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingUser(null);
  }, []);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error" variant="h6">
          Error loading users
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
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h5">Users</Typography>
        <Tooltip
          title="Users are people who have successfully logged in to fullbor.ai. You will only see the users who are members of the client groups that you have access to. You can invite a user to join your organization on the Invitations tab."
          placement="right"
          arrow
        >
          <IconButton size="small" sx={{ color: "text.secondary" }}>
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            marginLeft: "auto",
          }}
        >
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => setIsClientGroupsModalOpen(true)}
            sx={{
              borderRadius: "20px",
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            Client Groups
          </Button>
          <Tooltip
            title="View and manage client groups. Client groups organize users into teams or departments within your organization."
            placement="top"
          >
            <IconButton
              size="small"
              sx={{
                color: "primary.main",
                p: 0.25,
                "&:hover": {
                  backgroundColor: "rgba(25, 118, 210, 0.1)",
                },
              }}
            >
              <InfoOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: 1 }}>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => setIsInvitationsModalOpen(true)}
            sx={{
              borderRadius: "20px",
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            Invitations
          </Button>
          <Tooltip
            title="View and manage user invitations. Send email invitations to add new users to your client group."
            placement="top"
          >
            <IconButton
              size="small"
              sx={{
                color: "primary.main",
                p: 0.25,
                "&:hover": {
                  backgroundColor: "rgba(25, 118, 210, 0.1)",
                },
              }}
            >
              <InfoOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Data Grid */}
      <Box sx={{ height: 600, width: "100%" }}>
        {usersData.length === 0 && !isLoading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No users found
              <br />
              No users exist for{" "}
              {primaryClientGroup?.name || "this client group"}
              <br />
              Users are created when they accept invitations via email.
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={usersData || []}
            columns={columns}
            getRowId={(row) => row.user_id}
            pagination
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25 },
              },
            }}
            disableRowSelectionOnClick
            onRowClick={handleRowClick}
            getRowHeight={() => "auto"}
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

      {/* Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => {}} // Disable backdrop clicks
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            handleCloseModal();
          }
        }}
        aria-labelledby="edit-user-modal"
        aria-describedby="edit-user-form"
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: 800,
            maxHeight: "90vh",
            overflow: "auto",
            bgcolor: "background.paper",
            borderRadius: 2,
            boxShadow: 24,
            p: 0,
          }}
        >
          <UserForm editingUser={editingUser} onClose={handleCloseModal} />
        </Box>
      </Modal>

      {/* Client Groups Full Screen View */}
      {isClientGroupsModalOpen && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: "background.paper",
            zIndex: 1300,
            overflow: "auto",
            p: 2,
          }}
        >
          <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setIsClientGroupsModalOpen(false)}
              startIcon={<ArrowBack />}
            >
              Back to Users
            </Button>
            <Typography variant="h5">Client Groups</Typography>
          </Box>
          <ClientGroupsTable />
        </Box>
      )}

      {/* Invitations Full Screen View */}
      {isInvitationsModalOpen && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: "background.paper",
            zIndex: 1300,
            overflow: "auto",
            p: 2,
          }}
        >
          <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setIsInvitationsModalOpen(false)}
              startIcon={<ArrowBack />}
            >
              Back to Users
            </Button>
            <Typography variant="h5">Invitations</Typography>
          </Box>
          <InvitationsTable />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(UsersTable);
