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
  const { userId: sub } = useAuth();
  const queryClient = useQueryClient();

  const [entityNameFilter, setEntityNameFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [editingEntity, setEditingEntity] = useState<apiService.Entity | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEntityTypesModalOpen, setIsEntityTypesModalOpen] = useState(false);

  // Group selection mode state
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<number>>(
    new Set()
  );

  // Step 3: Fetch all entities (ROWS dataset)
  const {
    data: rawEntitiesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["entities"],
    queryFn: () => apiService.queryEntities({}),
    enabled: !!sub,
  });

  // Step 4: Fetch selected entities for this client group (SELECTED dataset)
  const { data: selectedEntityIdsFromAPI } = useQuery({
    queryKey: ["client-group-entity-ids", groupSelectionMode?.clientGroupName],
    queryFn: () =>
      apiService.getClientGroupEntityIds(groupSelectionMode!.clientGroupName),
    enabled: !!groupSelectionMode?.clientGroupName,
  });

  // Step 5: Initialize selectedEntityIds when both datasets are loaded
  React.useEffect(() => {
    if (selectedEntityIdsFromAPI && groupSelectionMode) {
      const selectedIds = new Set<number>(selectedEntityIdsFromAPI);
      setSelectedEntityIds(selectedIds);
    }
  }, [selectedEntityIdsFromAPI, groupSelectionMode]);

  // Transform API response data to array format
  const entitiesData = React.useMemo(() => {
    if (!rawEntitiesData) return [];

    // Handle simple array format (when no pagination parameters are provided)
    if (Array.isArray(rawEntitiesData)) {
      // Check if data is already in object format
      if (
        rawEntitiesData.length > 0 &&
        typeof rawEntitiesData[0] === "object" &&
        "entity_id" in rawEntitiesData[0]
      ) {
        return rawEntitiesData;
      }

      // Transform array format [id, name, type_name, attributes] to object format
      return rawEntitiesData.map((row: unknown): apiService.Entity => {
        if (Array.isArray(row) && row.length >= 4) {
          return {
            entity_id: row[0] as number,
            entity_name: row[1] as string,
            entity_type_name: row[2] as string,
            attributes: row[3] as apiService.JSONValue, // Don't parse here, let formatAttributes handle it
          };
        }
        return row as apiService.Entity;
      });
    }

    if (
      rawEntitiesData &&
      typeof rawEntitiesData === "object" &&
      "data" in rawEntitiesData
    ) {
      return rawEntitiesData.data || [];
    }

    // Handle count-only response format: { count: number }
    if (
      rawEntitiesData &&
      typeof rawEntitiesData === "object" &&
      "count" in rawEntitiesData &&
      !("data" in rawEntitiesData)
    ) {
      return []; // Return empty array for count-only responses
    }

    return [];
  }, [rawEntitiesData]);

  // Fetch entity types for filter dropdown
  const { data: rawEntityTypesData } = useQuery({
    queryKey: ["entity-types"],
    queryFn: () => apiService.queryEntityTypes({}),
  });

  // Transform entity types API response data to array format
  const entityTypesData = React.useMemo(() => {
    if (!rawEntityTypesData) return [];

    if (
      rawEntityTypesData &&
      typeof rawEntityTypesData === "object" &&
      "data" in rawEntityTypesData
    ) {
      return rawEntityTypesData.data || [];
    }

    // Handle count-only response format: { count: number }
    if (
      rawEntityTypesData &&
      typeof rawEntityTypesData === "object" &&
      "count" in rawEntityTypesData &&
      !("data" in rawEntityTypesData)
    ) {
      return []; // Return empty array for count-only responses
    }

    // Handle legacy array format (fallback)
    if (Array.isArray(rawEntityTypesData)) {
      return rawEntityTypesData;
    }

    return [];
  }, [rawEntityTypesData]);

  // Create list of unique entity names for autocomplete
  const uniqueEntityNames = React.useMemo(() => {
    if (!entitiesData) return [];
    const names = entitiesData
      .map((entity) => entity.entity_name)
      .filter(Boolean);
    return [...new Set(names)].sort();
  }, [entitiesData]);

  // Apply client-side filtering for entity name and type
  const filteredEntitiesData = React.useMemo(() => {
    if (!entitiesData) return [];

    return entitiesData.filter((entity) => {
      // Filter by entity name
      const nameMatch =
        !entityNameFilter ||
        entity.entity_name
          .toLowerCase()
          .includes(entityNameFilter.toLowerCase());

      // Filter by entity type
      const typeMatch =
        !entityTypeFilter || entity.entity_type_name === entityTypeFilter;

      return nameMatch && typeMatch;
    });
  }, [entitiesData, entityNameFilter, entityTypeFilter]);

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
    if (!groupSelectionMode || !filteredEntitiesData) return;

    const visibleEntityIds = filteredEntitiesData.map(
      (entity) => entity.entity_id
    );
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
  }, [groupSelectionMode, filteredEntitiesData, selectedEntityIds]);

  const formatAttributes = (attributes: apiService.JSONValue) => {
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
                  filteredEntitiesData?.map((entity) => entity.entity_id) || [];
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
              renderCell: (params: GridRenderCellParams) => {
                const isSelected = selectedEntityIds.has(params.row.entity_id);
                return (
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleEntityToggle(params.row.entity_id)}
                    size="small"
                  />
                );
              },
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
            (type) => type.entity_type_name === params.row.entity_type_name
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
        field: "entity_name",
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
      filteredEntitiesData,
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

    try {
      // Step 7: Call PUT /client-groups/{client_group_name}/entities:set
      const result = await apiService.setClientGroupEntities(
        groupSelectionMode.clientGroupName,
        { entity_ids: desiredEntityIds }
      );

      // Invalidate relevant caches to ensure UI reflects the changes
      queryClient.invalidateQueries({
        queryKey: ["client-group-entities", groupSelectionMode.clientGroupName],
      });
      queryClient.invalidateQueries({
        queryKey: ["entities"],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "client-group-entity-ids",
          groupSelectionMode.clientGroupName,
        ],
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
            ? `${groupSelectionMode.clientGroupName} (${selectedEntityIds.size} selected)`
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
                setEditingEntity(null); // Set null for new entity
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
          {(entityNameFilter || entityTypeFilter) && (
            <Box sx={{ p: 1, bgcolor: "primary.light", borderRadius: 1 }}>
              <Typography variant="body2" color="primary.contrastText">
                Filters active:{" "}
                {entityNameFilter && `Name: "${entityNameFilter}"`}
                {entityNameFilter && entityTypeFilter && " • "}
                {entityTypeFilter && `Type: "${entityTypeFilter}"`}
              </Typography>
            </Box>
          )}
          <Stack direction="row" spacing={2}>
            <Autocomplete
              options={uniqueEntityNames}
              value={entityNameFilter}
              onChange={(_, newValue) => setEntityNameFilter(newValue || "")}
              onInputChange={(_, newInputValue) =>
                setEntityNameFilter(newInputValue)
              }
              freeSolo
              size="small"
              sx={{ minWidth: 200 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Name (contains)"
                  placeholder="Type to search..."
                />
              )}
              filterOptions={(options, { inputValue }) => {
                if (!inputValue) return options;
                return options.filter((option) =>
                  option.toLowerCase().includes(inputValue.toLowerCase())
                );
              }}
              noOptionsText="No matching entities"
            />
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
                <MenuItem
                  key={type.entity_type_name}
                  value={type.entity_type_name}
                >
                  {type.entity_type_name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Showing {filteredEntitiesData.length} of {entitiesData.length}{" "}
              entities
            </Typography>
            <Button
              variant="outlined"
              onClick={() => {
                setEntityNameFilter("");
                setEntityTypeFilter("");
              }}
            >
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
        {filteredEntitiesData.length === 0 && !isLoading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {entityNameFilter || entityTypeFilter
                ? "No entities match the current filters"
                : "No entities found"}
              <br />
              {!entityNameFilter && !entityTypeFilter && (
                <>
                  No entities found.
                  <br />
                  Click "New" to create one.
                </>
              )}
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={filteredEntitiesData || []}
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
            editingEntity={editingEntity || undefined}
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
