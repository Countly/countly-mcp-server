import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_DATABASES TOOL
// ============================================================================

export const listDatabasesToolDefinition = {
  name: 'databases_list',
  description: 'List databases and collections exposed by the Countly dbviewer (typically countly, countly_drill, countly_out, countly_fs) via /o/db. On Countly Platform it also lists ClickHouse databases (prefixed "clickhouse_", e.g. clickhouse_countly_drill with drill_events and app_users), where raw events and user profiles live. Requires the dbviewer plugin. Takes no arguments.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const CLICKHOUSE_PREFIX = 'clickhouse_';

/**
 * ClickHouse databases (Countly Platform) have no aggregation pipelines or
 * MongoDB-style indexes, so these tools only apply to MongoDB databases.
 */
function clickhouseUnsupported(database: unknown, toolName: string): ToolResult | null {
  if (typeof database !== 'string' || !database.startsWith(CLICKHOUSE_PREFIX)) {
    return null;
  }
  return {
    content: [{
      type: 'text',
      text: `${toolName} does not support ClickHouse databases (${database}). Use databases_query for filtered reads, ` +
        'or drill_query for counts, unique users, sums and breakdowns over drill_events.',
    }],
    isError: true,
  } as ToolResult;
}

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
  description: 'Run a raw find() query on a Countly collection with filter, projection, sort, and pagination via /o/db. Requires the dbviewer plugin. On Countly Platform, ClickHouse tables (database "clickhouse_countly_drill": drill_events, app_users) are queried the same way: the Mongo-style filter is translated to SQL. drill_events columns include a (app id), e (event key, custom events are "[CLY]_custom" with the name in n), n, uid, ts, c, s, dur, sg.<segment>, up.<user property>; always filter by a. For a single document by _id use databases_document; for aggregation pipelines use collections_aggregate (MongoDB only; on ClickHouse use drill_query).',
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
  description: 'Run a read-only MongoDB aggregation pipeline on a collection via /o/db; write and introspection stages such as $out, $merge and $currentOp are rejected. Requires the dbviewer plugin. MongoDB databases only: for ClickHouse databases on Countly Platform use databases_query or drill_query. For simple find queries use databases_query.',
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

/**
 * Aggregation stages collections_aggregate may send, mirroring the stage
 * allow-list of Countly's dbviewer aggregation guard
 * (plugins/dbviewer/api/parts/aggregation_guard.js: STAGES_USER plus
 * STAGES_GLOBAL_ADMIN_ONLY). The MCP server cannot tell whether the token
 * belongs to a global admin, so it allows the union and Countly narrows the
 * joins per role.
 *
 * This is an allow-list, so it fails closed: writes ($out, $merge),
 * server/cluster introspection ($currentOp, $collStats, ...), $documents and
 * any stage a future MongoDB adds are refused until reviewed here. Only stage
 * names are checked. Countly's guard also validates every operator at every
 * depth and the join targets; those depend on its MongoDB version and the
 * caller's role, so they stay server-side rather than being copied here to
 * drift.
 */
const ALLOWED_STAGES = new Set([
  '$addFields', '$bucket', '$bucketAuto', '$count', '$densify', '$facet',
  '$fill', '$geoNear', '$group', '$limit', '$match', '$project',
  '$querySettings', '$redact', '$replaceRoot', '$replaceWith', '$sample',
  '$search', '$searchMeta', '$set', '$setWindowFields', '$skip', '$sort',
  '$sortByCount', '$unset', '$unwind', '$vectorSearch',
  // joins and unions: global admins only, enforced by Countly
  '$lookup', '$graphLookup', '$unionWith',
]);

/**
 * collections_aggregate is classified as a read operation, so it stays
 * available under COUNTLY_TOOLS_ALL=R. Return the first top-level stage that
 * is not on the allow-list, or undefined. Input that is not a JSON array is
 * left for Countly to reject as an invalid pipeline.
 */
export function findDisallowedStage(aggregation: unknown): string | undefined {
  let pipeline = aggregation;
  if (typeof pipeline === 'string') {
    try {
      pipeline = JSON.parse(pipeline);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(pipeline)) {
    return undefined;
  }
  for (const stage of pipeline) {
    if (stage && typeof stage === 'object' && !Array.isArray(stage)) {
      const found = Object.keys(stage).find((key) => key.startsWith('$') && !ALLOWED_STAGES.has(key));
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

export async function handleAggregateCollection(context: ToolContext, args: any): Promise<ToolResult> {
  const { database = 'countly', collection, aggregation } = args;
  const unsupported = clickhouseUnsupported(database, 'collections_aggregate');
  if (unsupported) {
    return unsupported;
  }

  const disallowedStage = findDisallowedStage(aggregation);
  if (disallowedStage) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `collections_aggregate is read-only and does not allow the ${disallowedStage} stage. Allowed stages: ${[...ALLOWED_STAGES].join(', ')}.`
    );
  }
  
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
  const unsupportedIndexes = clickhouseUnsupported(database, 'collections_indexes');
  if (unsupportedIndexes) {
    return unsupportedIndexes;
  }
  
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
