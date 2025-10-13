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
  Button,
  Chip,
  Modal,
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
import TableFilter from "./TableFilter";

// Memoized helper function for formatting properties - moved outside component to avoid recreation
const formatProperties = (() => {
  const cache = new Map<string, string>();
  return (properties: unknown): string => {
    if (!properties) return "";

    // Use cache key for memoization
    const cacheKey =
      typeof properties === "string" ? properties : JSON.stringify(properties);

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    try {
      const parsed =
        typeof properties === "string" ? JSON.parse(properties) : properties;
      const result = Object.entries(parsed)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");

      // Cache the result (limit cache size to prevent memory leaks)
      if (cache.size > 1000) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
          cache.delete(firstKey);
        }
      }
      cache.set(cacheKey, result);

      return result;
    } catch {
      const result = String(properties);
      cache.set(cacheKey, result);
      return result;
    }
  };
})();

// Status mapping by name for O(1) lookups (more efficient than Object.values().find())
const STATUS_NAME_MAP: Record<
  string,
  {
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
  INCOMPLETE: { color: "warning", variant: "filled" },
  QUEUED: { color: "info", variant: "filled" },
  PROCESSED: { color: "success", variant: "filled" },
};

const TransactionsTable: React.FC = () => {
  const { userId } = useAuth();
  const formRef = useRef<{ handleDismissal: () => void }>(null);

  // Get current user's database ID
  const { data: currentUser } = useQuery({
    queryKey: ["user", userId],
    queryFn: async () => {
      const result = await apiService.queryUsers({ sub: userId! });
      return result;
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 10 minutes - user data changes rarely
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    select: (data) => {
      // Handle both array and paginated response
      let usersArray: apiService.User[];
      if (Array.isArray(data)) {
        usersArray = data;
      } else if ("data" in data && Array.isArray(data.data)) {
        usersArray = data.data as apiService.User[];
      } else {
        usersArray = [];
      }
      // Find the user that matches the current userId (sub)
      const user = usersArray.find((u) => u.sub === userId);
      return user;
    },
  });

  // Get primary client group for display
  const { data: primaryClientGroup } = useQuery({
    queryKey: ["primary-client-group", currentUser?.primary_client_group_id],
    queryFn: async () => {
      const result = await apiService.queryClientGroups({});
      return result;
    },
    enabled: !!currentUser?.primary_client_group_id,
    staleTime: 10 * 60 * 1000, // 10 minutes - client groups change rarely
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    select: (data) => {
      // Handle both array and paginated response
      let groupsArray: apiService.ClientGroup[];
      if (Array.isArray(data)) {
        groupsArray = data;
      } else if ("data" in data && Array.isArray(data.data)) {
        groupsArray = data.data as apiService.ClientGroup[];
      } else {
        groupsArray = [];
      }
      // Find the group that matches the primary_client_group_id
      const group = groupsArray.find(
        (g) => g.client_group_id === currentUser?.primary_client_group_id
      );
      return group;
    },
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<
    apiService.Transaction | undefined
  >(undefined);
  const [isTransactionTypesModalOpen, setIsTransactionTypesModalOpen] =
    useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [positionKeeperMessage, setPositionKeeperMessage] =
    useState<string>("");
  const [positionKeeperSeverity, setPositionKeeperSeverity] = useState<
    "success" | "error"
  >("success");
  const [positionKeeperStatus, setPositionKeeperStatus] =
    useState<string>("stopped");

  // Helper function to get field values for filtering
  const getFieldValue = (
    transaction: apiService.Transaction,
    field: string
  ): string => {
    switch (field) {
      case "Portfolio":
        return transaction.portfolio_entity_name || "";
      case "Contra":
        return transaction.contra_entity_name || "";
      case "Instrument":
        return transaction.instrument_entity_name || "";
      case "Type":
        return transaction.transaction_type_name || "";
      case "Status":
        return transaction.transaction_status_name || "";
      default:
        return "";
    }
  };

  // Position keeper mutations
  const queryClient = useQueryClient();

  const startPositionKeeperMutation = useMutation({
    mutationFn: () => apiService.startPositionKeeper(),
    onSuccess: (data: { message: string }) => {
      setPositionKeeperMessage(
        data.message || "Position keeper started successfully"
      );
      setPositionKeeperSeverity("success");
      // Refresh transactions to see any status changes
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (error: Error) => {
      setPositionKeeperMessage(
        error.message || "Failed to start position keeper"
      );
      setPositionKeeperSeverity("error");
    },
  });

  const stopPositionKeeperMutation = useMutation({
    mutationFn: apiService.stopPositionKeeper,
    onSuccess: (data: { message: string }) => {
      setPositionKeeperMessage(
        data.message || "Position keeper stopped successfully"
      );
      setPositionKeeperSeverity("success");
      // Refresh transactions to see any status changes
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (error: Error) => {
      setPositionKeeperMessage(
        error.message || "Failed to stop position keeper"
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
    ],
    queryFn: async () => {
      if (!currentUser?.user_id) {
        throw new Error("No user ID available");
      }

      // Don't send any query parameters - backend filters by X-Current-User-Id header
      const result = await apiService.queryTransactions({});
      return result;
    },
    enabled: !!currentUser?.user_id && !!currentUser?.primary_client_group_id,
    staleTime: 2 * 60 * 1000, // 2 minutes - balance between freshness and performance
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnMount: false, // Don't refetch on mount if data is still fresh
    refetchOnWindowFocus: true, // Refetch when window regains focus (for concurrent edits)
  });

  // Process transactions data with O(1) lookups
  const transactionsData = useMemo(() => {
    if (!rawTransactionsData) return [];

    // Handle both array and paginated response formats
    let transactionsArray: apiService.Transaction[];
    if (Array.isArray(rawTransactionsData)) {
      transactionsArray = rawTransactionsData;
    } else if (
      "data" in rawTransactionsData &&
      Array.isArray(rawTransactionsData.data)
    ) {
      transactionsArray = rawTransactionsData.data as apiService.Transaction[];
    } else {
      transactionsArray = [];
    }

    let processedData = transactionsArray.map(
      (transaction: apiService.Transaction) => {
        return {
          id: transaction.transaction_id,
          transaction_id: transaction.transaction_id,
          portfolio_entity_name: transaction.portfolio_entity_name,
          contra_entity_name: transaction.contra_entity_name,
          instrument_entity_name: transaction.instrument_entity_name,
          properties: transaction.properties,
          transaction_type_name: transaction.transaction_type_name,
          transaction_status_name: transaction.transaction_status_name,
          trade_date: transaction.trade_date,
          settle_date: transaction.settle_date,
          update_date: transaction.update_date,
          updated_by_user_name: transaction.updated_by_user_name,
        };
      }
    );

    // Apply filters
    Object.entries(filters).forEach(([field, value]) => {
      if (value && value.trim() !== "") {
        processedData = processedData.filter(
          (transaction: apiService.Transaction) => {
            const fieldValue = getFieldValue(transaction, field);
            return (
              fieldValue &&
              fieldValue.toLowerCase().includes(value.toLowerCase())
            );
          }
        );
      }
    });

    return processedData;
  }, [rawTransactionsData, filters]);

  // Polling logic to check position keeper status
  // Poll every 60 seconds while component is mounted
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await apiService.getPositionKeeperStatus();
        // Update the status based on status field
        // Note: The API returns "idle" or "running" in the status field
        // But the new PKManager returns ec2_state in overall_status
        // We'll check for "running" to determine if running
        const statusValue =
          (status as { overall_status?: string; status: string })
            .overall_status || status.status;
        if (statusValue === "running") {
          setPositionKeeperStatus("running");
        } else {
          setPositionKeeperStatus("stopped");
        }
      } catch (error) {
        console.error("Error checking position keeper status:", error);
        setPositionKeeperStatus("stopped");
      }
    };

    // Check immediately on mount
    checkStatus();

    // Then check every 60 seconds
    const intervalId = setInterval(checkStatus, 60000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Handle position keeper button click
  const handlePositionKeeperClick = useCallback(() => {
    if (positionKeeperStatus === "running") {
      // Stop position keeper
      stopPositionKeeperMutation.mutate();
    } else {
      // Start position keeper
      startPositionKeeperMutation.mutate();
    }
  }, [
    positionKeeperStatus,
    startPositionKeeperMutation,
    stopPositionKeeperMutation,
  ]);

  const handleEdit = useCallback(
    (transactionId: number) => {
      // Find the original transaction from rawTransactionsData, not the processed row
      let transactionsArray: apiService.Transaction[];
      if (Array.isArray(rawTransactionsData)) {
        transactionsArray = rawTransactionsData;
      } else if (
        rawTransactionsData &&
        "data" in rawTransactionsData &&
        Array.isArray(rawTransactionsData.data)
      ) {
        transactionsArray =
          rawTransactionsData.data as apiService.Transaction[];
      } else {
        transactionsArray = [];
      }

      const originalTransaction = transactionsArray.find(
        (t) => t.transaction_id === transactionId
      );

      if (originalTransaction) {
        setEditingTransaction(originalTransaction);
        setIsFormOpen(true);
      }
    },
    [rawTransactionsData]
  );

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
        align: "left",
        headerAlign: "left",
      },
      {
        field: "contra_entity_name",
        headerName: "Contra",
        width: 150,
        align: "left",
        headerAlign: "left",
      },
      {
        field: "instrument_entity_name",
        headerName: "Instrument",
        width: 150,
        align: "left",
        headerAlign: "left",
      },
      {
        field: "transaction_type_name",
        headerName: "Type",
        width: 120,
        align: "left",
        headerAlign: "left",
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
          const statusName = params.row.transaction_status_name;

          // O(1) lookup by name instead of O(n) Object.values().find()
          const statusInfo =
            STATUS_NAME_MAP[statusName] || STATUS_NAME_MAP["INCOMPLETE"];

          return (
            <Chip
              label={statusName}
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
        flex: 1,
        minWidth: 200,
        align: "left",
        headerAlign: "left",
        renderCell: (params: GridRenderCellParams) => (
          <Typography
            variant="body2"
            sx={{
              fontSize: "0.75rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              lineHeight: 1.2,
            }}
          >
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
    primaryClientGroup?.client_group_name || "this client group";

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
            gap: 1,
            marginLeft: "auto",
          }}
        >
          <Button
            variant="contained"
            color={positionKeeperStatus === "running" ? "error" : "primary"}
            size="small"
            onClick={handlePositionKeeperClick}
            disabled={
              startPositionKeeperMutation.isPending ||
              stopPositionKeeperMutation.isPending
            }
            startIcon={
              startPositionKeeperMutation.isPending ||
              stopPositionKeeperMutation.isPending ? (
                <CircularProgress size={16} />
              ) : positionKeeperStatus === "running" ? (
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
            {positionKeeperStatus === "running"
              ? "Stop Position Keeper"
              : "Run Position Keeper"}
          </Button>
          <Tooltip
            title={
              positionKeeperStatus === "running"
                ? "Stop the position keeper and cease processing"
                : "Start the position keeper to process transactions"
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
      <TableFilter
        filters={["Portfolio", "Contra", "Instrument", "Type", "Status"]}
        data={(() => {
          if (!rawTransactionsData) return [];
          if (Array.isArray(rawTransactionsData)) return rawTransactionsData;
          if (
            "data" in rawTransactionsData &&
            Array.isArray(rawTransactionsData.data)
          ) {
            return rawTransactionsData.data as apiService.Transaction[];
          }
          return [];
        })()}
        onFilterChange={setFilters}
        getFieldValue={getFieldValue}
      />

      {/* Data Grid */}
      <Box>
        <DataGrid
          rows={transactionsData}
          columns={columns}
          pageSizeOptions={[50, 100, 250]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 100 },
            },
          }}
          onRowClick={(params: GridRowParams) =>
            handleEdit(params.row.transaction_id as number)
          }
          sx={{
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "#f5f5f5 !important",
              borderBottom: "1px solid rgba(25, 118, 210, 0.2) !important",
            },
            "& .MuiDataGrid-columnHeader": {
              backgroundColor: "#f5f5f5 !important",
            },
            "& .MuiDataGrid-row": {
              "&:hover": {
                backgroundColor: "rgba(25, 118, 210, 0.04) !important",
              },
            },
            "& .MuiDataGrid-cell": {
              borderBottom: "1px solid rgba(224, 224, 224, 1) !important",
              padding: "8px !important",
              display: "flex !important",
              alignItems: "center !important",
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
