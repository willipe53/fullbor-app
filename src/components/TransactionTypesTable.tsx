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
import { Add, InfoOutlined } from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import type {
  GridColDef,
  GridRenderCellParams,
  GridRowParams,
} from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import * as apiService from "../services/api";
import type {
  QueryTransactionTypesResponse,
  TransactionType,
} from "../services/api";
import TransactionTypeForm from "./TransactionTypeForm";

const TransactionTypesTable: React.FC = () => {
  const [editingTransactionType, setEditingTransactionType] =
    useState<TransactionType | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch transaction types
  const {
    data: rawData,
    isLoading,
    error,
    refetch,
  } = useQuery<QueryTransactionTypesResponse>({
    queryKey: ["transaction-types"],
    queryFn: async () => {
      try {
        const result = await apiService.queryTransactionTypes({});
        return result;
      } catch (err) {
        throw err;
      }
    },
  });

  // Use the data directly since it's already an array of TransactionType
  const data = rawData || [];

  // Get current user for primary client group (simplified approach)
  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => apiService.queryUsers({ sub: "current" }),
    select: (data) => data[0],
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

  const formatProperties = (properties: any) => {
    if (!properties) return "None";

    let parsedProperties;

    // Handle different data types - parse to object first
    if (typeof properties === "string") {
      try {
        parsedProperties = JSON.parse(properties);
      } catch {
        return `Invalid JSON: ${properties.substring(0, 50)}...`;
      }
    } else if (typeof properties === "object") {
      parsedProperties = properties;
    } else {
      return String(properties);
    }

    try {
      const entries = Object.entries(parsedProperties);
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
      return "Invalid properties";
    }
  };

  // Define DataGrid columns
  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "transaction_type_id",
        headerName: "ID",
        width: 100,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" sx={{ fontWeight: "500" }}>
            {params.value}
          </Typography>
        ),
      },
      {
        field: "transaction_type_name",
        headerName: "Name",
        flex: 1,
        minWidth: 200,
      },
      {
        field: "properties",
        headerName: "Properties",
        flex: 1,
        minWidth: 200,
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
              color: "text.secondary",
            }}
          >
            {formatProperties(params.value)}
          </Typography>
        ),
      },
    ],
    []
  );

  const handleRowClick = (params: GridRowParams) => {
    setEditingTransactionType(params.row);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTransactionType(null);
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
          Error loading transaction types
        </Typography>
        <Typography color="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Typography>
        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          This is likely a backend API issue. The /get_transaction_types
          endpoint is returning an error.
        </Typography>
        <Typography variant="body2" sx={{ mb: 3, color: "text.secondary" }}>
          💡 <strong>Possible causes:</strong> Database constraint violations,
          Lambda function errors, or API gateway timeouts.
        </Typography>
        <Button variant="contained" onClick={() => refetch()} sx={{ mr: 2 }}>
          Retry
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            console.log("TransactionTypesTable error details:", error);
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
        <Typography variant="h5">Transaction Types</Typography>
        <Tooltip
          title="Transaction Types define the different kinds of transactions that can be recorded in the system (Buy, Sell, Dividend, etc.)."
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
            setEditingTransactionType(null); // Set null for new transaction type
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
              No transaction types found
              <br />
              No transaction types exist for{" "}
              {primaryClientGroup?.name || "this client group"}
              <br />
              Click "New" to create one for{" "}
              {primaryClientGroup?.name || "this client group"}.
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={data || []}
            columns={columns}
            getRowId={(row) => row.transaction_type_id}
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
        aria-labelledby="edit-transaction-type-modal"
        aria-describedby="edit-transaction-type-form"
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
          }}
        >
          <TransactionTypeForm
            editingTransactionType={editingTransactionType || undefined}
            onClose={handleCloseModal}
          />
        </Box>
      </Modal>
    </Box>
  );
};

export default React.memo(TransactionTypesTable);
