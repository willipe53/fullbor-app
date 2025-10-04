import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  TextField,
  Button,
  Stack,
  MenuItem,
  Modal,
  Autocomplete,
  Tooltip,
  IconButton,
  Checkbox,
} from "@mui/material";
import { Add, InfoOutlined } from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import type {
  GridColDef,
  GridRenderCellParams,
  GridRowParams,
} from "@mui/x-data-grid";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import * as apiService from "../services/api";
import EntityForm from "./EntityForm";
import EntityTypesTable from "./EntityTypesTable";

interface EntitiesTableProps {
  groupSelectionMode?: {
    clientGroupId: number;
    clientGroupName: string;
    onFinish: (selectedEntityIds: number[]) => void;
    onCancel: () => void;
  };
}

const EntitiesTable: React.FC<EntitiesTableProps> = ({
  groupSelectionMode,
}) => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  // Get current user's database ID
  const { data: currentUser } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiService.queryUsers({ sub: userId! }),
    enabled: !!userId,
    select: (data) => data[0], // Get first user from array
  });

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

  const [filters, setFilters] = useState<
    Partial<apiService.QueryEntitiesRequest>
  >({});
  const [nameFilter, setNameFilter] = useState("");
  const [entityIdFilter, setEntityIdFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [editingEntity, setEditingEntity] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEntityTypesModalOpen, setIsEntityTypesModalOpen] = useState(false);

  // Group selection mode state
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<number>>(
    new Set()
  );
  const [currentGroupEntityIds, setCurrentGroupEntityIds] = useState<
    Set<number>
  >(new Set());

  // Fetch entities
  const {
    data: rawEntitiesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["entities", filters, currentUser?.user_id],
    queryFn: () =>
      apiService.queryEntities({ ...filters, user_id: currentUser!.user_id }),
    enabled: !!currentUser?.user_id, // Only run query when user data is loaded
  });

  // Fetch current group entities (only in group selection mode)
  const { data: groupEntityIds } = useQuery({
    queryKey: [
      "client-group-entities",
      groupSelectionMode?.clientGroupId,
      currentUser?.user_id,
    ],
    queryFn: () =>
      apiService.queryClientGroupEntities({
        client_group_id: groupSelectionMode!.clientGroupId,
        user_id: currentUser!.user_id,
      }),
    enabled: !!groupSelectionMode?.clientGroupId && !!currentUser?.user_id,
  });

  // Update current group entity IDs when data changes
  React.useEffect(() => {
    if (groupEntityIds && groupSelectionMode) {
      const newSet = new Set(groupEntityIds);
      setCurrentGroupEntityIds(newSet);
      setSelectedEntityIds(new Set(newSet)); // Initialize selection with current group entities
    }
  }, [groupEntityIds, groupSelectionMode]);

  // Transform array data to objects if needed
  const entitiesData = React.useMemo(() => {
    if (!rawEntitiesData) return [];

    // Check if data is already in object format
    if (
      Array.isArray(rawEntitiesData) &&
      rawEntitiesData.length > 0 &&
      typeof rawEntitiesData[0] === "object" &&
      "entity_id" in rawEntitiesData[0]
    ) {
      return rawEntitiesData;
    }

    // Transform array format [id, name, type_id, parent_id, attributes] to object format
    if (Array.isArray(rawEntitiesData)) {
      return rawEntitiesData.map((row: any) => {
        if (Array.isArray(row) && row.length >= 4) {
          return {
            entity_id: row[0],
            name: row[1],
            entity_type_id: row[2],
            attributes: row[3], // Don't parse here, let formatAttributes handle it
          };
        }
        return row;
      });
    }

    return rawEntitiesData;
  }, [rawEntitiesData]);

  // Fetch entity types for filter dropdown
  const { data: rawEntityTypesData } = useQuery({
    queryKey: ["entity-types"],
    queryFn: () => apiService.queryEntityTypes({}),
  });

  // Use entity types data directly since it's an array
  const entityTypesData = rawEntityTypesData || [];

  // Checkbox handlers for group selection mode
  const handleEntityToggle = React.useCallback(
    (entityId: number) => {
      if (!groupSelectionMode) return;

      setSelectedEntityIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(entityId)) {
          newSet.delete(entityId);
        } else {
          newSet.add(entityId);
        }
        return newSet;
      });
    },
    [groupSelectionMode]
  );

  const handleSelectAllVisible = React.useCallback(() => {
    if (!groupSelectionMode || !entitiesData) return;

    const visibleEntityIds = entitiesData.map((entity) => entity.entity_id);
    const allVisibleSelected = visibleEntityIds.every((id) =>
      selectedEntityIds.has(id)
    );

    setSelectedEntityIds((prev) => {
      const newSet = new Set(prev);
      if (allVisibleSelected) {
        // Deselect all visible
        visibleEntityIds.forEach((id) => newSet.delete(id));
      } else {
        // Select all visible
        visibleEntityIds.forEach((id) => newSet.add(id));
      }
      return newSet;
    });
  }, [groupSelectionMode, entitiesData, selectedEntityIds]);

  // Create list of unique entity names for autocomplete
  const uniqueEntityNames = useMemo(() => {
    if (!entitiesData) return [];

    const names = entitiesData
      .map((entity) => entity.name)
      .filter((name) => name && name.trim()) // Remove empty/null names
      .sort();

    // Remove duplicates and return as array of strings
    return [...new Set(names)];
  }, [entitiesData]);

  const formatAttributes = (attributes: any) => {
    if (!attributes) return "None";

    let parsedAttributes;

    // Handle different data types - parse to object first
    if (typeof attributes === "string") {
      try {
        parsedAttributes = JSON.parse(attributes);
      } catch {
        return `Invalid JSON: ${attributes.substring(0, 50)}...`;
      }
    } else if (typeof attributes === "object") {
      parsedAttributes = attributes;
    } else {
      return String(attributes);
    }

    try {
      const entries = Object.entries(parsedAttributes);
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
      return "Invalid attributes";
    }
  };

  // Define DataGrid columns
  const columns: GridColDef[] = useMemo(
    () => [
      // Checkbox column (only in group selection mode)
      ...(groupSelectionMode
        ? [
            {
              field: "selected",
              headerName: "",
              width: 80,
              sortable: false,
              filterable: false,
              renderHeader: () => {
                const visibleEntityIds =
                  entitiesData?.map((entity) => entity.entity_id) || [];
                const allVisibleSelected =
                  visibleEntityIds.length > 0 &&
                  visibleEntityIds.every((id) => selectedEntityIds.has(id));
                const someVisibleSelected = visibleEntityIds.some((id) =>
                  selectedEntityIds.has(id)
                );

                return (
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected && !allVisibleSelected}
                    onChange={handleSelectAllVisible}
                    size="small"
                  />
                );
              },
              renderCell: (params: GridRenderCellParams) => (
                <Checkbox
                  checked={selectedEntityIds.has(params.row.entity_id)}
                  onChange={() => handleEntityToggle(params.row.entity_id)}
                  size="small"
                />
              ),
            },
          ]
        : []),
      {
        field: "entity_id",
        headerName: "ID",
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" sx={{ fontWeight: "500" }}>
            {params.value}
          </Typography>
        ),
      },
      {
        field: "short_label",
        headerName: "Type",
        renderCell: (params: GridRenderCellParams) => {
          // Find the entity type for this entity to get its short_label and color
          const entityType = entityTypesData?.find(
            (type) => type.entity_type_id === params.row.entity_type_id
          );
          const shortLabel = entityType?.short_label;
          const labelColor = entityType?.label_color;
          const colorValue = labelColor?.startsWith("#")
            ? labelColor
            : labelColor
            ? `#${labelColor}`
            : "#000000";

          return shortLabel ? (
            <Typography
              variant="body2"
              sx={{
                fontWeight: "bold",
                color: colorValue,
              }}
            >
              {shortLabel}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          );
        },
      },
      {
        field: "name",
        headerName: "Name",
      },
      {
        field: "attributes",
        headerName: "Attributes",
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
            {formatAttributes(params.value)}
          </Typography>
        ),
      },
    ],
    [
      entityTypesData,
      entitiesData,
      groupSelectionMode,
      selectedEntityIds,
      handleSelectAllVisible,
      handleEntityToggle,
    ]
  );

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "400px",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error" variant="h6" gutterBottom>
          Error loading entities
        </Typography>
        <Typography color="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Typography>
        <Button variant="contained" onClick={() => refetch()}>
          Retry
        </Button>
      </Box>
    );
  }

  const handleFilter = () => {
    const newFilters: Partial<apiService.QueryEntitiesRequest> = {};
    if (entityIdFilter) newFilters.entity_id = parseInt(entityIdFilter);
    if (nameFilter) newFilters.name = nameFilter;
    if (entityTypeFilter)
      newFilters.entity_type_id = parseInt(entityTypeFilter);
    setFilters({ ...newFilters, user_id: currentUser!.user_id });
  };

  const clearFilters = () => {
    setFilters({ user_id: currentUser!.user_id });
    setNameFilter("");
    setEntityIdFilter("");
    setEntityTypeFilter("");
  };

  const handleRowClick = (params: GridRowParams) => {
    setEditingEntity(params.row);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEntity(null);
  };

  const handleFinishEditing = async () => {
    if (!groupSelectionMode) return;

    // Get the complete desired state (all selected entity IDs)
    const desiredEntityIds = Array.from(selectedEntityIds);

    console.log(
      "🔄 Finishing entity group editing - desired entities:",
      desiredEntityIds,
      "current entities:",
      Array.from(currentGroupEntityIds)
    );

    try {
      // Send the complete desired state to the backend
      const result = await apiService.modifyClientGroupEntities({
        client_group_id: groupSelectionMode.clientGroupId,
        entity_ids: desiredEntityIds,
        user_id: currentUser!.user_id,
      });

      console.log("✅ Entity group modification successful:", result);
      console.log(
        `📊 Added ${result.added_count}, removed ${result.removed_count} entities`
      );

      // Invalidate relevant caches to ensure UI reflects the changes
      queryClient.invalidateQueries({
        queryKey: ["client-group-entities", groupSelectionMode.clientGroupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["entities"],
      });

      groupSelectionMode.onFinish(desiredEntityIds);
    } catch (error) {
      console.error("❌ Entity group modification failed:", error);
      // Could add error handling here
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Typography variant="h5">
          {groupSelectionMode
            ? `Entities for ${groupSelectionMode.clientGroupName} (${selectedEntityIds.size} selected)`
            : "Entities"}
        </Typography>
        <Tooltip
          title={
            groupSelectionMode
              ? "Use the checkboxes to select entities that should belong to this client group."
              : "The Entity is the fundamental building block of the app. All of your accounts, portfolios, and holdings are entities, which have a parent-child relationship. For example, an account could contain multiple holdings, and one of those holdings could be a portfolio which contained a fund which contained multiple equities."
          }
          placement="right"
          arrow
        >
          <IconButton size="small" sx={{ color: "text.secondary" }}>
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        {groupSelectionMode ? (
          <>
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={handleFinishEditing}
              sx={{
                borderRadius: "20px",
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              Finished Editing
            </Button>
            <Button
              variant="contained"
              color="error"
              size="small"
              onClick={groupSelectionMode.onCancel}
              sx={{
                borderRadius: "20px",
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              Cancel Edits
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="contained"
              color="success"
              size="small"
              startIcon={<Add />}
              onClick={() => {
                setEditingEntity({}); // Set empty object for new entity
                setIsModalOpen(true);
              }}
              sx={{
                borderRadius: "20px",
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              New
            </Button>
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
                onClick={() => setIsEntityTypesModalOpen(true)}
                sx={{
                  borderRadius: "20px",
                  textTransform: "none",
                  fontWeight: 600,
                }}
              >
                Edit Entity Types
              </Button>
              <Tooltip
                title="Manage entity types and their properties. Entity types define categories for organizing your entities (e.g., Investor, Fund, Property)."
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
          </>
        )}
      </Box>

      {/* Filters */}
      <Box sx={{ mb: 3, p: 2, border: "1px solid #ddd", borderRadius: 1 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Filters
        </Typography>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Entity ID"
              value={entityIdFilter}
              onChange={(e) => setEntityIdFilter(e.target.value)}
              size="small"
              sx={{ minWidth: 120 }}
            />
            <Autocomplete
              freeSolo
              options={uniqueEntityNames}
              value={nameFilter}
              onInputChange={(_, newValue) => setNameFilter(newValue || "")}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Name"
                  size="small"
                  sx={{ minWidth: 200 }}
                />
              )}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Entity Type"
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              size="small"
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="">All Types</MenuItem>
              {(entityTypesData || []).map((type) => (
                <MenuItem key={type.entity_type_id} value={type.entity_type_id}>
                  {type.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <Button variant="contained" onClick={handleFilter}>
              Apply Filters
            </Button>
            <Button variant="outlined" onClick={clearFilters}>
              Clear Filters
            </Button>
            <Button variant="outlined" onClick={() => refetch()}>
              Refresh Data
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Data Grid */}
      <Box sx={{ height: 600, width: "100%" }}>
        {entitiesData.length === 0 && !isLoading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No entities found
              <br />
              No entities exist for{" "}
              {primaryClientGroup?.name || "this client group"}
              <br />
              Click "New" to create one for{" "}
              {primaryClientGroup?.name || "this client group"}.
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={entitiesData || []}
            columns={columns}
            getRowId={(row) => row.entity_id}
            pagination
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25 },
              },
            }}
            disableRowSelectionOnClick
            onRowClick={groupSelectionMode ? undefined : handleRowClick}
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
        aria-labelledby="edit-entity-modal"
        aria-describedby="edit-entity-form"
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
          <EntityForm
            editingEntity={editingEntity}
            onClose={handleCloseModal}
          />
        </Box>
      </Modal>

      {/* Entity Types Full Screen View */}
      {isEntityTypesModalOpen && (
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
              onClick={() => setIsEntityTypesModalOpen(false)}
              startIcon={<ArrowBackIcon />}
            >
              Back to Entities
            </Button>
            <Typography variant="h5">Entity Types</Typography>
          </Box>
          <EntityTypesTable />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(EntitiesTable);
