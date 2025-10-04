import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  Box,
  Typography,
  CircularProgress,
  TextField,
  Button,
  Chip,
  Modal,
  Autocomplete,
  Tooltip,
  IconButton,
  Alert,
  Snackbar,
} from "@mui/material";
import {
  Add,
  InfoOutlined,
  ArrowBack,
  PlayArrow,
  Pause,
} from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import type {
  GridColDef,
  GridRenderCellParams,
  GridRowParams,
} from "@mui/x-data-grid";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import * as apiService from "../services/api";
import TransactionForm from "./TransactionForm";
import TransactionTypesTable from "./TransactionTypesTable";

// Helper function for formatting properties
const formatProperties = (properties: unknown) => {
  if (!properties) return "";
  try {
    const parsed =
      typeof properties === "string" ? JSON.parse(properties) : properties;
    return Object.entries(parsed)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
  } catch {
    return String(properties);
  }
};

// Status mapping for consistent lookups
const STATUS_MAP: Record<
  number,
  {
    name: string;
    color:
      | "default"
      | "primary"
      | "secondary"
      | "error"
      | "info"
      | "success"
      | "warning";
    variant: "filled" | "outlined";
  }
> = {
  1: { name: "INCOMPLETE", color: "warning", variant: "filled" },
  2: { name: "QUEUED", color: "info", variant: "filled" },
  3: { name: "PROCESSED", color: "success", variant: "filled" },
};

const TransactionsTable: React.FC = () => {
  const { userId } = useAuth();
  const formRef = useRef<{ handleDismissal: () => void }>(null);

  // Get current user's database ID
  const { data: currentUser } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiService.queryUsers({ sub: userId! }),
    enabled: !!userId,
    select: (data) => data[0], // Get first user from array
  });

  // Get primary client group for display
  const { data: primaryClientGroup } = useQuery({
    queryKey: ["primary-client-group", currentUser?.primary_client_group_id],
    queryFn: () =>
      apiService.queryClientGroups({
        client_group_id: currentUser!.primary_client_group_id!,
      }),
    enabled: !!currentUser?.primary_client_group_id,
    select: (data) => data[0],
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<
    apiService.Transaction | undefined
  >(undefined);
  const [isTransactionTypesModalOpen, setIsTransactionTypesModalOpen] =
    useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTransactionType, setSelectedTransactionType] = useState<
    number | null
  >(null);
  const [positionKeeperMessage, setPositionKeeperMessage] =
    useState<string>("");
  const [positionKeeperSeverity, setPositionKeeperSeverity] = useState<
    "success" | "error"
  >("success");
  const [isPollingActive, setIsPollingActive] = useState(false);

  // Position keeper mutation
  const queryClient = useQueryClient();
  const runPositionKeeperMutation = useMutation({
    mutationFn: apiService.runPositionKeeper,
    onSuccess: (data) => {
      setPositionKeeperMessage(
        data.message || "Position keeper executed successfully"
      );
      setPositionKeeperSeverity("success");
      // Refresh transactions to see any status changes
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (error: any) => {
      setPositionKeeperMessage(
        error.message || "Failed to run position keeper"
      );
      setPositionKeeperSeverity("error");
    },
  });

  // Fetch transactions
  const {
    data: rawTransactionsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "transactions",
      "client-group",
      currentUser?.primary_client_group_id,
      searchTerm,
      selectedTransactionType,
    ],
    queryFn: async () => {
      if (!currentUser?.user_id) {
        throw new Error("No user ID available");
      }

      const queryParams = {
        user_id: currentUser.user_id,
        client_group_id: currentUser.primary_client_group_id,
      };

      return await apiService.queryTransactions(queryParams as any);
    },
    enabled: !!currentUser?.user_id && !!currentUser?.primary_client_group_id,
    staleTime: 30 * 1000, // 30 seconds - more responsive
    refetchOnMount: true, // Refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Fetch transaction types for filter
  const { data: transactionTypes } = useQuery({
    queryKey: ["transaction-types"],
    queryFn: () => apiService.queryTransactionTypes({}),
  });

  // Fetch entities for display
  const { data: entities } = useQuery({
    queryKey: ["entities", currentUser?.primary_client_group_id],
    queryFn: () =>
      apiService.queryEntities({
        user_id: currentUser!.user_id,
        client_group_id: currentUser!.primary_client_group_id,
      } as any),
    enabled: !!currentUser?.user_id && !!currentUser?.primary_client_group_id,
  });

  // Create lookup maps for O(1) access
  const entityMap = useMemo(() => {
    if (!entities) return new Map();
    return new Map(entities.map((entity) => [entity.entity_id, entity]));
  }, [entities]);

  const transactionTypeMap = useMemo(() => {
    if (!transactionTypes) return new Map();
    return new Map(
      transactionTypes.map((type) => [type.transaction_type_id, type])
    );
  }, [transactionTypes]);

  // Process transactions data with O(1) lookups
  const transactionsData = useMemo(() => {
    if (!rawTransactionsData || !entities) return [];

    let processedData = rawTransactionsData.map((transaction) => {
      // O(1) lookups instead of O(n) searches
      const portfolioEntity = entityMap.get(transaction.portfolio_entity_id);
      const contraEntity = entityMap.get(transaction.contra_entity_id);
      const instrumentEntity = entityMap.get(transaction.instrument_entity_id);
      const transactionType = transactionTypeMap.get(
        transaction.transaction_type_id
      );

      return {
        id: transaction.transaction_id,
        transaction_id: transaction.transaction_id,
        portfolio_entity_id: transaction.portfolio_entity_id,
        portfolio_entity_name:
          portfolioEntity?.name || `Entity ${transaction.portfolio_entity_id}`,
        contra_entity_id: transaction.contra_entity_id,
        contra_entity_name:
          contraEntity?.name || `Entity ${transaction.contra_entity_id}`,
        instrument_entity_id: transaction.instrument_entity_id,
        instrument_entity_name:
          instrumentEntity?.name ||
          `Entity ${transaction.instrument_entity_id}`,
        properties: transaction.properties,
        transaction_type_id: transaction.transaction_type_id,
        transaction_type_name:
          transactionType?.name || `Type ${transaction.transaction_type_id}`,
        transaction_status_id: transaction.transaction_status_id,
        update_date: transaction.update_date,
        updated_user_id: transaction.updated_user_id,
      };
    });

    // Apply filters
    if (searchTerm) {
      processedData = processedData.filter(
        (transaction) =>
          transaction.portfolio_entity_name
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          transaction.contra_entity_name
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          transaction.instrument_entity_name
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          transaction.transaction_type_name
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
      );
    }

    if (selectedTransactionType) {
      processedData = processedData.filter(
        (transaction) =>
          transaction.transaction_type_id === selectedTransactionType
      );
    }

    return processedData;
  }, [
    rawTransactionsData,
    entityMap,
    transactionTypeMap,
    searchTerm,
    selectedTransactionType,
    entities,
  ]);

  // Polling logic for QUEUED transactions
  useEffect(() => {
    let intervalId: number | null = null;

    if (isPollingActive) {
      // Check for QUEUED transactions every 10 seconds
      intervalId = setInterval(() => {
        if (transactionsData && transactionsData.length > 0) {
          const queuedTransactions = transactionsData.filter(
            (transaction) => transaction.transaction_status_id === 2 // QUEUED
          );

          if (queuedTransactions.length > 0) {
            console.log(
              `Found ${queuedTransactions.length} QUEUED transactions, triggering position keeper`
            );
            runPositionKeeperMutation.mutate();
          }
        }
      }, 10000); // 10 seconds
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPollingActive, transactionsData, runPositionKeeperMutation]);

  // Toggle polling function
  const togglePolling = useCallback(() => {
    setIsPollingActive((prev) => !prev);
  }, []);

  const handleEdit = useCallback((transaction: apiService.Transaction) => {
    setEditingTransaction(transaction);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingTransaction(undefined);
  }, []);

  const handleFormDismissal = useCallback(() => {
    // Call the form's dismissal handler if it exists
    if (formRef.current?.handleDismissal) {
      formRef.current.handleDismissal();
    }
    // Close the modal
    setIsFormOpen(false);
    setEditingTransaction(undefined);
  }, []);

  // Memoized column definitions to prevent recreation on every render
  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "transaction_id",
        headerName: "ID",
        width: 80,
        align: "center",
        headerAlign: "center",
        cellClassName: "centered-cell",
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" fontWeight="bold">
            {params.value}
          </Typography>
        ),
      },
      {
        field: "portfolio_entity_name",
        headerName: "Portfolio",
        width: 150,
        align: "center",
        headerAlign: "center",
        cellClassName: "centered-cell",
      },
      {
        field: "contra_entity_name",
        headerName: "Contra",
        width: 150,
        align: "center",
        headerAlign: "center",
        cellClassName: "centered-cell",
      },
      {
        field: "instrument_entity_name",
        headerName: "Instrument",
        width: 150,
        align: "center",
        headerAlign: "center",
        cellClassName: "centered-cell",
      },
      {
        field: "transaction_type_name",
        headerName: "Type",
        width: 120,
        align: "center",
        headerAlign: "center",
        cellClassName: "centered-cell",
        renderCell: (params: GridRenderCellParams) => (
          <Chip
            label={params.value}
            size="small"
            color="primary"
            variant="outlined"
          />
        ),
      },
      {
        field: "transaction_status_name",
        headerName: "Status",
        width: 120,
        align: "center",
        headerAlign: "center",
        cellClassName: "centered-cell",
        renderCell: (params: GridRenderCellParams) => {
          const statusId = params.row.transaction_status_id;
          const statusInfo = STATUS_MAP[statusId] || STATUS_MAP[1]; // Default to INCOMPLETE

          return (
            <Chip
              label={statusInfo.name}
              size="small"
              color={statusInfo.color}
              variant={statusInfo.variant}
            />
          );
        },
      },
      {
        field: "properties",
        headerName: "Properties",
        width: 200,
        align: "center",
        headerAlign: "center",
        cellClassName: "centered-cell",
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" sx={{ fontSize: "0.75rem" }}>
            {formatProperties(params.value)}
          </Typography>
        ),
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
        minHeight="200px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Typography color="error">
          Error loading transactions:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </Typography>
        <Button onClick={() => refetch()} sx={{ mt: 1 }}>
          Retry
        </Button>
      </Box>
    );
  }

  const primaryClientGroupName =
    primaryClientGroup?.name || "this client group";

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h5">Transactions</Typography>
        <Tooltip
          title="Transactions represent trades, transfers, or other financial activities between entities. Each transaction involves a party (buyer/seller), contra (other party), instrument (what was traded), and currency (denomination)."
          placement="right"
          arrow
        >
          <IconButton
            size="small"
            sx={{
              color: "text.secondary",
              p: 0.25,
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.04)",
              },
            }}
          >
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button
          variant="contained"
          color="success"
          size="small"
          startIcon={<Add />}
          onClick={() => setIsFormOpen(true)}
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
            color={isPollingActive ? "error" : "primary"}
            size="small"
            onClick={togglePolling}
            disabled={runPositionKeeperMutation.isPending}
            startIcon={
              runPositionKeeperMutation.isPending ? (
                <CircularProgress size={16} />
              ) : isPollingActive ? (
                <Pause />
              ) : (
                <PlayArrow />
              )
            }
            sx={{
              borderRadius: "20px",
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            {isPollingActive ? "Stop Position Keeper" : "Run Position Keeper"}
          </Button>
          <Tooltip
            title={
              isPollingActive
                ? "Stop automatic processing of queued transactions"
                : "Start automatic processing of queued transactions every 10 seconds"
            }
            placement="top"
          >
            <IconButton
              size="small"
              sx={{
                color: "text.secondary",
                p: 0.25,
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                },
              }}
            >
              <InfoOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => setIsTransactionTypesModalOpen(true)}
            sx={{
              borderRadius: "20px",
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            Edit Transaction Types
          </Button>
          <Tooltip
            title="Manage transaction types and their properties. Transaction types define categories for organizing your transactions (e.g., Buy, Sell, Transfer)."
            placement="top"
          >
            <IconButton
              size="small"
              sx={{
                color: "text.secondary",
                p: 0.25,
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                },
              }}
            >
              <InfoOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Filters */}
      <Box sx={{ mb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField
          label="Search transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          sx={{ minWidth: 200 }}
        />
        <Autocomplete
          size="small"
          options={transactionTypes || []}
          getOptionLabel={(option) => option.name}
          value={
            selectedTransactionType
              ? transactionTypeMap.get(selectedTransactionType) || null
              : null
          }
          onChange={(_, newValue) =>
            setSelectedTransactionType(newValue?.transaction_type_id || null)
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Transaction Type"
              sx={{ minWidth: 150 }}
            />
          )}
          sx={{ minWidth: 200 }}
        />
      </Box>

      {/* Data Grid */}
      <Box>
        <DataGrid
          rows={transactionsData}
          columns={columns}
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 25 },
            },
          }}
          onRowClick={(params: GridRowParams) =>
            handleEdit(params.row as apiService.Transaction)
          }
          sx={{
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "#f5f5f5 !important",
              borderBottom: "1px solid rgba(25, 118, 210, 0.2) !important",
            },
            "& .MuiDataGrid-columnHeader": {
              backgroundColor: "#f5f5f5 !important",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
            "& .MuiDataGrid-cell": {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
            "& .centered-cell": {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
          }}
          slots={{
            noRowsOverlay: () => (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  p: 3,
                }}
              >
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No transactions found
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  textAlign="center"
                >
                  No transactions exist for {primaryClientGroupName}
                  <br />
                  Click "New Transaction" to create one for{" "}
                  {primaryClientGroupName}.
                </Typography>
              </Box>
            ),
          }}
        />
      </Box>

      {/* Transaction Form Modal */}
      <Modal
        open={isFormOpen}
        onClose={() => {}} // Disable backdrop clicks
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            handleFormDismissal();
          }
        }}
        disableAutoFocus={false}
        disableEnforceFocus={false}
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: "800px",
            maxHeight: "90vh",
            overflow: "auto",
            bgcolor: "background.paper",
            borderRadius: 2,
            boxShadow: 24,
            p: 0,
          }}
        >
          <TransactionForm
            ref={formRef}
            editingTransaction={editingTransaction}
            onClose={handleCloseForm}
          />
        </Box>
      </Modal>

      {/* Transaction Types Full Screen View */}
      {isTransactionTypesModalOpen && (
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
              onClick={() => setIsTransactionTypesModalOpen(false)}
              startIcon={<ArrowBack />}
            >
              Back to Transactions
            </Button>
            <Typography variant="h5">Transaction Types</Typography>
          </Box>
          <TransactionTypesTable />
        </Box>
      )}

      {/* Position Keeper Result Snackbar */}
      <Snackbar
        open={!!positionKeeperMessage}
        autoHideDuration={6000}
        onClose={() => setPositionKeeperMessage("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setPositionKeeperMessage("")}
          severity={positionKeeperSeverity}
          sx={{ width: "100%" }}
        >
          {positionKeeperMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default React.memo(TransactionsTable);
