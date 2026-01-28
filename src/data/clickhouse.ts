/**
 * ClickHouse Data Access Layer
 *
 * Provides functions to query network telemetry data from ClickHouse.
 * Connection configuration via environment variables.
 */
import { createClient, ClickHouseClient } from "@clickhouse/client";

// =============================================================================
// Types
// =============================================================================

export interface QueryFilters {
  hours?: number;
  sensor_ip?: string;
  sensor_name?: string;
  limit?: number;
}

export interface ApplicationMetrics {
  applicationName: string;
  totalTransactions: number;
  errorCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

export interface HealthOverviewData {
  totalTransactions: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  uniqueClients: number;
  uniqueServers: number;
  applications: ApplicationMetrics[];
}

export interface TopTalkerData {
  clientIp: string;
  serverIp: string;
  bytes: number;
  requestCount: number;
}

export interface TrafficTimelinePoint {
  hour: string;
  requests: number;
  errors: number;
}

// ClickHouse response row types (snake_case as returned by queries)
interface HealthOverviewRow {
  total_transactions: string;
  error_count: string;
  avg_latency_ms: string;
  p95_latency_ms: string;
  unique_clients: string;
  unique_servers: string;
}

interface ApplicationRow {
  application_name: string;
  total_transactions: string;
  error_count: string;
  avg_latency_ms: string;
  p95_latency_ms: string;
}

interface TopTalkerRow {
  client_ip: string;
  server_ip: string;
  bytes: string;
  request_count: string;
}

interface TrafficTimelineRow {
  hour: string;
  requests: string;
  errors: string;
}

// =============================================================================
// Client Management
// =============================================================================

let client: ClickHouseClient | null = null;

function getClient(): ClickHouseClient {
  if (!client) {
    const url = process.env.CLICKHOUSE_URL || "http://localhost:8123";
    const database = process.env.CLICKHOUSE_DATABASE || "omnis";
    const username = process.env.CLICKHOUSE_USERNAME || "default";
    const password = process.env.CLICKHOUSE_PASSWORD || "";

    client = createClient({
      url,
      database,
      username,
      password,
      request_timeout: 30000,
    });
  }
  return client;
}

// =============================================================================
// Query Helpers
// =============================================================================

interface WhereClauseResult {
  clause: string;
  params: Record<string, string | number>;
}

/**
 * Build a parameterized WHERE clause to prevent SQL injection.
 * Uses ClickHouse's {param:Type} syntax for safe parameter binding.
 */
function buildWhereClause(filters: QueryFilters): WhereClauseResult {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  const hours = filters.hours || 24;
  params.filter_hours = hours;
  conditions.push(`timestamp >= now() - INTERVAL {filter_hours:UInt32} HOUR`);

  if (filters.sensor_ip) {
    params.filter_sensor_ip = filters.sensor_ip;
    conditions.push(`sensor_ip = {filter_sensor_ip:String}`);
  }

  if (filters.sensor_name) {
    params.filter_sensor_name = filters.sensor_name;
    conditions.push(`sensor_name = {filter_sensor_name:String}`);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get overall health metrics and per-application breakdown
 */
export async function getHealthOverview(
  filters: QueryFilters
): Promise<HealthOverviewData> {
  const ch = getClient();
  const { clause: whereClause, params } = buildWhereClause(filters);

  // Query for overall metrics
  const overallQuery = `
    SELECT
      count() as total_transactions,
      countIf(is_error = 1) as error_count,
      avg(response_time_ms) as avg_latency_ms,
      quantile(0.95)(response_time_ms) as p95_latency_ms,
      uniq(client_host_ip_address) as unique_clients,
      uniq(server_host_ip_address) as unique_servers
    FROM f_aggregate_telemetry
    ${whereClause}
  `;

  // Query for per-application metrics
  const appQuery = `
    SELECT
      application_name,
      count() as total_transactions,
      countIf(is_error = 1) as error_count,
      avg(response_time_ms) as avg_latency_ms,
      quantile(0.95)(response_time_ms) as p95_latency_ms
    FROM f_aggregate_telemetry
    ${whereClause}
    GROUP BY application_name
    ORDER BY total_transactions DESC
    LIMIT 20
  `;

  try {
    const [overallResult, appResult] = await Promise.all([
      ch.query({ query: overallQuery, format: "JSONEachRow", query_params: params }),
      ch.query({ query: appQuery, format: "JSONEachRow", query_params: params }),
    ]);

    const overall = (await overallResult.json())[0] as HealthOverviewRow;
    const apps = (await appResult.json()) as ApplicationRow[];

    const totalTransactions = Number(overall?.total_transactions || 0);
    const errorCount = Number(overall?.error_count || 0);

    return {
      totalTransactions,
      errorRate: totalTransactions > 0 ? (errorCount / totalTransactions) * 100 : 0,
      avgLatencyMs: Number(overall?.avg_latency_ms || 0),
      p95LatencyMs: Number(overall?.p95_latency_ms || 0),
      uniqueClients: Number(overall?.unique_clients || 0),
      uniqueServers: Number(overall?.unique_servers || 0),
      applications: apps.map((app) => ({
        applicationName: app.application_name,
        totalTransactions: Number(app.total_transactions),
        errorCount: Number(app.error_count),
        avgLatencyMs: Number(app.avg_latency_ms),
        p95LatencyMs: Number(app.p95_latency_ms),
      })),
    };
  } catch (error) {
    console.error("[clickhouse] getHealthOverview error:", error);
    // Return empty data on error
    return {
      totalTransactions: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      uniqueClients: 0,
      uniqueServers: 0,
      applications: [],
    };
  }
}

/**
 * Get top client-server pairs by traffic volume
 */
export async function getTopTalkers(
  filters: QueryFilters
): Promise<TopTalkerData[]> {
  const ch = getClient();
  const { clause: whereClause, params } = buildWhereClause(filters);
  const limit = filters.limit || 10;

  // Add limit as a parameter
  const queryParams = { ...params, query_limit: limit };

  const query = `
    SELECT
      client_host_ip_address as client_ip,
      server_host_ip_address as server_ip,
      sum(total_bytes) as bytes,
      count() as request_count
    FROM f_aggregate_telemetry
    ${whereClause}
    GROUP BY client_host_ip_address, server_host_ip_address
    ORDER BY bytes DESC
    LIMIT {query_limit:UInt32}
  `;

  try {
    const result = await ch.query({ query, format: "JSONEachRow", query_params: queryParams });
    const rows = (await result.json()) as TopTalkerRow[];

    return rows.map((row) => ({
      clientIp: row.client_ip,
      serverIp: row.server_ip,
      bytes: Number(row.bytes),
      requestCount: Number(row.request_count),
    }));
  } catch (error) {
    console.error("[clickhouse] getTopTalkers error:", error);
    return [];
  }
}

/**
 * Get hourly traffic timeline
 */
export async function getTrafficTimeline(
  filters: QueryFilters
): Promise<TrafficTimelinePoint[]> {
  const ch = getClient();
  const { clause: whereClause, params } = buildWhereClause(filters);

  const query = `
    SELECT
      toStartOfHour(timestamp) as hour,
      count() as requests,
      countIf(is_error = 1) as errors
    FROM f_aggregate_telemetry
    ${whereClause}
    GROUP BY hour
    ORDER BY hour
  `;

  try {
    const result = await ch.query({ query, format: "JSONEachRow", query_params: params });
    const rows = (await result.json()) as TrafficTimelineRow[];

    return rows.map((row) => ({
      hour: row.hour,
      requests: Number(row.requests),
      errors: Number(row.errors),
    }));
  } catch (error) {
    console.error("[clickhouse] getTrafficTimeline error:", error);
    return [];
  }
}

/**
 * Close the ClickHouse client connection
 */
export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
