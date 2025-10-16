import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Modal,
  Tooltip,
  IconButton,
  Chip,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import type {
  GridColDef,
  GridRenderCellParams,
  GridRowParams,
} from "@mui/x-data-grid";
import { Add, InfoOutlined, Refresh } from "@mui/icons-material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import * as apiService from "../services/api";
import ClientGroupForm from "./ClientGroupForm";
import EntitiesTable from "./EntitiesTable";

const ClientGroupsTable: React.FC = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [editingClientGroup, setEditingClientGroup] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showEntityEditor, setShowEntityEditor] = useState(false);
  const [entityEditorClientGroup, setEntityEditorClientGroup] =
    useState<apiService.ClientGroup | null>(null);

  // Get current user's database ID
  const { data: currentUserData } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiService.getUserBySub(userId!),
    enabled: !!userId,
  });

  const currentUser = useMemo(() => {
    if (!currentUserData) return null;

    // Handle both single user object and array response
    if (Array.isArray(currentUserData)) {
      // Find the user with matching sub
      const user = currentUserData.find((user) => user.sub === userId);
      return user || null;
    }

    // Single user object
    return currentUserData;
  }, [currentUserData, userId]);

  // Get primary client group details
  const { data: primaryClientGroup } = useQuery({
    queryKey: ["primary-client-group", currentUser?.primary_client_group_id],
    queryFn: async () => {
      const response = await apiService.queryClientGroups({});
      const groups: apiService.ClientGroup[] = Array.isArray(response)
        ? response
        : "data" in response
        ? response.data
        : [];
      return groups.find(
        (g) => g.client_group_id === currentUser!.primary_client_group_id
      );
    },
    enabled: !!currentUser?.primary_client_group_id,
  });

  // Fetch client groups for the current user
  const {
    data: rawClientGroupsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["client-groups", currentUser?.user_id],
    queryFn: () => apiService.queryClientGroups({}),
    enabled: !!currentUser?.user_id,
  });

  // Transform client groups data
  const clientGroupsData = useMemo(() => {
    if (!rawClientGroupsData) return [];

    // Handle paginated response
    const groups: apiService.ClientGroup[] = Array.isArray(rawClientGroupsData)
      ? rawClientGroupsData
      : "data" in rawClientGroupsData
      ? rawClientGroupsData.data
      : [];

    console.log("ClientGroupsTable - raw data:", rawClientGroupsData);
    console.log("ClientGroupsTable - extracted groups:", groups);

    return groups;
  }, [rawClientGroupsData]);

  // Fetch entity counts for all client groups
  const { data: entityCountsData } = useQuery({
    queryKey: ["entity-counts", currentUser?.user_id],
    queryFn: async () => {
      console.log(
        "🔍 Fetching entity counts for client groups:",
        clientGroupsData
      );
      if (!currentUser?.user_id || !clientGroupsData.length) {
        console.log("🔍 Skipping entity counts - no user or no groups");
        return {};
      }

      const counts: Record<number, number> = {};

      // Fetch entity count for each client group using the client group entities endpoint
      for (const group of clientGroupsData) {
        try {
          const count = await apiService.getClientGroupEntityCount(
            group.client_group_name
          );
          console.log(`🔍 Entity count for ${group.client_group_name}:`, count);
          counts[group.client_group_id] = count;
        } catch (error) {
          console.error(
            `Failed to fetch entity count for group ${group.client_group_name}:`,
            error
          );
          counts[group.client_group_id] = 0;
        }
      }

      console.log("🔍 Final entity counts:", counts);
      return counts;
    },
    enabled: !!currentUser?.user_id && clientGroupsData.length > 0,
    staleTime: 30 * 1000, // 30 seconds
  });

  console.log("🔍 entityCountsData:", entityCountsData);

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
  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "client_group_id",
        headerName: "ID",
        width: 80,
        type: "number",
        align: "left",
        headerAlign: "left",
      },
      {
        field: "client_group_name",
        headerName: "Name",
        width: 200,
        minWidth: 150,
        renderCell: (params: GridRenderCellParams) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2">{params.value}</Typography>
            {currentUser?.primary_client_group_id ===
              params.row.client_group_id && (
              <Chip
                label="Primary"
                size="small"
                color="primary"
                variant="outlined"
                sx={{
                  fontSize: "0.7rem",
                  height: "20px",
                  fontWeight: 600,
                }}
              />
            )}
          </Box>
        ),
      },
      {
        field: "entity_count",
        headerName: "Number of Entities",
        width: 150,
        type: "number",
        align: "left",
        headerAlign: "left",
        renderCell: (params: GridRenderCellParams) => {
          const entityCount = entityCountsData?.[params.row.client_group_id];
          return (
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {entityCount !== undefined ? entityCount : "—"}
            </Typography>
          );
        },
      },
      {
        field: "preferences",
        headerName: "Group Wide Preferences",
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
    ],
    [currentUser]
  );

  const handleRowClick = (params: GridRowParams) => {
    setEditingClientGroup(params.row);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingClientGroup(null);
  };

  const handleNewClientGroup = () => {
    setEditingClientGroup({});
    setIsModalOpen(true);
  };

  const handleAddEntities = (clientGroup: apiService.ClientGroup) => {
    console.log("🎯 Opening entity editor for client group:", clientGroup);
    setEntityEditorClientGroup(clientGroup);
    setIsModalOpen(false); // Close the form modal
    setShowEntityEditor(true); // Show entity editor
  };

  const handleEntityEditorFinish = (selectedEntityIds: number[]) => {
    console.log("📝 Entity editor finished with entities:", selectedEntityIds);

    // Invalidate all related caches to refresh the table
    queryClient.invalidateQueries({ queryKey: ["client-groups"] });
    queryClient.invalidateQueries({
      queryKey: ["entity-counts", currentUser?.user_id],
    });

    // Also invalidate the specific client group entity queries
    if (entityEditorClientGroup) {
      queryClient.invalidateQueries({
        queryKey: [
          "client-group-entity-ids",
          entityEditorClientGroup.client_group_name,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "client-group-entities",
          entityEditorClientGroup.client_group_name,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "client-group-entity-count",
          entityEditorClientGroup.client_group_name,
        ],
      });
    }

    setShowEntityEditor(false);
    setEntityEditorClientGroup(null);
  };

  const handleEntityEditorCancel = () => {
    console.log("❌ Entity editor cancelled");
    setShowEntityEditor(false);
    setEntityEditorClientGroup(null);
  };

  // Render entity editor as full page when active
  if (showEntityEditor && entityEditorClientGroup) {
    return (
      <EntitiesTable
        groupSelectionMode={{
          clientGroupId: entityEditorClientGroup.client_group_id,
          clientGroupName: entityEditorClientGroup.client_group_name,
          onFinish: handleEntityEditorFinish,
          onCancel: handleEntityEditorCancel,
        }}
      />
    );
  }

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
          Error loading client groups
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
        <Typography variant="h5">Client Groups</Typography>
        <Tooltip title="Refresh" placement="top" arrow>
          <IconButton
            size="small"
            onClick={() => refetch()}
            sx={{
              color: "text.secondary",
              p: 0.25,
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.04)",
              },
            }}
          >
            <Refresh fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip
          title="Client Groups define which users will have access to which entities (accounts, portfolios, etc.) in the app. Your primary client group appears in the title bar at the top of the app, but there's nothing else about it that's special at the moment."
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
          onClick={handleNewClientGroup}
          sx={{
            borderRadius: "20px",
            textTransform: "none",
            fontWeight: 600,
          }}
        >
          New
        </Button>
      </Box>

      {/* Data Grid */}
      <Box sx={{ height: 600, width: "100%" }}>
        {clientGroupsData.length === 0 && !isLoading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No client groups found
              <br />
              No client groups exist for{" "}
              {primaryClientGroup?.client_group_name || "this organization"}
              <br />
              Click "New" to create one for{" "}
              {primaryClientGroup?.client_group_name || "this organization"}.
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={clientGroupsData || []}
            columns={columns}
            getRowId={(row) => row.client_group_id}
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
        aria-labelledby="edit-client-group-modal"
        aria-describedby="edit-client-group-form"
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
          <ClientGroupForm
            editingClientGroup={editingClientGroup}
            onClose={handleCloseModal}
            onAddEntities={handleAddEntities}
          />
        </Box>
      </Modal>
    </Box>
  );
};

export default React.memo(ClientGroupsTable);
