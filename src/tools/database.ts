import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_DATABASES TOOL
// ============================================================================

export const listDatabasesToolDefinition = {
  name: 'list_databases',
  description: 'List all available databases and their collections',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleListDatabases(context: ToolContext, _: any): Promise<ToolResult> {
  const params = {
    ...context.getAuthParams(),
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/o/db', { params }),


    'Failed to execute request to /o/db'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Available databases and collections:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// QUERY_DATABASE TOOL
// ============================================================================

export const queryDatabaseToolDefinition = {
  name: 'query_database',
  description: 'Query documents from a database collection with filtering, sorting, and pagination',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID to filter results (optional)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      database: { 
        type: 'string', 
        enum: ['countly', 'countly_drill', 'countly_out', 'countly_fs'],
        description: 'Database name',
        default: 'countly'
      },
      collection: { type: 'string', description: 'Collection name to query' },
      filter: { type: 'string', description: 'MongoDB query filter as JSON string (optional)' },
      projection: { type: 'string', description: 'MongoDB projection as JSON string (optional)' },
      sort: { type: 'string', description: 'MongoDB sort criteria as JSON string (optional)' },
      limit: { type: 'number', description: 'Maximum number of documents to return (1-1000)', minimum: 1, maximum: 1000, default: 20 },
      skip: { type: 'number', description: 'Number of documents to skip for pagination', minimum: 0, default: 0 },
      search: { type: 'string', description: 'Search term for document IDs (optional)' },
    },
    required: ['collection'],
  },
};

export async function handleQueryDatabase(context: ToolContext, args: any): Promise<ToolResult> {
  const { database = 'countly', collection, filter, projection, sort, limit = 20, skip = 0, search } = args;
  
  const params: any = {
    ...context.getAuthParams(),
    db: database,
    collection,
    limit,
    skip,
  };

  // Add app_id if provided (either directly or resolved from app_name)
  if (args.app_id || args.app_name) {
    try {
      params.app_id = await context.resolveAppId(args);
    } catch {
      // If app resolution fails, continue without app_id filter
    }
  }

  if (filter) {
params.filter = filter;
}
  if (projection) {
params.projection = projection;
}
  if (sort) {
params.sort = sort;
}
  if (search) {
params.sSearch = search;
}

  const response = await safeApiCall(


    () => context.httpClient.get('/o/db', { params }),


    'Failed to execute request to /o/db'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Query results from ${database}.${collection}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_DOCUMENT TOOL
// ============================================================================

export const getDocumentToolDefinition = {
  name: 'get_document',
  description: 'Get a specific document by ID from a collection',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID to filter results (optional)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      database: { 
        type: 'string', 
        enum: ['countly', 'countly_drill', 'countly_out', 'countly_fs'],
        description: 'Database name',
        default: 'countly'
      },
      collection: { type: 'string', description: 'Collection name' },
      document_id: { type: 'string', description: 'Document ID to retrieve' },
    },
    required: ['collection', 'document_id'],
  },
};

export async function handleGetDocument(context: ToolContext, args: any): Promise<ToolResult> {
  const { database = 'countly', collection, document_id } = args;
  
  const params: any = {
    ...context.getAuthParams(),
    db: database,
    collection,
    document: document_id,
  };

  // Add app_id if provided (either directly or resolved from app_name)
  if (args.app_id || args.app_name) {
    try {
      params.app_id = await context.resolveAppId(args);
    } catch {
      // If app resolution fails, continue without app_id filter
    }
  }

  const response = await safeApiCall(


    () => context.httpClient.get('/o/db', { params }),


    'Failed to execute request to /o/db'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Document ${document_id} from ${database}.${collection}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// AGGREGATE_COLLECTION TOOL
// ============================================================================

export const aggregateCollectionToolDefinition = {
  name: 'aggregate_collection',
  description: 'Run MongoDB aggregation pipeline on a collection',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID to filter results (optional)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      database: { 
        type: 'string', 
        enum: ['countly', 'countly_drill', 'countly_out', 'countly_fs'],
        description: 'Database name',
        default: 'countly'
      },
      collection: { type: 'string', description: 'Collection name' },
      aggregation: { type: 'string', description: 'MongoDB aggregation pipeline as JSON string' },
    },
    required: ['collection', 'aggregation'],
  },
};

export async function handleAggregateCollection(context: ToolContext, args: any): Promise<ToolResult> {
  const { database = 'countly', collection, aggregation } = args;
  
  const params: any = {
    ...context.getAuthParams(),
    db: database,
    collection,
    aggregation,
  };

  // Add app_id if provided (either directly or resolved from app_name)
  if (args.app_id || args.app_name) {
    try {
      params.app_id = await context.resolveAppId(args);
    } catch {
      // If app resolution fails, continue without app_id filter
    }
  }

  const response = await safeApiCall(


    () => context.httpClient.get('/o/db', { params }),


    'Failed to execute request to /o/db'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Aggregation results from ${database}.${collection}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_COLLECTION_INDEXES TOOL
// ============================================================================

export const getCollectionIndexesToolDefinition = {
  name: 'get_collection_indexes',
  description: 'Get indexes for a specific collection',
  inputSchema: {
    type: 'object',
    properties: {
      database: { 
        type: 'string', 
        enum: ['countly', 'countly_drill', 'countly_out', 'countly_fs'],
        description: 'Database name',
        default: 'countly'
      },
      collection: { type: 'string', description: 'Collection name' },
    },
    required: ['collection'],
  },
};

export async function handleGetCollectionIndexes(context: ToolContext, args: any): Promise<ToolResult> {
  const { database = 'countly', collection } = args;
  
  const params = {
    ...context.getAuthParams(),
    db: database,
    collection,
    action: 'get_indexes',
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/o/db', { params }),


    'Failed to execute request to /o/db'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Indexes for ${database}.${collection}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_DB_STATISTICS TOOL
// ============================================================================

export const getDbStatisticsToolDefinition = {
  name: 'get_db_statistics',
  description: 'Get MongoDB statistics (mongotop and mongostat)',
  inputSchema: {
    type: 'object',
    properties: {
      stat_type: {
        type: 'string',
        enum: ['mongotop', 'mongostat'],
        description: 'Type of statistics to retrieve'
      },
    },
    required: ['stat_type'],
  },
};

export async function handleGetDbStatistics(context: ToolContext, args: any): Promise<ToolResult> {
  const { stat_type } = args;
  
  const params = {
    ...context.getAuthParams(),
  };

  const endpoint = stat_type === 'mongotop' ? '/o/db/mongotop' : '/o/db/mongostat';
  const response = await safeApiCall(

    () => context.httpClient.get(endpoint, { params }),

    'Failed to execute request to API request'

  );
  
  return {
    content: [
      {
        type: 'text',
        text: `MongoDB ${stat_type} statistics:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const databaseToolDefinitions = [
  listDatabasesToolDefinition,
  queryDatabaseToolDefinition,
  getDocumentToolDefinition,
  aggregateCollectionToolDefinition,
  getCollectionIndexesToolDefinition,
  getDbStatisticsToolDefinition,
];

export const databaseToolHandlers = {
  'list_databases': 'listDatabases',
  'query_database': 'queryDatabase',
  'get_document': 'getDocument',
  'aggregate_collection': 'aggregateCollection',
  'get_collection_indexes': 'getCollectionIndexes',
  'get_db_statistics': 'getDbStatistics',
} as const;

export class DatabaseTools {
  constructor(private context: ToolContext) {}

  async listDatabases(args: any): Promise<ToolResult> {
    return handleListDatabases(this.context, args);
  }

  async queryDatabase(args: any): Promise<ToolResult> {
    return handleQueryDatabase(this.context, args);
  }

  async getDocument(args: any): Promise<ToolResult> {
    return handleGetDocument(this.context, args);
  }

  async aggregateCollection(args: any): Promise<ToolResult> {
    return handleAggregateCollection(this.context, args);
  }

  async getCollectionIndexes(args: any): Promise<ToolResult> {
    return handleGetCollectionIndexes(this.context, args);
  }

  async getDbStatistics(args: any): Promise<ToolResult> {
    return handleGetDbStatistics(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const databaseToolMetadata = {
  instanceKey: 'database',
  toolClass: DatabaseTools,
  handlers: databaseToolHandlers,
} as const;
