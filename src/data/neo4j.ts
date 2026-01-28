/**
 * Neo4j Data Access Layer
 *
 * Provides functions to query network topology data from Neo4j.
 * Used for topology visualizations and path finding.
 *
 * Note: Not used for initial Health Dashboard. Reserved for future Topology Visualizer.
 */
import neo4j, { Driver, Session } from "neo4j-driver";

// =============================================================================
// Types
// =============================================================================

export interface HostNode {
  ip: string;
  hostname?: string;
  site?: string;
}

export interface Connection {
  sourceIp: string;
  targetIp: string;
  applications: string[];
  bytesTransferred: number;
}

// =============================================================================
// Client Management
// =============================================================================

let driver: Driver | null = null;

function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
    const username = process.env.NEO4J_USERNAME || "neo4j";
    const password = process.env.NEO4J_PASSWORD || "";

    driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
    });
  }
  return driver;
}

function getSession(): Session {
  return getDriver().session({ database: "neo4j" });
}

// =============================================================================
// Query Functions (Stubs for future implementation)
// =============================================================================

/**
 * Get all hosts in the topology
 */
export async function getHosts(): Promise<HostNode[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (h:Host)
      RETURN h.ip as ip, h.hostname as hostname, h.site as site
      LIMIT 1000
    `);

    return result.records.map((record) => ({
      ip: record.get("ip"),
      hostname: record.get("hostname"),
      site: record.get("site"),
    }));
  } finally {
    await session.close();
  }
}

/**
 * Get connections between hosts
 */
export async function getConnections(limit: number = 500): Promise<Connection[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
      MATCH (c:Host)-[r:TALKS_TO]->(s:Host)
      RETURN c.ip as sourceIp, s.ip as targetIp, r.applications as applications, r.bytesTransferred as bytes
      LIMIT $limit
    `,
      { limit: neo4j.int(limit) }
    );

    return result.records.map((record) => ({
      sourceIp: record.get("sourceIp"),
      targetIp: record.get("targetIp"),
      applications: record.get("applications") || [],
      bytesTransferred: record.get("bytes")?.toNumber() || 0,
    }));
  } finally {
    await session.close();
  }
}

/**
 * Find shortest path between two hosts
 */
export async function findShortestPath(
  fromIp: string,
  toIp: string
): Promise<string[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
      MATCH p = shortestPath((a:Host {ip: $fromIp})-[*]-(b:Host {ip: $toIp}))
      RETURN [n IN nodes(p) | n.ip] as path
    `,
      { fromIp, toIp }
    );

    if (result.records.length === 0) {
      return [];
    }

    return result.records[0].get("path");
  } finally {
    await session.close();
  }
}

/**
 * Close the Neo4j driver connection
 */
export async function closeConnection(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
