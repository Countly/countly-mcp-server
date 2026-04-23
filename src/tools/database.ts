import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_DATABASES TOOL
// ============================================================================

export const listDatabasesToolDefinition = {
  name: 'databases_list',
  description: 'List MongoDB databases and collections exposed by the Countly dbviewer (typically countly, countly_drill, countly_out, countly_fs) via /o/db. Requires the dbviewer plugin. Takes no arguments.',
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
  name: 'databases_query',
  description: 'Run a raw MongoDB find() query on a Countly collection with filter, projection, sort, and pagination via /o/db. Requires the dbviewer plugin. For a single document by _id use databases_document; for aggregation pipelines use collections_aggregate.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Optional application ID passed to the query. When provided (or resolvable from app_name) it is forwarded as an app_id filter to the dbviewer endpoint.' },
      app_name: { type: 'string', description: 'Optional application name (resolved to app_id before querying). Must match an existing app exactly; see apps_list.' },
      database: {
        type: 'string',
        enum: ['countly', 'countly_drill', 'countly_out', 'countly_fs'],
        description: 'Database to query. Defaults to "countly".',
        default: 'countly'
      },
      collection: { type: 'string', description: 'Collection name within the chosen database. To discover collection names use databases_list.' },
      filter: { type: 'string', description: 'MongoDB query filter as a JSON string (e.g. \'{"_id":"abc"}\'). Optional.' },
      projection: { type: 'string', description: 'MongoDB projection as a JSON string (e.g. \'{"_id":1,"name":1}\'). Optional.' },
      sort: { type: 'string', description: 'MongoDB sort as a JSON string (e.g. \'{"_id":-1}\'). Optional.' },
      limit: { type: 'number', description: 'Maximum number of documents to return (1-1000). Defaults to 20.', minimum: 1, maximum: 1000, default: 20 },
      skip: { type: 'number', description: 'Number of documents to skip for pagination. Defaults to 0.', minimum: 0, default: 0 },
      search: { type: 'string', description: 'Optional substring match on document _id values.' },
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
  name: 'databases_document',
  description: 'Fetch a single MongoDB document by _id from a given collection via /o/db. Requires the dbviewer plugin. For multi-document queries use databases_query.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Optional application ID scope for the lookup. When provided (or resolvable from app_name) it is forwarded to the dbviewer endpoint.' },
      app_name: { type: 'string', description: 'Optional application name (resolved to app_id). Must match an existing app exactly; see apps_list.' },
      database: {
        type: 'string',
        enum: ['countly', 'countly_drill', 'countly_out', 'countly_fs'],
        description: 'Database name. Defaults to "countly".',
        default: 'countly'
      },
      collection: { type: 'string', description: 'Collection holding the document. To discover collections use databases_list.' },
      document_id: { type: 'string', description: 'Document _id to retrieve.' },
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
  name: 'collections_aggregate',
  description: 'Run a MongoDB aggregation pipeline on a collection via /o/db. Requires the dbviewer plugin. For simple find queries use databases_query.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Optional application ID scope forwarded to the dbviewer endpoint.' },
      app_name: { type: 'string', description: 'Optional application name (resolved to app_id). Must match an existing app exactly; see apps_list.' },
      database: {
        type: 'string',
        enum: ['countly', 'countly_drill', 'countly_out', 'countly_fs'],
        description: 'Database name. Defaults to "countly".',
        default: 'countly'
      },
      collection: { type: 'string', description: 'Collection to run the aggregation against. To discover collections use databases_list.' },
      aggregation: { type: 'string', description: 'Aggregation pipeline as a JSON-encoded array (e.g. \'[{"$match":{"_id":"x"}},{"$group":{"_id":"$field","n":{"$sum":1}}}]\').' },
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
  name: 'collections_indexes',
  description: 'List indexes defined on a MongoDB collection (keys, options, sizes) via /o/db?action=get_indexes. Requires the dbviewer plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        enum: ['countly', 'countly_drill', 'countly_out', 'countly_fs'],
        description: 'Database name. Defaults to "countly".',
        default: 'countly'
      },
      collection: { type: 'string', description: 'Collection whose indexes to list. To discover collections use databases_list.' },
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
  name: 'databases_stats',
  description: 'Get live MongoDB process statistics ("mongotop" per-collection timings or "mongostat" server-wide counters) via /o/db/mongotop or /o/db/mongostat. Requires the dbviewer plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      stat_type: {
        type: 'string',
        enum: ['mongotop', 'mongostat'],
        description: 'Which statistic set to fetch: "mongotop" (per-collection read/write time) or "mongostat" (server-wide ops/second, connections, memory).'
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
  'databases_list': 'listDatabases',
  'databases_query': 'queryDatabase',
  'databases_document': 'getDocument',
  'collections_aggregate': 'aggregateCollection',
  'collections_indexes': 'getCollectionIndexes',
  'databases_stats': 'getDbStatistics',
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
