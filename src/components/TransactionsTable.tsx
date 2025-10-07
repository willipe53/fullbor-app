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
    queryFn: async () => {
      const result = await apiService.queryUsers({ sub: userId! });
      console.log("🔍 queryUsers result:", result);
      return result;
    },
    enabled: !!userId,
    select: (data) => {
      console.log("🔍 queryUsers select, data:", data);
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
      console.log("🔍 Selected user:", user);
      return user;
    },
  });

  console.log("🔍 currentUser:", currentUser, "userId:", userId);
  console.log(
    "🔍 currentUser?.primary_client_group_id:",
    currentUser?.primary_client_group_id
  );

  // Get primary client group for display
  const { data: primaryClientGroup } = useQuery({
    queryKey: ["primary-client-group", currentUser?.primary_client_group_id],
    queryFn: async () => {
      const result = await apiService.queryClientGroups({});
      console.log("🔍 queryClientGroups result:", result);
      return result;
    },
    enabled: !!currentUser?.primary_client_group_id,
    select: (data) => {
      console.log("🔍 queryClientGroups select, data:", data);
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
      console.log("🔍 Selected primary client group:", group);
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
  const [isPollingActive, setIsPollingActive] = useState(false);

  // Helper function to get field values for filtering
  const getFieldValue = (transaction: any, field: string): string => {
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

  // Position keeper mutation
  const queryClient = useQueryClient();
  const runPositionKeeperMutation = useMutation({
    mutationFn: apiService.startPositionKeeper,
    onSuccess: (data: any) => {
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
    ],
    queryFn: async () => {
      console.log("🔍 Fetching transactions, currentUser:", currentUser);
      if (!currentUser?.user_id) {
        throw new Error("No user ID available");
      }

      // Don't send any query parameters - backend filters by X-Current-User-Id header
      const result = await apiService.queryTransactions({});
      console.log("🔍 Transactions API result:", result);
      return result;
    },
    enabled: !!currentUser?.user_id && !!currentUser?.primary_client_group_id,
    staleTime: 30 * 1000, // 30 seconds - more responsive
    refetchOnMount: true, // Refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  console.log(
    "🔍 Query state - isLoading:",
    isLoading,
    "error:",
    error,
    "data:",
    rawTransactionsData
  );

  // Process transactions data with O(1) lookups
  const transactionsData = useMemo(() => {
    console.log("🔍 rawTransactionsData:", rawTransactionsData);
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

    console.log(
      "🔍 transactionsArray:",
      transactionsArray,
      "length:",
      transactionsArray.length
    );

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
        console.log(`Applying filter: ${field} = "${value}"`);
        const beforeCount = processedData.length;
        processedData = processedData.filter((transaction: any) => {
          const fieldValue = getFieldValue(transaction, field);
          const matches =
            fieldValue &&
            fieldValue.toLowerCase().includes(value.toLowerCase());
          if (!matches) {
            console.log(
              `Filtered out: ${fieldValue} (doesn't contain "${value}")`
            );
          }
          return matches;
        });
        console.log(
          `Filter ${field}="${value}": ${beforeCount} -> ${processedData.length} rows`
        );
      }
    });

    return processedData;
  }, [rawTransactionsData, filters]);

  // Polling logic for QUEUED transactions
  useEffect(() => {
    let intervalId: number | null = null;

    if (isPollingActive) {
      // Check for QUEUED transactions every 10 seconds
      intervalId = setInterval(() => {
        if (transactionsData && transactionsData.length > 0) {
          const queuedTransactions = transactionsData.filter(
            (transaction: any) =>
              transaction.transaction_status_name === "QUEUED"
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

          // Find status info by name instead of ID
          const statusInfo =
            Object.values(STATUS_MAP).find(
              (status) => status.name === statusName
            ) || STATUS_MAP[1]; // Default to INCOMPLETE

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
