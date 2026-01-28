/**
 * Omnis Dashboard MCP Server
 *
 * Provides interactive visualization tools for network health monitoring.
 * Tools render as interactive UI in MCP Apps-compatible hosts.
 */
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getHealthOverview, getTopTalkers, getTrafficTimeline } from "./data/clickhouse.js";

// Works both from source (server.ts) and compiled (dist/server.js)
const DIST_DIR = import.meta.filename?.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

// Resource URIs
const HEALTH_DASHBOARD_RESOURCE_URI = "ui://omnis-dashboard/health-dashboard.html";

/**
 * Creates a new MCP server instance with tools and resources registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "Omnis Dashboard",
    version: "0.1.0",
  });

  // ==========================================================================
  // UI Resource Registration
  // ==========================================================================

  // Register the Health Dashboard UI resource
  registerAppResource(
    server,
    HEALTH_DASHBOARD_RESOURCE_URI,
    HEALTH_DASHBOARD_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8"
      );
      return {
        contents: [
          {
            uri: HEALTH_DASHBOARD_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
          },
        ],
      };
    }
  );

  // ==========================================================================
  // Tool Registration
  // ==========================================================================

  /**
   * show_network_dashboard - Main dashboard tool
   * Visible to both LLM and UI
   */
  registerAppTool(
    server,
    "show_network_dashboard",
    {
      title: "Network Health Dashboard",
      description:
        "Display an interactive network health dashboard showing overall metrics, " +
        "application breakdown, top talkers, and traffic trends. " +
        "Use this when the user wants to see network status, health overview, or traffic visualization.",
      inputSchema: {
        hours: z
          .number()
          .min(1)
          .max(168)
          .optional()
          .default(24)
          .describe("Time range in hours (1-168, default: 24)"),
        sensor_ip: z
          .string()
          .optional()
          .describe("Filter by sensor IP address"),
        sensor_name: z
          .string()
          .optional()
          .describe("Filter by sensor name"),
      },
      _meta: {
        ui: { resourceUri: HEALTH_DASHBOARD_RESOURCE_URI },
      },
    },
    async ({ hours, sensor_ip, sensor_name }): Promise<CallToolResult> => {
      try {
        // Fetch all dashboard data
        const [healthOverview, topTalkers, trafficTimeline] = await Promise.all([
          getHealthOverview({ hours, sensor_ip, sensor_name }),
          getTopTalkers({ hours, sensor_ip, sensor_name, limit: 10 }),
          getTrafficTimeline({ hours, sensor_ip, sensor_name }),
        ]);

        const dashboardData = {
          healthOverview,
          topTalkers,
          trafficTimeline,
          filters: { hours, sensor_ip, sensor_name },
          generatedAt: new Date().toISOString(),
        };

        // Text summary for LLM / non-UI hosts
        const totalTransactions = healthOverview.totalTransactions || 0;
        const errorRate = healthOverview.errorRate || 0;
        const avgLatency = healthOverview.avgLatencyMs || 0;

        const textSummary = [
          `Network Health Summary (last ${hours} hours):`,
          `- Total Transactions: ${totalTransactions.toLocaleString()}`,
          `- Error Rate: ${errorRate.toFixed(2)}%`,
          `- Avg Latency: ${avgLatency.toFixed(1)}ms`,
          `- Applications: ${healthOverview.applications?.length || 0}`,
          `- Top Talker: ${topTalkers[0]?.clientIp || "N/A"} → ${topTalkers[0]?.serverIp || "N/A"}`,
        ].join("\n");

        return {
          content: [
            { type: "text", text: textSummary },
            { type: "text", text: JSON.stringify(dashboardData) },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text",
              text: `Error fetching dashboard data: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * refresh_dashboard_data - App-only tool for UI refresh
   * Hidden from LLM, callable only by the dashboard UI
   */
  registerAppTool(
    server,
    "refresh_dashboard_data",
    {
      title: "Refresh Dashboard Data",
      description: "Refresh network health dashboard data (internal use only)",
      inputSchema: {
        hours: z.number().min(1).max(168).optional().default(24),
        sensor_ip: z.string().optional(),
        sensor_name: z.string().optional(),
      },
      _meta: {
        ui: {
          resourceUri: HEALTH_DASHBOARD_RESOURCE_URI,
          visibility: ["app"], // Hidden from LLM
        },
      },
    },
    async ({ hours, sensor_ip, sensor_name }): Promise<CallToolResult> => {
      try {
        const [healthOverview, topTalkers, trafficTimeline] = await Promise.all([
          getHealthOverview({ hours, sensor_ip, sensor_name }),
          getTopTalkers({ hours, sensor_ip, sensor_name, limit: 10 }),
          getTrafficTimeline({ hours, sensor_ip, sensor_name }),
        ]);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                healthOverview,
                topTalkers,
                trafficTimeline,
                filters: { hours, sensor_ip, sensor_name },
                generatedAt: new Date().toISOString(),
              }),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text", text: `Refresh error: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
