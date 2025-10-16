import React, {
  useState,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Autocomplete,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Stepper,
  Step,
  StepLabel,
  Stack,
  Switch,
  FormControlLabel,
  Chip,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import * as apiService from "../services/api";
import {
  prettyPrint,
  formatNumberForDisplay,
  formatPriceForDisplay,
  parseNumericShortcut,
  formatDatabaseTimestamp,
} from "../utils";
import EntityForm from "./EntityForm";

interface TransactionFormProps {
  editingTransaction?: apiService.Transaction;
  onClose?: () => void;
}

interface TransactionFormRef {
  handleDismissal: () => void;
}

interface PropertySchema {
  type?: string;
  format?: string;
  description?: string;
  enum?: string[];
  "x-enum-api"?: [string, string, string];
  default?: unknown;
}

interface TransactionSchema {
  $schema?: string;
  title: string;
  description?: string;
  type: string;
  properties: Record<string, PropertySchema>;
  required: string[];
  additionalProperties: boolean;
  valid_instruments: string[];
  valid_contra_groups: string[];
}

interface FormData {
  portfolio_entity_id: string;
  instrument_entity_id: string;
  transaction_type_id: string;
  contra_entity_id: string;
  trade_date: string;
  settle_date: string;
  properties: Record<string, unknown>;
}

// Transaction status constants - removed as no longer managed via API

const TransactionForm = forwardRef<TransactionFormRef, TransactionFormProps>(
  ({ editingTransaction, onClose }, ref) => {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    // Form state
    const [formData, setFormData] = useState<FormData>({
      portfolio_entity_id: "",
      instrument_entity_id: "",
      transaction_type_id: "",
      contra_entity_id: "",
      trade_date: "",
      settle_date: "",
      properties: {},
    });

    // Step tracking
    const [currentStep, setCurrentStep] = useState(0);
    const [showSuccessSnackbar, setShowSuccessSnackbar] = useState(false);

    // Entity creation modals
    const [showPortfolioModal, setShowPortfolioModal] = useState(false);
    const [showInstrumentModal, setShowInstrumentModal] = useState(false);
    const [showcontraModal, setShowcontraModal] = useState(false);

    // Auto-save and form dismissal tracking
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Investor transaction toggle
    const [isInvestorTransaction, setIsInvestorTransaction] = useState(false);
    const [formattedFields, setFormattedFields] = useState<Set<string>>(
      new Set()
    );

    // Get current user data
    const { data: currentUser } = useQuery({
      queryKey: ["user", userId],
      queryFn: async () => {
        const response = await apiService.queryUsers({ sub: userId! });
        // Response is either User[] or { count: number }
        if (Array.isArray(response) && response.length > 0) {
          return response[0];
        }
        return undefined;
      },
      enabled: !!userId,
      staleTime: 10 * 60 * 1000, // 10 minutes - user data rarely changes
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    });

    // Get all entities for the user
    const { data: entities, isLoading: entitiesLoading } = useQuery({
      queryKey: ["entities"], // Don't key by user_id since we fetch all entities anyway
      queryFn: async () => {
        const response = await apiService.queryEntities({});
        // Response is either Entity[] or { count: number }
        return Array.isArray(response) ? response : [];
      },
      enabled: !!userId, // Only need userId to be present, not currentUser
      staleTime: 5 * 60 * 1000, // 5 minutes - entities don't change that often
      gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
      refetchOnMount: false, // Don't refetch if already cached
      refetchOnWindowFocus: false,
    });

    // Get entities by category for API-driven enums
    const { data: currencyEntities, isLoading: currencyLoading } = useQuery({
      queryKey: ["entities", "category", "Currency"],
      queryFn: () => apiService.queryEntitiesByCategory("Currency"),
      enabled: !!userId,
      staleTime: 10 * 60 * 1000, // 10 minutes - currencies rarely change
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });

    // Get other common entity categories
    const {
      data: portfolioEntitiesByCategory,
      isLoading: portfolioCategoryLoading,
    } = useQuery({
      queryKey: ["entities", "category", "Portfolio"],
      queryFn: () => apiService.queryEntitiesByCategory("Portfolio"),
      enabled: !!userId,
      staleTime: 10 * 60 * 1000, // 10 minutes - portfolios rarely change
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });

    const {
      data: instrumentEntitiesByCategory,
      isLoading: instrumentCategoryLoading,
    } = useQuery({
      queryKey: ["entities", "category", "Instrument"],
      queryFn: () => apiService.queryEntitiesByCategory("Instrument"),
      enabled: !!userId,
      staleTime: 10 * 60 * 1000, // 10 minutes - instruments rarely change
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });

    // Get entity types
    const { data: entityTypes } = useQuery({
      queryKey: ["entity-types"],
      queryFn: async () => {
        const response = await apiService.queryEntityTypes({});
        // Response is either EntityType[] or { count: number }
        return Array.isArray(response) ? response : [];
      },
      staleTime: 10 * 60 * 1000, // 10 minutes (entity types rarely change)
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });

    // Get transaction types
    const { data: transactionTypes } = useQuery({
      queryKey: ["transaction-types"],
      queryFn: async () => {
        const response = await apiService.queryTransactionTypes({});
        // Response is either TransactionType[] or { count: number }
        return Array.isArray(response) ? response : [];
      },
      staleTime: 10 * 60 * 1000, // 10 minutes
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });

    // Create entity type maps for O(1) lookups (must be before useEffect that uses them)
    const entityTypeMap = useMemo(() => {
      if (!entityTypes) return new Map();
      return new Map(
        entityTypes.map((et) => [et.entity_type_name, et.entity_type_id])
      );
    }, [entityTypes]);

    // Create entity lookup maps for O(1) access (must be before useEffect that uses them)
    const entitiesById = useMemo(() => {
      if (!entities) return new Map();
      return new Map(entities.map((e) => [e.entity_id, e]));
    }, [entities]);

    const entitiesByName = useMemo(() => {
      if (!entities) return new Map();
      return new Map(entities.map((e) => [e.entity_name, e]));
    }, [entities]);

    const transactionTypesById = useMemo(() => {
      if (!transactionTypes) return new Map();
      return new Map(
        transactionTypes.map((tt) => [tt.transaction_type_id, tt])
      );
    }, [transactionTypes]);

    const transactionTypesByName = useMemo(() => {
      if (!transactionTypes) return new Map();
      return new Map(
        transactionTypes.map((tt) => [tt.transaction_type_name, tt])
      );
    }, [transactionTypes]);

    // Initialize form data when editing an existing transaction
    React.useEffect(() => {
      if (
        editingTransaction &&
        entitiesByName.size > 0 &&
        transactionTypesByName.size > 0
      ) {
        // Debug: Check the size of the editing transaction data
        const transactionSize = JSON.stringify(editingTransaction).length;
        if (transactionSize > 10000) {
          // If larger than 10KB
          console.warn(
            `Large editing transaction detected: ${transactionSize} bytes`
          );
          console.log(
            "Editing transaction properties:",
            editingTransaction.properties
          );
        }

        // Safely parse properties - handle both string and object cases
        let parsedProperties = {};
        if (editingTransaction.properties) {
          if (typeof editingTransaction.properties === "string") {
            try {
              parsedProperties = JSON.parse(editingTransaction.properties);
            } catch (e) {
              console.warn("Failed to parse properties JSON:", e);
              parsedProperties = {};
            }
          } else if (typeof editingTransaction.properties === "object") {
            // Check if it's a corrupted object (has numeric keys)
            const keys = Object.keys(editingTransaction.properties);
            const hasNumericKeys = keys.some((key) => !isNaN(parseInt(key)));

            if (hasNumericKeys) {
              console.warn(
                "Detected corrupted properties object with numeric keys, resetting to empty"
              );
              parsedProperties = {};
            } else {
              parsedProperties = editingTransaction.properties;
            }
          }

          // Additional cleanup: Remove any remaining corrupted data
          if (parsedProperties && typeof parsedProperties === "object") {
            const cleanedProperties: Record<string, unknown> = {};
            Object.keys(parsedProperties).forEach((key) => {
              const value = (parsedProperties as Record<string, unknown>)[key];
              // Only keep properties with non-numeric keys and simple values
              if (
                isNaN(parseInt(key)) &&
                key.length > 1 &&
                (typeof value === "string" ||
                  typeof value === "number" ||
                  typeof value === "boolean")
              ) {
                cleanedProperties[key] = value;
              }
            });
            parsedProperties = cleanedProperties;
          }
        }

        // Look up entity IDs from names (API returns names, not IDs)
        // Use maps for O(1) lookup instead of .find()
        const portfolioId =
          entitiesByName
            .get(editingTransaction.portfolio_entity_name)
            ?.entity_id.toString() || "";
        const instrumentEntity = editingTransaction.instrument_entity_name
          ? entitiesByName.get(editingTransaction.instrument_entity_name)
          : undefined;

        if (editingTransaction.instrument_entity_name && !instrumentEntity) {
          console.warn("Instrument lookup failed:", {
            lookingFor: editingTransaction.instrument_entity_name,
            entitiesByNameSize: entitiesByName.size,
            allEntityNames: Array.from(entitiesByName.keys()).slice(0, 20),
            matchingEntities: Array.from(entitiesByName.keys()).filter((name) =>
              name
                .toLowerCase()
                .includes(
                  editingTransaction.instrument_entity_name!.toLowerCase()
                )
            ),
          });
        }

        const instrumentId = instrumentEntity?.entity_id.toString() || "";
        const contraId = editingTransaction.contra_entity_name
          ? entitiesByName
              .get(editingTransaction.contra_entity_name)
              ?.entity_id.toString() || ""
          : "";
        const transactionTypeId =
          transactionTypesByName
            .get(editingTransaction.transaction_type_name)
            ?.transaction_type_id.toString() || "";

        const tradeDate = editingTransaction.trade_date
          ? editingTransaction.trade_date.split("T")[0]
          : "";
        const settleDate = editingTransaction.settle_date
          ? editingTransaction.settle_date.split("T")[0]
          : "";

        console.log("Loading transaction into form:", {
          transactionId: editingTransaction.transaction_id,
          portfolio_name: editingTransaction.portfolio_entity_name,
          portfolioId,
          instrument_name: editingTransaction.instrument_entity_name,
          instrumentId,
          transaction_type_name: editingTransaction.transaction_type_name,
          transactionTypeId,
          contra_name: editingTransaction.contra_entity_name,
          contraId,
        });

        setFormData({
          portfolio_entity_id: portfolioId,
          instrument_entity_id: instrumentId,
          transaction_type_id: transactionTypeId,
          contra_entity_id: contraId,
          trade_date: tradeDate,
          settle_date: settleDate,
          properties: parsedProperties,
        });
        // Don't mark as having unsaved changes when initially loading
        // Only mark as changed when user actually modifies something
        setHasUnsavedChanges(false);
      }
    }, [editingTransaction, entitiesByName, transactionTypesByName]);

    // Calculate current step when editing an existing transaction
    React.useEffect(() => {
      if (editingTransaction) {
        // Determine the appropriate step based on what's already filled
        const hasPortfolio = !!formData.portfolio_entity_id;
        const hasInstrument =
          !!formData.instrument_entity_id || isInvestorTransaction;
        const hasTransactionType = !!formData.transaction_type_id;
        const hasContra = !!formData.contra_entity_id;

        if (!hasPortfolio) {
          setCurrentStep(1); // Portfolio selection
        } else if (!hasInstrument && !isInvestorTransaction) {
          setCurrentStep(2); // Instrument selection
        } else if (!hasTransactionType) {
          setCurrentStep(isInvestorTransaction ? 2 : 3); // Transaction type selection
        } else {
          // Check if contra is required
          const selectedType = transactionTypes?.find(
            (t) =>
              t.transaction_type_id === parseInt(formData.transaction_type_id)
          );

          let isContraRequired = false;
          if (selectedType?.properties) {
            try {
              const schema =
                typeof selectedType.properties === "string"
                  ? JSON.parse(selectedType.properties)
                  : selectedType.properties;
              const validContraGroups = schema.valid_contra_groups || [];
              isContraRequired = validContraGroups.length > 0;
            } catch (error) {
              console.error("Error parsing transaction schema:", error);
            }
          }

          if (isContraRequired && !hasContra) {
            setCurrentStep(isInvestorTransaction ? 3 : 4); // Contra selection
          } else {
            setCurrentStep(isInvestorTransaction ? 4 : 5); // Properties (final step)
          }
        }
      }
    }, [editingTransaction, formData, transactionTypes, isInvestorTransaction]);

    // Filter entities by type
    const portfolioEntities = useMemo(() => {
      if (!entities || !entityTypeMap.has("Portfolio")) {
        console.log(
          "🔍 portfolioEntities - no entities or Portfolio type not in map"
        );
        console.log("🔍 entityTypeMap:", entityTypeMap);
        return [];
      }
      // Filter by entity_type_name instead of entity_type_id since the API returns names
      const filtered = entities.filter(
        (entity) => entity.entity_type_name === "Portfolio"
      );
      return filtered;
    }, [entities, entityTypeMap]);

    // Get selected portfolio entity using O(1) lookup
    const selectedPortfolio = useMemo(() => {
      if (!formData.portfolio_entity_id) {
        return null;
      }
      const portfolioId = parseInt(formData.portfolio_entity_id);
      return entitiesById.get(portfolioId) || null;
    }, [formData.portfolio_entity_id, entitiesById]);

    const instrumentEntities = useMemo(() => {
      if (!entities || !entityTypes) return [];

      // Get instrument type names from entityTypes with category "Instrument"
      const instrumentTypeNames = new Set(
        entityTypes
          .filter((et) => et.entity_category === "Instrument")
          .map((et) => et.entity_type_name)
      );

      // Filter entities by entity_type_name since API returns names, not IDs
      return entities.filter((entity) =>
        instrumentTypeNames.has(entity.entity_type_name)
      );
    }, [entities, entityTypes]);

    // Get selected instrument entity using O(1) lookup
    const selectedInstrument = useMemo(() => {
      if (!formData.instrument_entity_id) return null;
      const instrumentId = parseInt(formData.instrument_entity_id);
      return entitiesById.get(instrumentId) || null;
    }, [formData.instrument_entity_id, entitiesById]);

    // Get selected transaction type using O(1) lookup
    const selectedTransactionType = useMemo(() => {
      if (!formData.transaction_type_id) return null;
      const typeId = parseInt(formData.transaction_type_id);
      return transactionTypesById.get(typeId) || null;
    }, [formData.transaction_type_id, transactionTypesById]);

    // Parse transaction type schema
    const transactionSchema = useMemo((): TransactionSchema | null => {
      if (!selectedTransactionType?.properties) return null;

      try {
        const schema =
          typeof selectedTransactionType.properties === "string"
            ? JSON.parse(selectedTransactionType.properties)
            : selectedTransactionType.properties;
        return schema;
      } catch (error) {
        console.error("Error parsing transaction schema:", error);
        return null;
      }
    }, [selectedTransactionType]);

    // Auto-format number fields when editing existing transaction
    React.useEffect(() => {
      if (editingTransaction && transactionSchema && formData.properties) {
        const numberFields = Object.keys(formData.properties).filter(
          (propertyName) => {
            try {
              const schema = transactionSchema.properties?.[propertyName];
              return schema?.type === "number";
            } catch {
              return false;
            }
          }
        );

        if (numberFields.length > 0) {
          setFormattedFields(new Set(numberFields));
        }
      }
    }, [editingTransaction, transactionSchema, formData.properties]);

    // Filter transaction types based on selected instrument or investor transaction
    const validTransactionTypes = useMemo(() => {
      if (!transactionTypes) return [];

      // For investor transactions, only allow Contribution (42) and Withdrawal (60)
      if (isInvestorTransaction) {
        return transactionTypes.filter(
          (tt) => tt.transaction_type_id === 42 || tt.transaction_type_id === 60
        );
      }

      // For regular transactions, filter based on selected instrument
      if (!selectedInstrument || !entityTypes) return [];

      const instrumentType = entityTypes.find(
        (et) => et.entity_type_name === selectedInstrument.entity_type_name
      );
      if (!instrumentType?.short_label) return [];

      return transactionTypes.filter((tt) => {
        try {
          const schema =
            typeof tt.properties === "string"
              ? JSON.parse(tt.properties)
              : tt.properties;
          return schema.valid_instruments?.includes(instrumentType.short_label);
        } catch {
          return false;
        }
      });
    }, [
      transactionTypes,
      selectedInstrument,
      entityTypes,
      isInvestorTransaction,
    ]);

    // Filter counterparties based on selected instrument or transaction schema
    const validCounterparties = useMemo(() => {
      if (!entities || !entityTypes || !transactionSchema) return [];

      // For investor transactions, filter based on valid_contra_groups directly
      if (isInvestorTransaction) {
        const validContraGroups = transactionSchema.valid_contra_groups || [];

        // Find entity types that match the valid contra groups
        const validEntityTypes = entityTypes.filter((et) =>
          validContraGroups.includes(et.short_label || "")
        );

        const validEntityTypeNames = new Set(
          validEntityTypes.map((et) => et.entity_type_name)
        );

        return entities.filter((entity) =>
          validEntityTypeNames.has(entity.entity_type_name)
        );
      }

      // For regular transactions, filter based on selected instrument
      if (!selectedInstrument) return [];

      const instrumentType = entityTypes.find(
        (et) => et.entity_type_name === selectedInstrument.entity_type_name
      );
      if (!instrumentType?.short_label) return [];

      // Get valid contra group short labels from transaction schema
      const validContraGroups = transactionSchema.valid_contra_groups || [];

      // Find entity types that match the valid contra groups
      const validEntityTypes = entityTypes.filter((et) =>
        validContraGroups.includes(et.short_label || "")
      );
      const validEntityTypeNames = new Set(
        validEntityTypes.map((et) => et.entity_type_name)
      );

      return entities.filter((entity) =>
        validEntityTypeNames.has(entity.entity_type_name)
      );
    }, [
      entities,
      selectedInstrument,
      entityTypes,
      transactionSchema,
      isInvestorTransaction,
    ]);

    // Create/Update transaction mutation
    const mutation = useMutation({
      mutationFn: async (data: apiService.CreateTransactionRequest) => {
        if (editingTransaction) {
          // updateTransaction expects (transactionId, data)
          return apiService.updateTransaction(
            editingTransaction.transaction_id,
            data
          );
        } else {
          // createTransaction returns void, but we need to return a Transaction for consistency
          await apiService.createTransaction(data);
          // Return a mock transaction object to satisfy TypeScript
          return {
            transaction_id: 0,
            portfolio_entity_name: data.portfolio_entity_name,
            contra_entity_name: data.contra_entity_name,
            instrument_entity_name: data.instrument_entity_name,
            transaction_status_name: data.transaction_status_name,
            transaction_type_name: data.transaction_type_name,
            trade_date: data.trade_date,
            settle_date: data.settle_date,
            properties: data.properties,
          } as apiService.Transaction;
        }
      },
      onSuccess: async () => {
        setShowSuccessSnackbar(true);
        // Wait for queries to refetch before closing
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        await queryClient.refetchQueries({ queryKey: ["transactions"] });
        if (onClose) {
          setTimeout(() => onClose(), 1000);
        }
      },
    });

    // Delete transaction mutation
    const deleteMutation = useMutation({
      mutationFn: (transactionId: number) => {
        return apiService.deleteTransaction(transactionId);
      },
      onMutate: async (transactionId: number) => {
        // Cancel any outgoing refetches so they don't overwrite our optimistic update
        await queryClient.cancelQueries({ queryKey: ["transactions"] });

        // Snapshot the previous value
        const previousTransactions = queryClient.getQueriesData({
          queryKey: ["transactions"],
        });

        // Optimistically update the cache by removing the deleted transaction
        queryClient.setQueriesData(
          { queryKey: ["transactions"] },
          (old: unknown) => {
            if (!old) return old;
            if (!Array.isArray(old)) return old;
            return old.filter(
              (transaction: apiService.Transaction) =>
                transaction.transaction_id !== transactionId
            );
          }
        );

        // Return a context object with the snapshotted value
        return { previousTransactions };
      },
      onError: (err, _transactionId, context) => {
        // If the mutation fails, use the context returned from onMutate to roll back
        if (context?.previousTransactions) {
          context.previousTransactions.forEach(([queryKey, data]) => {
            queryClient.setQueryData(queryKey, data);
          });
        }
        console.error("Transaction deletion failed:", err);
      },
      onSuccess: () => {
        // Invalidate to ensure we have the latest data
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        if (onClose) {
          onClose();
        }
      },
    });

    // Handle form submission (Create Transaction button - saves as NEW)
    const handleSubmit = () => {
      // Find the entity names from the IDs using O(1) map lookups
      const portfolioEntity = entitiesById.get(
        parseInt(formData.portfolio_entity_id)
      );
      const contraEntity = formData.contra_entity_id
        ? entitiesById.get(parseInt(formData.contra_entity_id))
        : null;
      const instrumentEntity = formData.instrument_entity_id
        ? entitiesById.get(parseInt(formData.instrument_entity_id))
        : null;
      const transactionType = transactionTypesById.get(
        parseInt(formData.transaction_type_id)
      );

      if (!portfolioEntity || !transactionType) {
        console.error("Missing required entity or transaction type");
        return;
      }

      // Determine the transaction status:
      // - If updating a PROCESSED transaction, set status to AMENDED
      // - Otherwise, set status to NEW
      const statusName = isProcessedTransaction ? "AMENDED" : "NEW";

      const submitData: apiService.CreateTransactionRequest = {
        portfolio_entity_name: portfolioEntity.entity_name,
        contra_entity_name: contraEntity?.entity_name,
        instrument_entity_name: instrumentEntity?.entity_name,
        transaction_status_name: statusName,
        transaction_type_name: transactionType.transaction_type_name,
        trade_date: formData.trade_date,
        settle_date: formData.settle_date,
        properties: formData.properties as apiService.JSONValue,
      };

      mutation.mutate(submitData);
    };

    // Handle cancel (discard changes)
    const handleCancel = () => {
      if (onClose) {
        onClose();
      }
    };

    // Check if transaction is INCOMPLETE (can be deleted)
    const isIncompleteTransaction = useMemo(() => {
      return editingTransaction?.transaction_status_name === "INCOMPLETE";
    }, [editingTransaction?.transaction_status_name]);

    // Check if transaction is read-only (NEW or AMENDED - awaiting processing)
    const isReadOnlyTransaction = useMemo(() => {
      const status = editingTransaction?.transaction_status_name;
      return status === "NEW" || status === "AMENDED";
    }, [editingTransaction?.transaction_status_name]);

    // Check if transaction is PROCESSED (can be amended)
    const isProcessedTransaction = useMemo(() => {
      return editingTransaction?.transaction_status_name === "PROCESSED";
    }, [editingTransaction?.transaction_status_name]);

    // Handle delete transaction
    const handleDelete = () => {
      if (editingTransaction?.transaction_id) {
        deleteMutation.mutate(editingTransaction.transaction_id);
      }
    };

    // Handle input changes
    const handleInputChange = (field: keyof FormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));

      // Mark that there are unsaved changes
      setHasUnsavedChanges(true);

      // Reset subsequent steps when earlier selections change
      if (field === "portfolio_entity_id") {
        setFormData((prev) => ({
          ...prev,
          instrument_entity_id: "",
          transaction_type_id: "",
          contra_entity_id: "",
          properties: {},
        }));
        setCurrentStep(1);
        setShowContraSelection(false); // Reset contra selection state
      } else if (field === "instrument_entity_id") {
        setFormData((prev) => ({
          ...prev,
          transaction_type_id: "",
          contra_entity_id: "",
          properties: {},
        }));
        setCurrentStep(isInvestorTransaction ? 2 : 2);
      } else if (field === "transaction_type_id") {
        setFormData((prev) => {
          const newData = {
            ...prev,
            contra_entity_id: "",
            properties: {},
          };

          // Find the selected transaction type to get its schema
          const selectedType = transactionTypes?.find(
            (t) => t.transaction_type_id === parseInt(value)
          );
          let shouldAutoSetContra = false;
          let isContraRequired = false;

          if (selectedType?.properties) {
            try {
              const schema =
                typeof selectedType.properties === "string"
                  ? JSON.parse(selectedType.properties)
                  : selectedType.properties;

              const validContraGroups = schema.valid_contra_groups || [];
              shouldAutoSetContra = validContraGroups.includes("P");
              isContraRequired = validContraGroups.length > 0;

              // Initialize properties with default values
              const defaultProperties: Record<string, unknown> = {};
              if (schema.properties) {
                (
                  Object.entries(schema.properties) as [
                    string,
                    PropertySchema
                  ][]
                ).forEach(([propName, propSchema]) => {
                  if (propSchema.default !== undefined) {
                    defaultProperties[propName] = propSchema.default;
                  }
                });
              }
              newData.properties = defaultProperties;
            } catch (error) {
              console.error("Error parsing transaction schema:", error);
            }
          }

          // Auto-set contra to portfolio if required
          if (shouldAutoSetContra && prev.portfolio_entity_id) {
            newData.contra_entity_id = prev.portfolio_entity_id;
          }

          // Determine next step based on contra requirements
          setTimeout(() => {
            const stepOffset = isInvestorTransaction ? -1 : 0; // Adjust steps for investor transactions
            if (shouldAutoSetContra && prev.portfolio_entity_id) {
              // Contra is auto-set, skip to properties step
              setCurrentStep(4 + stepOffset);
            } else if (isContraRequired) {
              // Contra is required but not auto-set, go to contra step
              setCurrentStep(3 + stepOffset);
            } else {
              // Contra is not required, go to properties step
              setCurrentStep(4 + stepOffset);
            }
          }, 0);

          return newData;
        });
        setShowContraSelection(false); // Reset contra selection state
      } else if (field === "contra_entity_id") {
        setCurrentStep(4);
      }
    };

    // Handle property changes
    const handlePropertyChange = (propertyName: string, value: unknown) => {
      // Debug: Log property changes for amount field
      if (propertyName === "amount") {
        console.log(
          `🔢 Amount field change: ${propertyName} = ${value} (type: ${typeof value})`
        );
      }

      setFormData((prev) => ({
        ...prev,
        properties: {
          ...prev.properties,
          [propertyName]: value,
        },
      }));
      // Mark that there are unsaved changes
      setHasUnsavedChanges(true);
    };

    // Note: Entity creation modals now handle their own logic
    // and refresh the entities query on close

    // Check if contra step is required
    const isContraRequired = useMemo(() => {
      if (!transactionSchema) return true;
      const validContraGroups = transactionSchema.valid_contra_groups || [];
      return validContraGroups.length > 0;
    }, [transactionSchema]);

    // Check if contra should be auto-set to portfolio
    const isContraAutoSetToPortfolio = useMemo(() => {
      if (!transactionSchema) return false;
      const validContraGroups = transactionSchema.valid_contra_groups || [];
      return validContraGroups.includes("P");
    }, [transactionSchema]);

    // State to control whether user wants to change contra from auto-set portfolio
    const [showContraSelection, setShowContraSelection] = useState(false);

    // Auto-advance to properties step if contra is auto-set and we're on contra step
    React.useEffect(() => {
      if (
        currentStep === 3 &&
        isContraAutoSetToPortfolio &&
        formData.contra_entity_id &&
        formData.transaction_type_id
      ) {
        setCurrentStep(4);
      }
    }, [
      currentStep,
      isContraAutoSetToPortfolio,
      formData.contra_entity_id,
      formData.transaction_type_id,
    ]);

    // Check if form can be submitted
    const canSubmit = useMemo(() => {
      const hasPortfolio = !!formData.portfolio_entity_id;
      const hasInstrument =
        isInvestorTransaction || !!formData.instrument_entity_id;
      const hasTransactionType = !!formData.transaction_type_id;
      const hasTradeDate = !!formData.trade_date;
      const hasSettleDate = !!formData.settle_date;
      const hasSchema = !!transactionSchema;
      const requiredPropsValid =
        !transactionSchema?.required ||
        transactionSchema.required.length === 0 ||
        transactionSchema.required.every(
          (req) => formData.properties[req] !== undefined
        );

      const baseRequirements =
        hasPortfolio &&
        hasInstrument &&
        hasTransactionType &&
        hasTradeDate &&
        hasSettleDate &&
        hasSchema &&
        requiredPropsValid;

      // Only require contra_entity_id if contra step is required
      const hasContra = !!formData.contra_entity_id;
      const contraRequirement = isContraRequired ? hasContra : true;

      const formIsValid = baseRequirements && contraRequirement;

      console.log("Form validation breakdown:", {
        hasPortfolio,
        hasInstrument,
        hasTransactionType,
        hasTradeDate,
        hasSettleDate,
        hasSchema,
        requiredPropsValid,
        isContraRequired,
        hasContra,
        contraRequirement,
        baseRequirements,
        formIsValid,
      });

      // For editing transactions:
      // - INCOMPLETE transactions can be submitted without changes (to change status to NEW)
      // - Other transactions require unsaved changes
      // For new transactions, only require form validity
      if (editingTransaction) {
        const result =
          formIsValid && (isIncompleteTransaction || hasUnsavedChanges);
        console.log("canSubmit check (editing):", {
          formIsValid,
          hasUnsavedChanges,
          isIncompleteTransaction,
          result,
          transactionId: editingTransaction.transaction_id,
          status: editingTransaction.transaction_status_name,
        });
        return result;
      }

      console.log("canSubmit check (new):", {
        formIsValid,
      });
      return formIsValid;
    }, [
      formData,
      transactionSchema,
      isContraRequired,
      isInvestorTransaction,
      editingTransaction,
      hasUnsavedChanges,
      isIncompleteTransaction,
    ]);

    // Handle form dismissal (clicking outside the form)
    const handleFormDismissal = useCallback(() => {
      // Check if we have the minimum required fields for saving as INCOMPLETE
      const hasMinimumFields =
        formData.portfolio_entity_id &&
        (isInvestorTransaction || formData.instrument_entity_id) &&
        formData.transaction_type_id;

      if (hasMinimumFields && hasUnsavedChanges) {
        // Find the entity names from the IDs using O(1) map lookups
        const portfolioEntity = entitiesById.get(
          parseInt(formData.portfolio_entity_id)
        );
        const contraEntity = formData.contra_entity_id
          ? entitiesById.get(parseInt(formData.contra_entity_id))
          : null;
        const instrumentEntity = formData.instrument_entity_id
          ? entitiesById.get(parseInt(formData.instrument_entity_id))
          : null;
        const transactionType = transactionTypesById.get(
          parseInt(formData.transaction_type_id)
        );

        if (!portfolioEntity || !transactionType) {
          console.error("Missing required entity or transaction type");
          if (onClose) {
            onClose();
          }
          return;
        }

        if (editingTransaction) {
          // Update existing transaction using name-based API
          const updateData: apiService.CreateTransactionRequest = {
            portfolio_entity_name: portfolioEntity.entity_name,
            contra_entity_name: contraEntity?.entity_name,
            instrument_entity_name: instrumentEntity?.entity_name,
            transaction_status_name: "INCOMPLETE",
            transaction_type_name: transactionType.transaction_type_name,
            trade_date:
              formData.trade_date || new Date().toISOString().split("T")[0],
            settle_date:
              formData.settle_date || new Date().toISOString().split("T")[0],
            properties: formData.properties as apiService.JSONValue,
          };

          // Debug: Check the size of the request data
          const requestSize = JSON.stringify(updateData).length;
          console.log("🔍 Update request properties:", formData.properties);
          console.log("🔍 Property keys:", Object.keys(formData.properties));
          console.log(
            "🔍 Property values sample:",
            Object.values(formData.properties).slice(0, 5)
          );

          // Check for corrupted properties (numeric keys indicate corruption)
          const propertyKeys = Object.keys(formData.properties);
          const hasNumericKeys = propertyKeys.some(
            (key) => !isNaN(parseInt(key))
          );

          console.log("🔍 Has numeric keys:", hasNumericKeys);
          console.log("🔍 Request size:", requestSize);

          if (hasNumericKeys) {
            console.error(
              "🚨 CORRUPTED PROPERTIES DETECTED! Resetting to empty object."
            );
            // Preserve any valid user input (like amount) that might have been entered
            const validProperties: Record<string, unknown> = {};
            Object.keys(formData.properties).forEach((key) => {
              const value = formData.properties[key];
              // Keep only simple values that aren't part of the corrupted string
              if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
              ) {
                // Check if this looks like a real property name (not a numeric index)
                if (isNaN(parseInt(key)) && key.length > 1) {
                  validProperties[key] = value;
                }
              }
            });
            updateData.properties = validProperties as apiService.JSONValue;
            console.log("🔧 Preserved valid properties:", validProperties);
          } else if (requestSize > 10000) {
            // If larger than 10KB
            console.warn(`Large request detected: ${requestSize} bytes`);
            console.log("Properties object:", formData.properties);

            // Clean up properties to prevent 413 error
            const cleanedProperties = Object.keys(formData.properties).reduce(
              (acc, key) => {
                const value = formData.properties[key];
                // Only keep simple values (strings, numbers, booleans, null, undefined)
                if (
                  typeof value === "string" ||
                  typeof value === "number" ||
                  typeof value === "boolean" ||
                  value === null ||
                  value === undefined
                ) {
                  acc[key] = value;
                } else {
                  console.warn(`Removing complex property: ${key}`, value);
                }
                return acc;
              },
              {} as Record<string, unknown>
            );

            updateData.properties = cleanedProperties as apiService.JSONValue;
            console.log("Cleaned properties:", cleanedProperties);
          }

          apiService
            .updateTransaction(editingTransaction.transaction_id, updateData)
            .then(async () => {
              // Wait for queries to refetch before closing
              await queryClient.invalidateQueries({
                queryKey: ["transactions"],
              });
              await queryClient.refetchQueries({ queryKey: ["transactions"] });
              // Close the form after successful save
              if (onClose) {
                onClose();
              }
            })
            .catch((error) => {
              console.error(
                "Failed to update transaction on dismissal:",
                error
              );
            });
        } else {
          // Create new transaction using name-based API
          const submitData: apiService.CreateTransactionRequest = {
            portfolio_entity_name: portfolioEntity.entity_name,
            contra_entity_name: contraEntity?.entity_name,
            instrument_entity_name: instrumentEntity?.entity_name,
            transaction_status_name: "INCOMPLETE",
            transaction_type_name: transactionType.transaction_type_name,
            trade_date:
              formData.trade_date || new Date().toISOString().split("T")[0],
            settle_date:
              formData.settle_date || new Date().toISOString().split("T")[0],
            properties: formData.properties as apiService.JSONValue,
          };

          // Debug: Check the size of the request data
          const requestSize = JSON.stringify(submitData).length;
          console.log("🔍 Create request properties:", formData.properties);

          // Check for corrupted properties (numeric keys indicate corruption)
          const propertyKeys = Object.keys(formData.properties);
          const hasNumericKeys = propertyKeys.some(
            (key) => !isNaN(parseInt(key))
          );

          if (hasNumericKeys) {
            console.error(
              "🚨 CORRUPTED PROPERTIES DETECTED! Resetting to empty object."
            );
            // Preserve any valid user input (like amount) that might have been entered
            const validProperties: Record<string, unknown> = {};
            Object.keys(formData.properties).forEach((key) => {
              const value = formData.properties[key];
              // Keep only simple values that aren't part of the corrupted string
              if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
              ) {
                // Check if this looks like a real property name (not a numeric index)
                if (isNaN(parseInt(key)) && key.length > 1) {
                  validProperties[key] = value;
                }
              }
            });
            submitData.properties = validProperties as apiService.JSONValue;
            console.log("🔧 Preserved valid properties:", validProperties);
          } else if (requestSize > 10000) {
            // If larger than 10KB
            console.warn(`Large request detected: ${requestSize} bytes`);
            console.log("Properties object:", formData.properties);

            // Clean up properties to prevent 413 error
            const cleanedProperties = Object.keys(formData.properties).reduce(
              (acc, key) => {
                const value = formData.properties[key];
                // Only keep simple values (strings, numbers, booleans, null, undefined)
                if (
                  typeof value === "string" ||
                  typeof value === "number" ||
                  typeof value === "boolean" ||
                  value === null ||
                  value === undefined
                ) {
                  acc[key] = value;
                } else {
                  console.warn(`Removing complex property: ${key}`, value);
                }
                return acc;
              },
              {} as Record<string, unknown>
            );

            submitData.properties = cleanedProperties as apiService.JSONValue;
            console.log("Cleaned properties:", cleanedProperties);
          }

          apiService
            .createTransaction(submitData)
            .then(async () => {
              // Wait for queries to refetch before closing
              await queryClient.invalidateQueries({
                queryKey: ["transactions"],
              });
              await queryClient.refetchQueries({ queryKey: ["transactions"] });
              // Close the form after successful save
              if (onClose) {
                onClose();
              }
            })
            .catch((error) => {
              console.error(
                "Failed to auto-save transaction on dismissal:",
                error
              );
            });
        }

        setHasUnsavedChanges(false);
      } else {
        // If no minimum fields or no changes, just close the form
        if (onClose) {
          onClose();
        }
      }
    }, [
      formData,
      hasUnsavedChanges,
      queryClient,
      onClose,
      editingTransaction,
      isInvestorTransaction,
      entitiesById,
      transactionTypesById,
    ]);

    // Expose dismissal handler to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        handleDismissal: handleFormDismissal,
      }),
      [handleFormDismissal]
    );

    // Render property field based on schema
    const renderPropertyField = (
      propertyName: string,
      propertySchema: PropertySchema
    ) => {
      const rawValue = formData.properties[propertyName];
      const value = typeof rawValue === "string" ? rawValue : "";
      const isRequired = transactionSchema?.required?.includes(propertyName);
      const displayLabel = prettyPrint(propertyName);
      const description = propertySchema.description;

      if (
        propertySchema.type === "string" &&
        propertySchema.format === "date"
      ) {
        // Helper functions for date buttons
        const handleTodayClick = () => {
          const today = new Date();
          const todayString = today.toISOString().split("T")[0];
          handlePropertyChange(propertyName, todayString);
        };

        const handleTPlus3Click = () => {
          const today = new Date();
          const tPlus3 = new Date(today);
          tPlus3.setDate(today.getDate() + 3);
          const tPlus3String = tPlus3.toISOString().split("T")[0];
          handlePropertyChange(propertyName, tPlus3String);
        };

        const handleTPlus10Click = () => {
          const today = new Date();
          const tPlus10 = new Date(today);
          tPlus10.setDate(today.getDate() + 10);
          const tPlus10String = tPlus10.toISOString().split("T")[0];
          handlePropertyChange(propertyName, tPlus10String);
        };

        return (
          <Box key={propertyName}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <DatePicker
                label={`${displayLabel}${isRequired ? " *" : ""}`}
                value={value ? new Date(value) : null}
                onChange={(date) => {
                  if (date && !isNaN(date.getTime())) {
                    handlePropertyChange(
                      propertyName,
                      date.toISOString().split("T")[0]
                    );
                  } else if (date === null) {
                    handlePropertyChange(propertyName, "");
                  }
                }}
                disabled={isReadOnlyTransaction}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: isRequired,
                    helperText: description,
                  },
                }}
                sx={{ flexGrow: 1 }}
              />
              {/* Helper buttons for common date operations */}
              {propertyName === "trade_date" && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleTodayClick}
                  disabled={isReadOnlyTransaction}
                  sx={{ minWidth: "auto", px: 2, mt: 1 }}
                >
                  Today
                </Button>
              )}
              {propertyName === "settle_date" && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleTPlus3Click}
                  disabled={isReadOnlyTransaction}
                  sx={{ minWidth: "auto", px: 2, mt: 1 }}
                >
                  T+3
                </Button>
              )}
              {propertyName === "record_date" && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleTodayClick}
                  disabled={isReadOnlyTransaction}
                  sx={{ minWidth: "auto", px: 2, mt: 1 }}
                >
                  Today
                </Button>
              )}
              {propertyName === "post_date" && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleTPlus10Click}
                  disabled={isReadOnlyTransaction}
                  sx={{ minWidth: "auto", px: 2, mt: 1 }}
                >
                  T+10
                </Button>
              )}
            </Stack>
          </Box>
        );
      }

      // Handle API-driven enum fields (x-enum-api extension)
      // Example: "currency_code": { "x-enum-api": ["get_entities", "entity_category", "Currency"], "type": "string" }
      // This will automatically populate the autocomplete with entities from the specified category
      if (propertySchema["x-enum-api"]) {
        const apiConfig = propertySchema["x-enum-api"];
        const [apiEndpoint, paramKey, paramValue] = apiConfig;

        if (apiEndpoint === "get_entities" && paramKey === "entity_category") {
          // Lookup entities and loading state by category
          const categoryLookup: Record<
            string,
            { entities: apiService.Entity[] | undefined; loading: boolean }
          > = {
            Currency: { entities: currencyEntities, loading: currencyLoading },
            Portfolio: {
              entities: portfolioEntitiesByCategory,
              loading: portfolioCategoryLoading,
            },
            Instrument: {
              entities: instrumentEntitiesByCategory,
              loading: instrumentCategoryLoading,
            },
          };

          const categoryData = categoryLookup[paramValue];

          if (categoryData) {
            return (
              <Autocomplete
                key={propertyName}
                options={categoryData.entities || []}
                getOptionLabel={(option) => option.entity_name}
                value={
                  categoryData.entities?.find(
                    (entity) => entity.entity_name === value
                  ) || null
                }
                onChange={(_, newValue) =>
                  handlePropertyChange(
                    propertyName,
                    newValue?.entity_name || ""
                  )
                }
                loading={categoryData.loading}
                disabled={isReadOnlyTransaction}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={`${displayLabel}${isRequired ? " *" : ""}`}
                    required={isRequired}
                    fullWidth
                    helperText={description}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {categoryData.loading ? (
                            <CircularProgress color="inherit" size={20} />
                          ) : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            );
          } else {
            // Fallback for unsupported categories
            return (
              <TextField
                key={propertyName}
                label={`${displayLabel}${isRequired ? " *" : ""}`}
                value={value || ""}
                onChange={(e) =>
                  handlePropertyChange(propertyName, e.target.value)
                }
                required={isRequired}
                fullWidth
                disabled={isReadOnlyTransaction}
                helperText={
                  description ||
                  `Category "${paramValue}" not yet supported for API-driven enums`
                }
              />
            );
          }
        }
      }

      // Handle static enum fields
      if (propertySchema.enum) {
        return (
          <Autocomplete
            key={propertyName}
            options={propertySchema.enum}
            value={value || ""}
            onChange={(_, newValue) =>
              handlePropertyChange(propertyName, newValue || "")
            }
            disabled={isReadOnlyTransaction}
            renderInput={(params) => (
              <TextField
                {...params}
                label={`${displayLabel}${isRequired ? " *" : ""}`}
                required={isRequired}
                fullWidth
                helperText={description}
              />
            )}
          />
        );
      }

      // Handle number fields with comma formatting and numeric shortcuts
      if (propertySchema.type === "number") {
        const rawValue = formData.properties[propertyName];
        const isFormatted = formattedFields.has(propertyName);
        const isPriceField = propertyName.toLowerCase().includes("price");

        // For display, use the raw string value if not formatted, otherwise format it
        let displayValue = "";
        if (
          isFormatted &&
          rawValue !== undefined &&
          rawValue !== null &&
          rawValue !== ""
        ) {
          // Type guard: ensure rawValue is string or number
          const numValue =
            typeof rawValue === "string" || typeof rawValue === "number"
              ? rawValue
              : 0;
          displayValue = isPriceField
            ? formatPriceForDisplay(numValue)
            : formatNumberForDisplay(numValue);
        } else if (
          rawValue !== undefined &&
          rawValue !== null &&
          rawValue !== ""
        ) {
          displayValue = String(rawValue);
        }

        return (
          <TextField
            key={propertyName}
            label={`${displayLabel}${isRequired ? " *" : ""}`}
            value={displayValue}
            onChange={(e) => {
              // Store the raw string value during typing to preserve decimals and shortcuts
              handlePropertyChange(propertyName, e.target.value);
              // Remove from formatted fields when user is typing
              setFormattedFields((prev) => {
                const newSet = new Set(prev);
                newSet.delete(propertyName);
                return newSet;
              });
            }}
            onKeyDown={(e) => {
              // Immediately resolve shortcuts when k, m, or b is pressed
              if (
                e.key === "k" ||
                e.key === "K" ||
                e.key === "m" ||
                e.key === "M" ||
                e.key === "b" ||
                e.key === "B"
              ) {
                e.preventDefault(); // Prevent the letter from being added to the input

                // Get current value and append the shortcut key
                const currentValue = (e.target as HTMLInputElement).value;
                const valueWithShortcut = currentValue + e.key.toLowerCase();

                // Parse the numeric shortcut
                const numericValue = parseNumericShortcut(valueWithShortcut);

                // Update with the parsed numeric value
                handlePropertyChange(propertyName, numericValue);

                // Mark this field as formatted to show commas
                setFormattedFields((prev) => {
                  const newSet = new Set(prev).add(propertyName);
                  return newSet;
                });
              }
            }}
            onBlur={(e) => {
              // Parse numeric shortcuts (k, m, b) and convert to number
              const numericValue = parseNumericShortcut(e.target.value);
              handlePropertyChange(propertyName, numericValue);
              // Mark this field as formatted to show commas
              setFormattedFields((prev) => {
                const newSet = new Set(prev).add(propertyName);
                return newSet;
              });
            }}
            required={isRequired}
            fullWidth
            disabled={isReadOnlyTransaction}
            type="text" // Use text type to allow commas
            helperText={
              description ||
              (isPriceField
                ? "Enter exact price (e.g., 123.456) or use shortcuts (1k, 78m, 6.67b)"
                : "Use shortcuts: 1k=1000, 78m=78M, 6.67b=6.67B")
            }
            inputProps={{
              inputMode: "decimal", // Use decimal instead of numeric to allow decimal points
            }}
          />
        );
      }

      return (
        <TextField
          key={propertyName}
          label={`${displayLabel}${isRequired ? " *" : ""}`}
          value={value}
          onChange={(e) => handlePropertyChange(propertyName, e.target.value)}
          required={isRequired}
          fullWidth
          disabled={isReadOnlyTransaction}
          type="text"
          helperText={description}
        />
      );
    };

    const isLoading = entitiesLoading || mutation.isPending;

    // Show loading only for essential data (user and basic entities)
    if (!currentUser || entitiesLoading) {
      return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Box sx={{ p: 3, maxWidth: 600, mx: "auto", textAlign: "center" }}>
            <Typography variant="h5" gutterBottom>
              {editingTransaction ? "Edit Transaction" : "Create Transaction"}
            </Typography>
            <CircularProgress sx={{ mt: 2 }} />
            <Typography variant="body2" sx={{ mt: 2 }}>
              Loading essential data...
            </Typography>
          </Box>
        </LocalizationProvider>
      );
    }

    return (
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <Box
          sx={{
            p: 3,
            maxWidth: 600,
            mx: "auto",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              mb: 1,
              flexShrink: 0,
            }}
          >
            <Typography variant="h5">
              {editingTransaction ? "Edit Transaction" : "Create Transaction"}
            </Typography>
            {editingTransaction && (
              <Chip
                label={`ID: ${editingTransaction.transaction_id}`}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
          </Box>

          {/* Audit Trail */}
          {editingTransaction?.update_date &&
            editingTransaction?.updated_by_user_name && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Last updated by {editingTransaction.updated_by_user_name} on{" "}
                  {formatDatabaseTimestamp(editingTransaction.update_date)}.
                </Typography>
              </Box>
            )}

          {/* Read-only status message for NEW or AMENDED transactions */}
          {isReadOnlyTransaction && (
            <Alert severity="info" sx={{ mb: 2 }}>
              This transaction is currently{" "}
              {editingTransaction?.transaction_status_name} and cannot be
              edited. To amend this transaction, please wait for it to process.
            </Alert>
          )}

          {/* Scrollable Content */}
          <Box sx={{ flex: 1, overflow: "auto", pb: "100px" }}>
            <Stepper activeStep={currentStep} sx={{ mb: 3 }}>
              <Step>
                <StepLabel>Portfolio</StepLabel>
              </Step>
              <Step>
                <StepLabel>Instrument</StepLabel>
              </Step>
              <Step>
                <StepLabel>Type</StepLabel>
              </Step>
              {isContraRequired && (
                <Step>
                  <StepLabel>Contra</StepLabel>
                </Step>
              )}
              <Step>
                <StepLabel>Properties</StepLabel>
              </Step>
            </Stepper>

            {/* Step 1: Portfolio Selection */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  1. Select Portfolio
                </Typography>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Autocomplete
                    options={portfolioEntities || []}
                    getOptionLabel={(option) => option.entity_name}
                    value={
                      portfolioEntities?.find(
                        (e) =>
                          e.entity_id.toString() ===
                          formData.portfolio_entity_id
                      ) || null
                    }
                    onChange={(_, newValue) =>
                      handleInputChange(
                        "portfolio_entity_id",
                        newValue?.entity_id.toString() || ""
                      )
                    }
                    loading={portfolioCategoryLoading}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Portfolio *"
                        required
                        fullWidth
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {portfolioCategoryLoading ? (
                                <CircularProgress color="inherit" size={20} />
                              ) : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                    disabled={isLoading || isReadOnlyTransaction}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<Add />}
                    onClick={() => setShowPortfolioModal(true)}
                    disabled={isLoading || isReadOnlyTransaction}
                    sx={{ minWidth: "auto", px: 2 }}
                  >
                    Add New
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {/* Step 2: Instrument Selection */}
            {formData.portfolio_entity_id && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      mb: 2,
                    }}
                  >
                    <Typography variant="h6">2. Select Instrument</Typography>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={isInvestorTransaction}
                          onChange={(e) => {
                            setIsInvestorTransaction(e.target.checked);
                            if (e.target.checked) {
                              // Clear instrument selection when toggling to investor transaction
                              setFormData((prev) => ({
                                ...prev,
                                instrument_entity_id: "",
                                transaction_type_id: "",
                                contra_entity_id: "",
                                properties: {},
                              }));
                              setCurrentStep(1);
                            }
                          }}
                          color="primary"
                        />
                      }
                      label="Investor Transaction"
                      sx={{ ml: 2 }}
                    />
                  </Box>
                  {!isInvestorTransaction && (
                    <Stack direction="row" spacing={2} alignItems="flex-start">
                      <Autocomplete
                        options={instrumentEntities || []}
                        getOptionLabel={(option) => {
                          // Entity already has entity_type_name, no need to look it up
                          return option.entity_type_name
                            ? `${option.entity_name} (${option.entity_type_name})`
                            : option.entity_name;
                        }}
                        value={
                          instrumentEntities?.find(
                            (e) =>
                              e.entity_id.toString() ===
                              formData.instrument_entity_id
                          ) || null
                        }
                        onChange={(_, newValue) =>
                          handleInputChange(
                            "instrument_entity_id",
                            newValue?.entity_id.toString() || ""
                          )
                        }
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Instrument *"
                            required
                            fullWidth
                          />
                        )}
                        disabled={isLoading || isReadOnlyTransaction}
                        sx={{ flex: 1 }}
                      />
                      <Button
                        variant="outlined"
                        startIcon={<Add />}
                        onClick={() => setShowInstrumentModal(true)}
                        disabled={isLoading || isReadOnlyTransaction}
                        sx={{ minWidth: "auto", px: 2 }}
                      >
                        Add New
                      </Button>
                    </Stack>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 3: Transaction Type Selection */}
            {(formData.instrument_entity_id || isInvestorTransaction) && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    3. Select Transaction Type
                  </Typography>
                  <Autocomplete
                    options={validTransactionTypes || []}
                    getOptionLabel={(option) => option.transaction_type_name}
                    value={
                      validTransactionTypes?.find(
                        (tt) =>
                          tt.transaction_type_id.toString() ===
                          formData.transaction_type_id
                      ) || null
                    }
                    onChange={(_, newValue) =>
                      handleInputChange(
                        "transaction_type_id",
                        newValue?.transaction_type_id.toString() || ""
                      )
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Transaction Type *"
                        required
                        fullWidth
                      />
                    )}
                    disabled={isLoading || isReadOnlyTransaction}
                  />
                  {validTransactionTypes.length === 0 && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      No valid transaction types found for the selected
                      instrument.
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 4: Contra Selection */}
            {formData.transaction_type_id && isContraRequired && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    4. Select Contra
                  </Typography>

                  {/* Show simplified UI when contra is auto-set to portfolio */}
                  {isContraAutoSetToPortfolio && !showContraSelection ? (
                    <Box>
                      <Typography variant="body1" sx={{ mb: 2 }}>
                        Currency amount will be reduced in{" "}
                        <strong>{selectedPortfolio?.entity_name}</strong>.
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={() => setShowContraSelection(true)}
                        disabled={isLoading}
                      >
                        Change Contra
                      </Button>
                    </Box>
                  ) : (
                    /* Show full contra selection UI */
                    <Stack direction="row" spacing={2} alignItems="flex-start">
                      <Autocomplete
                        options={validCounterparties || []}
                        getOptionLabel={(option) => option.entity_name}
                        value={
                          validCounterparties?.find(
                            (e) =>
                              e.entity_id.toString() ===
                              formData.contra_entity_id
                          ) || null
                        }
                        onChange={(_, newValue) =>
                          handleInputChange(
                            "contra_entity_id",
                            newValue?.entity_id.toString() || ""
                          )
                        }
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="contra *"
                            required
                            fullWidth
                          />
                        )}
                        disabled={isLoading || isReadOnlyTransaction}
                        sx={{ flex: 1 }}
                      />
                      <Button
                        variant="outlined"
                        startIcon={<Add />}
                        onClick={() => setShowcontraModal(true)}
                        disabled={isLoading || isReadOnlyTransaction}
                        sx={{ minWidth: "auto", px: 2 }}
                      >
                        Add New
                      </Button>
                    </Stack>
                  )}

                  {validCounterparties.length === 0 &&
                    !isContraAutoSetToPortfolio && (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        No valid counterparties found for the selected
                        instrument and transaction type.
                      </Alert>
                    )}
                </CardContent>
              </Card>
            )}

            {/* Trade Date and Settle Date - Mandatory Fields */}
            {formData.transaction_type_id &&
              (formData.contra_entity_id || !isContraRequired) && (
                <Card sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {isContraRequired
                        ? "5. Transaction Dates"
                        : "4. Transaction Dates"}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 2 }}
                    >
                      Enter the trade date and settlement date for this
                      transaction.
                    </Typography>
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                    >
                      {/* Trade Date */}
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="flex-start"
                      >
                        <TextField
                          label="Trade Date *"
                          type="date"
                          value={formData.trade_date}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              trade_date: e.target.value,
                            });
                            setHasUnsavedChanges(true);
                            console.log(
                              "Trade date changed, hasUnsavedChanges set to true"
                            );
                          }}
                          fullWidth
                          required
                          disabled={isReadOnlyTransaction}
                          InputLabelProps={{ shrink: true }}
                          helperText="Date the transaction was executed"
                          sx={{ flexGrow: 1 }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            const today = new Date();
                            const todayString = today
                              .toISOString()
                              .split("T")[0];
                            setFormData({
                              ...formData,
                              trade_date: todayString,
                            });
                            setHasUnsavedChanges(true);
                            console.log(
                              "Trade date set to today, hasUnsavedChanges set to true"
                            );
                          }}
                          disabled={isReadOnlyTransaction}
                          sx={{ minWidth: "auto", px: 2, mt: 1 }}
                        >
                          Today
                        </Button>
                      </Stack>

                      {/* Settle Date */}
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="flex-start"
                      >
                        <TextField
                          label="Settle Date *"
                          type="date"
                          value={formData.settle_date}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              settle_date: e.target.value,
                            });
                            setHasUnsavedChanges(true);
                            console.log(
                              "Settle date changed, hasUnsavedChanges set to true"
                            );
                          }}
                          fullWidth
                          required
                          disabled={isReadOnlyTransaction}
                          InputLabelProps={{ shrink: true }}
                          helperText="Date the transaction settles"
                          sx={{ flexGrow: 1 }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            const baseDate = formData.trade_date
                              ? new Date(formData.trade_date)
                              : new Date();
                            const tPlus3 = new Date(baseDate);
                            tPlus3.setDate(baseDate.getDate() + 3);
                            const tPlus3String = tPlus3
                              .toISOString()
                              .split("T")[0];
                            setFormData({
                              ...formData,
                              settle_date: tPlus3String,
                            });
                            setHasUnsavedChanges(true);
                            console.log(
                              "Settle date set to T+3, hasUnsavedChanges set to true"
                            );
                          }}
                          disabled={isReadOnlyTransaction}
                          sx={{ minWidth: "auto", px: 2, mt: 1 }}
                        >
                          T+3
                        </Button>
                      </Stack>
                    </Box>
                  </CardContent>
                </Card>
              )}

            {/* Step 6: Dynamic Properties */}
            {formData.transaction_type_id &&
              transactionSchema &&
              (formData.contra_entity_id || !isContraRequired) &&
              formData.trade_date &&
              formData.settle_date && (
                <Card sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {isContraRequired
                        ? "6. Transaction Properties"
                        : "5. Transaction Properties"}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 2 }}
                    >
                      {transactionSchema.description}
                    </Typography>
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                    >
                      {Object.entries(transactionSchema.properties || {}).map(
                        ([propertyName, propertySchema]) =>
                          renderPropertyField(propertyName, propertySchema)
                      )}
                    </Box>
                  </CardContent>
                </Card>
              )}
          </Box>

          {/* Fixed Footer with Action Buttons */}
          <Box
            sx={{
              display: "flex",
              gap: 2,
              p: 2,
              borderTop: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.paper",
              flexShrink: 0,
              position: "sticky",
              bottom: 0,
              zIndex: 1000,
            }}
          >
            {onClose && (
              <Button
                variant="outlined"
                onClick={handleCancel}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
            )}
            {onClose && (!editingTransaction || isIncompleteTransaction) && (
              <Button
                variant="outlined"
                onClick={handleFormDismissal}
                disabled={mutation.isPending}
                color="secondary"
              >
                Save for Later
              </Button>
            )}
            {isIncompleteTransaction && (
              <Button
                variant="outlined"
                onClick={handleDelete}
                disabled={mutation.isPending || deleteMutation.isPending}
                color="error"
              >
                {deleteMutation.isPending ? (
                  <>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    Deleting...
                  </>
                ) : (
                  "Delete Transaction"
                )}
              </Button>
            )}
            {!isReadOnlyTransaction && (
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={!canSubmit || mutation.isPending}
                sx={{ ml: "auto" }}
              >
                {mutation.isPending ? (
                  <>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    {editingTransaction
                      ? isIncompleteTransaction
                        ? "Submitting..."
                        : "Updating..."
                      : "Creating..."}
                  </>
                ) : editingTransaction ? (
                  isIncompleteTransaction ? (
                    "Submit"
                  ) : (
                    "Update"
                  )
                ) : (
                  "Create Transaction"
                )}
              </Button>
            )}
          </Box>

          {/* Success Snackbar */}
          {showSuccessSnackbar && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Transaction {editingTransaction ? "updated" : "created"}{" "}
              successfully!
            </Alert>
          )}

          {/* Portfolio Creation Modal */}
          {showPortfolioModal && (
            <Box
              sx={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1300,
              }}
            >
              <Box
                sx={{
                  backgroundColor: "white",
                  borderRadius: 2,
                  p: 3,
                  maxWidth: 800,
                  maxHeight: "90vh",
                  overflow: "auto",
                  mx: 2,
                  width: "100%",
                  "& .MuiPaper-root": {
                    boxShadow: "none",
                    maxWidth: "none",
                  },
                  "& .MuiDialog-paper": {
                    maxWidth: "none",
                    margin: 0,
                  },
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Create New Portfolio
                </Typography>
                <Box sx={{ maxHeight: "70vh", overflow: "auto" }}>
                  <EntityForm onClose={() => setShowPortfolioModal(false)} />
                </Box>
              </Box>
            </Box>
          )}

          {/* Instrument Creation Modal */}
          {showInstrumentModal && (
            <Box
              sx={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1300,
              }}
            >
              <Box
                sx={{
                  backgroundColor: "white",
                  borderRadius: 2,
                  p: 3,
                  maxWidth: 800,
                  maxHeight: "90vh",
                  overflow: "auto",
                  mx: 2,
                  width: "100%",
                  "& .MuiPaper-root": {
                    boxShadow: "none",
                    maxWidth: "none",
                  },
                  "& .MuiDialog-paper": {
                    maxWidth: "none",
                    margin: 0,
                  },
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Create New Instrument
                </Typography>
                <Box sx={{ maxHeight: "70vh", overflow: "auto" }}>
                  <EntityForm onClose={() => setShowInstrumentModal(false)} />
                </Box>
              </Box>
            </Box>
          )}

          {/* Contra Creation Modal */}
          {showcontraModal && isContraRequired && (
            <Box
              sx={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1300,
              }}
            >
              <Box
                sx={{
                  backgroundColor: "white",
                  borderRadius: 2,
                  p: 3,
                  maxWidth: 800,
                  maxHeight: "90vh",
                  overflow: "auto",
                  mx: 2,
                  width: "100%",
                  "& .MuiPaper-root": {
                    boxShadow: "none",
                    maxWidth: "none",
                  },
                  "& .MuiDialog-paper": {
                    maxWidth: "none",
                    margin: 0,
                  },
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Create New Contra
                </Typography>
                <Box sx={{ maxHeight: "70vh", overflow: "auto" }}>
                  <EntityForm onClose={() => setShowcontraModal(false)} />
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </LocalizationProvider>
    );
  }
);

TransactionForm.displayName = "TransactionForm";

export default TransactionForm;
