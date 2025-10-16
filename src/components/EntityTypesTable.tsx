import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Modal,
  Tooltip,
  IconButton,
} from "@mui/material";
import { Add, InfoOutlined, Refresh } from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import type {
  GridColDef,
  GridRenderCellParams,
  GridRowParams,
} from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import * as apiService from "../services/api";
import type { QueryEntityTypesResponse } from "../services/api";
import EntityTypeForm from "./EntityTypeForm";

// Temporary local interface definition to bypass import issue
interface EntityType {
  entity_type_id: number;
  entity_type_name: string;
  short_label?: string;
  label_color?: string;
  attributes_schema: object | string;
  entity_category?: string;
  update_date?: string;
  updated_by_user_name?: string;
}

const EntityTypesTable: React.FC = () => {
  const [editingEntityType, setEditingEntityType] = useState<EntityType | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch entity types
  const {
    data: rawData,
    isLoading,
    error,
    refetch,
  } = useQuery<QueryEntityTypesResponse>({
    queryKey: ["entity-types"],
    queryFn: async () => {
      try {
        const result = await apiService.queryEntityTypes({});
        // console.log(
        //   "✅ EntityTypesTable - API call successful, result:",
        //   result
        // );
        return result;
      } catch (err) {
        console.error("❌ EntityTypesTable - API call failed:", err);
        throw err;
      }
    },
  });

  // Transform API response data to array format
  const data = useMemo<EntityType[]>(() => {
    if (!rawData) return [];

    // Handle simple array format (when no pagination parameters are provided)
    if (Array.isArray(rawData)) {
      return rawData as EntityType[];
    }

    if (rawData && typeof rawData === "object" && "data" in rawData) {
      return (rawData.data as EntityType[]) || [];
    }

    // Handle count-only response format: { count: number }
    if (
      rawData &&
      typeof rawData === "object" &&
      "count" in rawData &&
      !("data" in rawData)
    ) {
      return []; // Return empty array for count-only responses
    }

    return [];
  }, [rawData]);

  // Get current user for primary client group (simplified approach)
  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const result = await apiService.queryUsers({ sub: "current" });
      return Array.isArray(result) ? result : [];
    },
    select: (data) => data[0] || null,
  });

  // Get primary client group details
  const { data: primaryClientGroup } = useQuery({
    queryKey: ["primary-client-group", currentUser?.primary_client_group_id],
    queryFn: async () => {
      const result = await apiService.queryClientGroups({});
      if (Array.isArray(result)) {
        return result;
      }
      if (typeof result === "object" && result !== null && "data" in result) {
        return result.data || [];
      }
      return [];
    },
    enabled: !!currentUser?.primary_client_group_id,
    select: (data) =>
      data.find(
        (cg: apiService.ClientGroup) =>
          cg.client_group_id === currentUser?.primary_client_group_id
      ) || null,
  });

  const formatSchema = (schema: object | string | null | undefined) => {
    if (!schema) return "None";

    let parsedSchema;

    // Handle different data types - parse to object first
    if (typeof schema === "string") {
      try {
        parsedSchema = JSON.parse(schema);
      } catch {
        return `Invalid JSON: ${schema.substring(0, 50)}...`;
      }
    } else if (typeof schema === "object") {
      parsedSchema = schema;
    } else {
      return String(schema);
    }

    try {
      const properties = parsedSchema.properties || {};
      const propNames = Object.keys(properties);
      if (propNames.length === 0) return "None";

      return propNames
        .map((prop) => {
          const propDef = properties[prop];
          const type = propDef.type || "unknown";
          const format = propDef.format ? `:${propDef.format}` : "";
          return `${prop}(${type}${format})`;
        })
        .join(", ");
    } catch {
      return "Invalid Schema";
    }
  };

  // Define DataGrid columns
  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "entity_type_id",
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
          // Get the label_color from the same row
          const labelColor = params.row.label_color;
          const colorValue = labelColor?.startsWith("#")
            ? labelColor
            : labelColor
            ? `#${labelColor}`
            : "#000000";

          return params.value ? (
            <Typography
              variant="body2"
              sx={{
                fontWeight: "bold",
                color: colorValue,
              }}
            >
              {params.value}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          );
        },
      },
      {
        field: "entity_type_name",
        headerName: "Name",
      },
      {
        field: "attributes_schema",
        headerName: "Schema Properties",
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
            {formatSchema(params.value)}
          </Typography>
        ),
      },
    ],
    []
  );

  const handleRowClick = (params: GridRowParams) => {
    setEditingEntityType(params.row);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEntityType(null);
  };

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
          Error loading entity types
        </Typography>
        <Typography color="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Typography>
        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          This is likely a backend API issue. The /get_entity_types endpoint is
          returning a 502 error.
        </Typography>
        <Typography variant="body2" sx={{ mb: 3, color: "text.secondary" }}>
          💡 <strong>Possible causes:</strong> Database constraint violations
          from test data, Lambda function errors, or API gateway timeouts.
        </Typography>
        <Button variant="contained" onClick={() => refetch()} sx={{ mr: 2 }}>
          Retry
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            console.log("EntityTypesTable error details:", error);
            alert("Check browser console for detailed error information");
          }}
        >
          Show Debug Info
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Typography variant="h5">Entity Types</Typography>
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
          title="Entity Types define required and optional attributes of Entities. Making changes here will affect the fields that are visible by default for all Entities in your organization."
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
          onClick={() => {
            setEditingEntityType(null); // Set null for new entity type
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
      </Box>

      {/* Data Grid */}
      <Box sx={{ height: 600, width: "100%" }}>
        {data.length === 0 && !isLoading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No entity types found
              <br />
              No entity types exist for{" "}
              {primaryClientGroup?.client_group_name || "this client group"}
              <br />
              Click "New" to create one for{" "}
              {primaryClientGroup?.client_group_name || "this client group"}.
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={data || []}
            columns={columns}
            getRowId={(row) => row.entity_type_id}
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
                lineHeight: "unset !important",
                maxHeight: "none !important",
                whiteSpace: "unset",
              },
              "& .MuiDataGrid-row": {
                maxHeight: "none !important",
              },
              "& .MuiDataGrid-renderingZone": {
                maxHeight: "none !important",
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
        aria-labelledby="edit-entity-type-modal"
        aria-describedby="edit-entity-type-form"
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: 700,
            height: "90vh",
            display: "flex",
            flexDirection: "column",
            bgcolor: "background.paper",
            borderRadius: 2,
            boxShadow: 24,
            p: 0,
            overflow: "hidden", // Ensure modal doesn't scroll
          }}
        >
          <EntityTypeForm
            editingEntityType={editingEntityType || undefined}
            onClose={handleCloseModal}
          />
        </Box>
      </Modal>
    </Box>
  );
};

export default React.memo(EntityTypesTable);
