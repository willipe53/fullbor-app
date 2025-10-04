import { userPool } from "../config/cognito";

// Use proxy in development, direct API in production
const API_BASE_URL = import.meta.env.DEV
  ? "/api" // Development: use Vite proxy
  : "https://api.fullbor.ai/v2"; // Production: direct API Pathway

// Client Groups - Updated to match FullBor API spec
export interface ClientGroup {
  client_group_name: string;
  preferences?: any;
  entities?: Entity[];
  users?: User[];
  update_date?: string;
  updated_by_user_name?: string;
}

// Get the current user's token and ID from Cognito
const getAuthToken = (): Promise<string | null> => {
  return new Promise((resolve) => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      console.log("❌ getAuthToken - No current user");
      resolve(null);
      return;
    }

    currentUser.getSession((err: any, session: any) => {
      if (err) {
        console.log("❌ getAuthToken - Session error:", err);
        resolve(null);
        return;
      }
      if (!session || !session.isValid()) {
        console.log("❌ getAuthToken - Invalid session");
        resolve(null);
        return;
      }

      const idToken = session.getIdToken().getJwtToken();
      resolve(idToken);
    });
  });
};

// Get the current user's Cognito sub (user ID)
const getCurrentUserId = (): Promise<string | null> => {
  return new Promise((resolve) => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      resolve(null);
      return;
    }

    // Extract sub from Cognito token
    currentUser.getSession((err: any, session: any) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }

      const idToken = session.getIdToken();
      const payload = idToken.decodePayload();
      resolve(payload?.sub || null);
    });
  });
};

// Base API call function with auth
const apiCall = async <T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    data?: any;
    searchParams?: Record<string, string>;
  } = {}
): Promise<T> => {
  const { method = "GET", data, searchParams } = options;

  const token = await getAuthToken();
  const userId = await getCurrentUserId();

  if (!token || !userId) {
    console.log("❌ apiCall - No authentication token or user ID available");
    throw new Error("No authentication token or user ID available");
  }

  // Build URL with search parameters
  const url = new URL(`${API_BASE_URL}${endpoint}`, window.location.origin);
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Current-User-Id": userId,
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  // Add body for non-GET requests
  if (method !== "GET" && data) {
    fetchOptions.body = JSON.stringify(data);
  }

  const response = await fetch(url.toString(), fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    console.log("❌ apiCall - Error response:", errorText);
    throw new Error(`API call failed: ${response.status} ${errorText}`);
  }

  // Handle empty responses (common for DELETE operations)
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    const result = JSON.parse(text);
    return result;
  } catch (error) {
    console.error("Failed to parse JSON response:", text);
    throw new Error(`Invalid JSON response: ${text}`);
  }
};

// Entity Types - Updated to match FullBor API spec
export interface EntityType {
  entity_type_name: string;
  attributes_schema?: any;
  short_label?: string;
  label_color?: string;
  entity_category?: string;
  update_date?: string;
  updated_by_user_name?: string;
}

// Entities - Updated to match FullBor API spec
export interface Entity {
  entity_id: number;
  entity_name: string;
  entity_type_name: string;
  attributes?: any;
  update_date?: string;
  updated_by_user_name?: string;
}

export interface CreateEntityRequest {
  entity_name: string;
  entity_type_name: string;
  attributes?: any;
}

export interface UpdateEntityRequest {
  entity_name: string;
  entity_type_name: string;
  attributes?: any;
}

export interface QueryEntitiesRequest {
  entity_type_name?: string;
  entity_category?: string;
  client_group_name?: string;
  count?: boolean;
  limit?: number;
  offset?: number;
}

export type QueryEntitiesResponse =
  | {
      data: Entity[];
      count: number;
      limit: number;
      offset: number;
    }
  | { count: number }
  | Entity[]; // Simple array when no pagination parameters are provided

// Entity Types API functions - Updated for FullBor API
export interface QueryEntityTypesRequest {
  entity_category?: string;
  count?: boolean;
}

export type QueryEntityTypesResponse =
  | {
      data: EntityType[];
      count: number;
      limit: number;
      offset: number;
    }
  | { count: number };

export const queryEntityTypes = async (
  data: QueryEntityTypesRequest = {}
): Promise<QueryEntityTypesResponse> => {
  return apiCall<QueryEntityTypesResponse>("/entity-types", {
    method: "GET",
    searchParams: data as Record<string, string>,
  });
};

export const createEntityType = async (data: EntityType): Promise<void> => {
  return apiCall<void>("/entity-types", {
    method: "POST",
    data,
  });
};

export const updateEntityType = async (
  entityTypeName: string,
  data: EntityType
): Promise<EntityType> => {
  return apiCall<EntityType>(`/entity-types/${entityTypeName}`, {
    method: "PUT",
    data,
  });
};

export const deleteEntityType = async (
  entityTypeName: string
): Promise<void> => {
  return apiCall<void>(`/entity-types/${entityTypeName}`, {
    method: "DELETE",
  });
};

// Entities API functions - Updated for FullBor API
export const queryEntities = async (
  data: QueryEntitiesRequest = {}
): Promise<QueryEntitiesResponse> => {
  return apiCall<QueryEntitiesResponse>("/entities", {
    method: "GET",
    searchParams: data as Record<string, string>,
  });
};

export const createEntity = async (
  data: CreateEntityRequest
): Promise<void> => {
  return apiCall<void>("/entities", {
    method: "POST",
    data,
  });
};

export const updateEntity = async (
  entityName: string,
  data: UpdateEntityRequest
): Promise<Entity> => {
  return apiCall<Entity>(`/entities/${entityName}`, {
    method: "PUT",
    data,
  });
};

export const deleteEntity = async (entityName: string): Promise<void> => {
  return apiCall<void>(`/entities/${entityName}`, {
    method: "DELETE",
  });
};

// Legacy delete record function - deprecated, use specific delete functions
export const deleteRecord = async (
  recordId: number | string,
  recordType: string
): Promise<{ success: boolean; message: string }> => {
  // This function is deprecated - new FullBor API uses specific delete endpoints
  throw new Error(
    `deleteRecord is deprecated. Use specific delete function for ${recordType}`
  );
};

// Users - Updated to match actual database schema
export interface User {
  user_id: number;
  sub: string;
  email: string;
  preferences?: any;
  primary_client_group_id?: number;
  update_date?: string;
}

export interface CreateUserRequest {
  sub: string;
  email: string;
  preferences?: any;
  primary_client_group_id?: number;
}

export interface UpdateUserRequest {
  email?: string;
  sub?: string;
  preferences?: any;
  primary_client_group_id?: number;
}

export interface QueryUsersRequest {
  count?: boolean;
}

export type QueryUsersResponse = User[] | { count: number };

// Client Groups (moved to top of file)

export interface CreateClientGroupRequest {
  client_group_name: string;
  preferences?: any;
}

export interface UpdateClientGroupRequest {
  client_group_name: string;
  preferences?: any;
}

export interface QueryClientGroupsRequest {
  entity_name?: string;
  count?: boolean;
  limit?: number;
  offset?: number;
}

export type QueryClientGroupsResponse =
  | {
      data: ClientGroup[];
      count: number;
      limit: number;
      offset: number;
    }
  | { count: number };

// User API functions - Updated for FullBor API
export const queryUsers = async (
  data: QueryUsersRequest = {}
): Promise<QueryUsersResponse> => {
  // Remove unsupported parameters
  const cleanParams: Record<string, string> = {};
  if (data.count) cleanParams.count = String(data.count);

  return apiCall<QueryUsersResponse>("/users", {
    method: "GET",
    searchParams: cleanParams,
  });
};

export const createUser = async (data: CreateUserRequest): Promise<void> => {
  return apiCall<void>("/users", {
    method: "POST",
    data,
  });
};

export const updateUser = async (
  sub: string,
  data: UpdateUserRequest
): Promise<User> => {
  return apiCall<User>(`/users/${sub}`, {
    method: "PUT",
    data,
  });
};

export const deleteUser = async (sub: string): Promise<void> => {
  return apiCall<void>(`/users/${sub}`, {
    method: "DELETE",
  });
};

// Client Group API functions - Updated for FullBor API
export const queryClientGroups = async (
  data: QueryClientGroupsRequest = {}
): Promise<QueryClientGroupsResponse> => {
  return apiCall<QueryClientGroupsResponse>("/client-groups", {
    method: "GET",
    searchParams: data as Record<string, string>,
  });
};

export const createClientGroup = async (
  data: CreateClientGroupRequest
): Promise<void> => {
  return apiCall<void>("/client-groups", {
    method: "POST",
    data,
  });
};

export const updateClientGroup = async (
  clientGroupName: string,
  data: UpdateClientGroupRequest
): Promise<ClientGroup> => {
  return apiCall<ClientGroup>(`/client-groups/${clientGroupName}`, {
    method: "PUT",
    data,
  });
};

export const deleteClientGroup = async (
  clientGroupName: string
): Promise<void> => {
  return apiCall<void>(`/client-groups/${clientGroupName}`, {
    method: "DELETE",
  });
};

// Invitation interfaces - Updated for FullBor API spec
export interface Invitation {
  invitation_id: number;
  code: string;
  expires_at: string;
  client_group_name: string;
  email_sent_to?: string;
  updated_by_user_name?: string;
}

export interface CreateInvitationRequest {
  expires_at: string;
  client_group_name: string;
  email_sent_to?: string;
}

export interface QueryInvitationsRequest {
  client_group_name?: string;
  filter?: "unexpired";
  count?: boolean;
}

export type QueryInvitationsResponse = Invitation[] | { count: number };

// Client Group Membership interfaces
export interface ModifyClientGroupMembershipRequest {
  client_group_id: number;
  user_id: number;
  add_or_remove: "add" | "remove";
}

// Client Group User management - Updated for FullBor API
export const setClientGroupUsers = async (
  clientGroupName: string,
  data: { user_names: string[] } | { user_ids: number[] }
) => {
  return apiCall<void>(`/client-groups/${clientGroupName}/users:set`, {
    method: "PUT",
    data,
  });
};

// Client Group Entities interfaces and API functions
export interface ModifyClientGroupEntitiesRequest {
  client_group_id: number;
  entity_ids: number[]; // Array of entity_ids that should be in the group
  user_id: number; // Required for data protection
}

export interface ModifyClientGroupEntitiesResponse {
  success: boolean;
  added_count: number;
  removed_count: number;
  current_entity_ids: number[];
  desired_entity_ids: number[];
  entities_added: number[];
  entities_removed: number[];
}

// Client Group Entity management - Updated for FullBor API
export const setClientGroupEntities = async (
  clientGroupName: string,
  data: { entity_names: string[] } | { entity_ids: number[] }
) => {
  return apiCall<void>(`/client-groups/${clientGroupName}/entities:set`, {
    method: "PUT",
    data,
  });
};

export interface QueryClientGroupEntitiesRequest {
  client_group_id: number;
  user_id: number;
}

export const queryClientGroupEntities = async (
  data: QueryClientGroupEntitiesRequest
): Promise<number[]> => {
  // Get client group name from client_group_id
  const clientGroups = await queryClientGroups({});
  const clientGroupArray = Array.isArray(clientGroups)
    ? clientGroups
    : clientGroups.data || [];
  const clientGroup = clientGroupArray.find(
    (cg: any) => cg.client_group_id === data.client_group_id
  );

  if (!clientGroup) {
    throw new Error(`Client group with ID ${data.client_group_id} not found`);
  }

  // Use the correct endpoint: GET /client-groups/{client_group_name}/entities
  const result = await apiCall<Entity[]>(
    `/client-groups/${clientGroup.client_group_name}/entities`,
    {
      method: "GET",
    }
  );
  return result.map((entity: Entity) => entity.entity_id || 0);
};

export const modifyClientGroupEntities = async (
  data: ModifyClientGroupEntitiesRequest
): Promise<ModifyClientGroupEntitiesResponse> => {
  // Get client group name from client_group_id
  const clientGroups = await queryClientGroups({});
  const clientGroupArray = Array.isArray(clientGroups)
    ? clientGroups
    : clientGroups.data || [];
  const clientGroup = clientGroupArray.find(
    (cg: any) => cg.client_group_id === data.client_group_id
  );

  if (!clientGroup) {
    throw new Error(`Client group with ID ${data.client_group_id} not found`);
  }

  // Get current entities
  const currentEntities = await queryClientGroupEntities({
    client_group_id: data.client_group_id,
    user_id: data.user_id,
  });

  const currentSet = new Set(currentEntities);
  const desiredSet = new Set(data.entity_ids);

  // Calculate differences
  const entitiesToAdd = data.entity_ids.filter((id) => !currentSet.has(id));
  const entitiesToRemove = currentEntities.filter((id) => !desiredSet.has(id));

  // Use the set endpoint to replace all entities with the desired set
  await setClientGroupEntities(clientGroup.client_group_name, {
    entity_ids: data.entity_ids,
  });

  return {
    success: true,
    added_count: entitiesToAdd.length,
    removed_count: entitiesToRemove.length,
    current_entity_ids: currentEntities,
    desired_entity_ids: data.entity_ids,
    entities_added: entitiesToAdd,
    entities_removed: entitiesToRemove,
  };
};

export interface QueryEntityCountRequest {
  user_id: number;
  client_group_id?: number;
  entity_type_id?: number;
}

// Deprecated - use queryEntities with { count: true }

// Entity Types count
// Deprecated - use queryEntityTypes with { count: true }

// Users count
export interface QueryUserCountRequest {
  requesting_user_id?: number;
  user_id?: number;
  sub?: string;
  email?: string;
}

// Deprecated - use queryUsers with { count: true }

// Client Groups count
export interface QueryClientGroupCountRequest {
  user_id?: number;
  client_group_id?: number;
  group_name?: string;
}

// Deprecated - use queryClientGroups with { count: true }

// Invitations count - deprecated
export interface QueryInvitationCountRequest {
  client_group_id?: number;
  code?: string;
}

// Invitation API functions - Updated for FullBor API
export const queryInvitations = async (
  data: QueryInvitationsRequest = {}
): Promise<QueryInvitationsResponse> => {
  return apiCall<QueryInvitationsResponse>("/invitations", {
    method: "GET",
    searchParams: data as Record<string, string>,
  });
};

export const createInvitation = async (
  data: CreateInvitationRequest
): Promise<void> => {
  return apiCall<void>("/invitations", {
    method: "POST",
    data,
  });
};

export const deleteInvitation = async (invitationId: number): Promise<void> => {
  return apiCall<void>(`/invitations/${invitationId}`, {
    method: "DELETE",
  });
};

export const redeemInvitation = async (code: string): Promise<void> => {
  return apiCall<void>(`/invitations/redeem/${code}`, {
    method: "POST",
  });
};

export const queryClientGroupInvitations = async (
  clientGroupName: string,
  data: QueryInvitationsRequest = {}
): Promise<QueryInvitationsResponse> => {
  return apiCall<QueryInvitationsResponse>(
    `/client-groups/${clientGroupName}/invitations`,
    {
      method: "GET",
      searchParams: data as Record<string, string>,
    }
  );
};

// Convenience function to update user's sub field after login
export const updateUserSub = async (
  userName: string,
  sub: string,
  email: string
): Promise<User> => {
  return updateUser(userName, {
    sub,
    email,
  });
};

// Utility function to parse and humanize API errors
export const parseApiError = (error: Error): string => {
  const message = error.message;

  // Handle API call errors with JSON responses
  if (message.includes("API call failed:")) {
    try {
      // Extract JSON from error message like "API call failed: 500 {"error": "..."}"
      const jsonMatch = message.match(/\{.*\}$/);
      if (jsonMatch) {
        const errorResponse = JSON.parse(jsonMatch[0]);
        const errorText = errorResponse.error || errorResponse.message;

        // Handle specific database errors
        if (typeof errorText === "string") {
          // Duplicate entry errors
          if (
            errorText.includes("Duplicate entry") &&
            errorText.includes("client_groups.name")
          ) {
            const nameMatch = errorText.match(/Duplicate entry '([^']+)'/);
            const orgName = nameMatch ? nameMatch[1] : "that name";
            return `That organization name "${orgName}" is already in use. Please try a different name.`;
          }

          // Other duplicate entry errors
          if (errorText.includes("Duplicate entry")) {
            return "This record already exists. Please check your input and try again.";
          }

          // Foreign key constraint errors
          if (errorText.includes("foreign key constraint")) {
            return "Unable to complete this action due to related data constraints.";
          }

          // Connection errors
          if (
            errorText.includes("connection") ||
            errorText.includes("timeout")
          ) {
            return "Connection error. Please check your internet connection and try again.";
          }

          // Access denied errors
          if (
            errorText.includes("Access denied") ||
            errorText.includes("permission")
          ) {
            return "You do not have permission to perform this action.";
          }
        }
      }
    } catch (parseError) {
      // If we can't parse the JSON, fall back to basic cleanup
    }
  }

  // Generic cleanup for other errors
  if (message.includes("API call failed:")) {
    return "An error occurred while processing your request. Please try again.";
  }

  // Return the original message if no specific handling applies
  return message;
};

// Transaction Types
// Transaction Types - Updated for FullBor API spec
export interface TransactionType {
  transaction_type_name: string;
  properties?: any;
  update_date?: string;
  updated_by_user_name?: string;
}

// Transaction Statuses - Updated for FullBor API spec
export interface TransactionStatus {
  transaction_status_name: string;
  update_date?: string;
  updated_by_user_name?: string;
}

// Transactions - Updated for FullBor API spec
export interface Transaction {
  transaction_id: number;
  portfolio_entity_name: string;
  contra_entity_name?: string;
  instrument_entity_name?: string;
  transaction_status_name: string;
  transaction_type_name: string;
  properties?: any;
  update_date?: string;
  updated_by_user_name?: string;
}

export interface CreateTransactionRequest {
  portfolio_entity_name: string;
  contra_entity_name?: string;
  instrument_entity_name?: string;
  transaction_status_name: string;
  transaction_type_name: string;
  properties?: any;
}

export interface UpdateTransactionRequest extends CreateTransactionRequest {
  transaction_id?: number;
}

export interface QueryTransactionsRequest {
  portfolio_entity_name?: string;
  contra_entity_name?: string;
  instrument_entity_name?: string;
  transaction_status_name?: string;
  transaction_type_name?: string;
  count?: boolean;
  limit?: number;
  offset?: number;
}

export type QueryTransactionsResponse =
  | {
      data: Transaction[];
      count: number;
      limit: number;
      offset: number;
    }
  | { count: number };

// Transaction Type API Functions - Updated for FullBor API
export interface QueryTransactionTypesRequest {
  count?: boolean;
}

export type QueryTransactionTypesResponse =
  | TransactionType[]
  | { count: number };

export const queryTransactionTypes = async (
  data: QueryTransactionTypesRequest = {}
): Promise<QueryTransactionTypesResponse> => {
  return apiCall<QueryTransactionTypesResponse>("/transaction-types", {
    method: "GET",
    searchParams: data as Record<string, string>,
  });
};

export const createTransactionType = async (
  data: TransactionType
): Promise<void> => {
  return apiCall<void>("/transaction-types", {
    method: "POST",
    data,
  });
};

export const updateTransactionType = async (
  transactionTypeName: string,
  data: TransactionType
): Promise<TransactionType> => {
  return apiCall<TransactionType>(`/transaction-types/${transactionTypeName}`, {
    method: "PUT",
    data,
  });
};

export const deleteTransactionType = async (
  transactionTypeName: string
): Promise<void> => {
  return apiCall<void>(`/transaction-types/${transactionTypeName}`, {
    method: "DELETE",
  });
};

// Transaction Status API Functions - Updated for FullBor API
export interface QueryTransactionStatusesRequest {
  count?: boolean;
}

export type QueryTransactionStatusesResponse =
  | TransactionStatus[]
  | { count: number };

export const queryTransactionStatuses = async (
  data: QueryTransactionStatusesRequest = {}
): Promise<QueryTransactionStatusesResponse> => {
  return apiCall<QueryTransactionStatusesResponse>("/transaction-statuses", {
    method: "GET",
    searchParams: data as Record<string, string>,
  });
};

// Transaction API Functions - Updated for FullBor API
export const createTransaction = async (
  data: CreateTransactionRequest
): Promise<void> => {
  return apiCall<void>("/transactions", {
    method: "POST",
    data,
  });
};

export const queryTransactions = async (
  data: QueryTransactionsRequest = {}
): Promise<QueryTransactionsResponse> => {
  return apiCall<QueryTransactionsResponse>("/transactions", {
    method: "GET",
    searchParams: data as Record<string, string>,
  });
};

export const updateTransaction = async (
  transactionId: number,
  data: UpdateTransactionRequest
): Promise<Transaction> => {
  return apiCall<Transaction>(`/transactions/${transactionId}`, {
    method: "PUT",
    data,
  });
};

export const deleteTransaction = async (
  transactionId: number
): Promise<void> => {
  return apiCall<void>(`/transactions/${transactionId}`, {
    method: "DELETE",
  });
};

// Position Keeper API Functions - Updated for FullBor API
export const startPositionKeeper = async (): Promise<{
  command: string;
  status: string;
  message: string;
  timestamp: string;
}> => {
  return apiCall<{
    command: string;
    status: string;
    message: string;
    timestamp: string;
  }>("/position-keeper", {
    method: "POST",
    data: { command: "start" },
  });
};

export const stopPositionKeeper = async (): Promise<{
  command: string;
  status: string;
  message: string;
  timestamp: string;
}> => {
  return apiCall<{
    command: string;
    status: string;
    message: string;
    timestamp: string;
  }>("/position-keeper", {
    method: "POST",
    data: { command: "stop" },
  });
};

// API Service - Updated for FullBor API
export const apiService = {
  // Client Groups
  createClientGroup,
  queryClientGroups,
  updateClientGroup,
  deleteClientGroup,
  setClientGroupUsers,
  setClientGroupEntities,
  queryClientGroupEntities,
  modifyClientGroupEntities,

  // Entities
  createEntity,
  queryEntities,
  updateEntity,
  deleteEntity,

  // Entity Types
  createEntityType,
  queryEntityTypes,
  updateEntityType,
  deleteEntityType,

  // Users
  createUser,
  queryUsers,
  updateUser,
  deleteUser,

  // Invitations
  createInvitation,
  queryInvitations,
  queryClientGroupInvitations,
  deleteInvitation,
  redeemInvitation,

  // Transaction Types
  createTransactionType,
  queryTransactionTypes,
  updateTransactionType,
  deleteTransactionType,

  // Transaction Statuses
  queryTransactionStatuses,

  // Transactions
  createTransaction,
  queryTransactions,
  updateTransaction,
  deleteTransaction,

  // Position Keeper
  startPositionKeeper,
  stopPositionKeeper,
};
