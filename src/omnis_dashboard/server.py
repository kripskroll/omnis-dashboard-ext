"""FastMCP server for Omnis Network Health Dashboard.

Provides interactive visualization tools for network health monitoring.
Tools render as interactive UI in MCP Apps-compatible hosts.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastmcp import FastMCP

from omnis_dashboard.data.clickhouse import (
    QueryFilters,
    get_health_overview,
    get_top_talkers,
    get_traffic_timeline,
)

# Resource URI for the health dashboard
HEALTH_DASHBOARD_RESOURCE_URI = "ui://omnis-dashboard/health-dashboard.html"

# Path to the built UI HTML file
# Works from both source and installed package
UI_HTML_PATH = Path(__file__).parent.parent.parent / "dist" / "src" / "apps" / "health-dashboard" / "mcp-app.html"

# Create the FastMCP server
mcp = FastMCP(
    "Omnis Dashboard",
    instructions="Network health monitoring dashboard with interactive visualizations",
)


# =============================================================================
# UI Resource
# =============================================================================


@mcp.resource(HEALTH_DASHBOARD_RESOURCE_URI, mime_type="text/html;profile=mcp-app")
def health_dashboard_html() -> str:
    """Serve the health dashboard HTML UI."""
    if UI_HTML_PATH.exists():
        return UI_HTML_PATH.read_text(encoding="utf-8")
    else:
        return f"""<!DOCTYPE html>
<html>
<head><title>Dashboard Not Built</title></head>
<body>
<h1>Dashboard UI Not Found</h1>
<p>The dashboard HTML file was not found at: {UI_HTML_PATH}</p>
<p>Please run <code>npm run build:ui</code> to build the UI.</p>
</body>
</html>"""


# =============================================================================
# Tools
# =============================================================================


@mcp.tool(
    description=(
        "Display an interactive network health dashboard showing overall metrics, "
        "application breakdown, top talkers, and traffic trends. "
        "Use this when the user wants to see network status, health overview, or traffic visualization."
    ),
    meta={
        "title": "Network Health Dashboard",
        "ui": {"resourceUri": HEALTH_DASHBOARD_RESOURCE_URI},
        "ui/resourceUri": HEALTH_DASHBOARD_RESOURCE_URI,  # Legacy key for compatibility
    },
)
def show_network_dashboard(
    hours: Annotated[int, "Time range in hours (1-168, default: 24)"] = 24,
    sensor_ip: Annotated[str | None, "Filter by sensor IP address"] = None,
    sensor_name: Annotated[str | None, "Filter by sensor name"] = None,
) -> str:
    """Show the network health dashboard with current data.

    This tool is visible to both LLM and UI.
    Returns a text summary for the LLM and JSON data for the UI.
    """
    # Validate hours
    hours = max(1, min(168, hours))

    filters = QueryFilters(
        hours=hours,
        sensor_ip=sensor_ip,
        sensor_name=sensor_name,
        limit=10,
    )

    # Fetch all dashboard data
    health_overview = get_health_overview(filters)
    top_talkers = get_top_talkers(filters)
    traffic_timeline = get_traffic_timeline(filters)

    # Build dashboard data for UI
    dashboard_data = {
        "healthOverview": asdict(health_overview),
        "topTalkers": [asdict(t) for t in top_talkers],
        "trafficTimeline": [asdict(t) for t in traffic_timeline],
        "filters": {
            "hours": hours,
            "sensor_ip": sensor_ip,
            "sensor_name": sensor_name,
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    # Convert application metrics to camelCase for UI compatibility
    dashboard_data["healthOverview"]["applications"] = [
        {
            "applicationName": app["application_name"],
            "totalTransactions": app["total_transactions"],
            "errorCount": app["error_count"],
            "avgLatencyMs": app["avg_latency_ms"],
            "p95LatencyMs": app["p95_latency_ms"],
        }
        for app in dashboard_data["healthOverview"]["applications"]
    ]

    # Convert top talkers to camelCase
    dashboard_data["topTalkers"] = [
        {
            "clientIp": t["client_ip"],
            "serverIp": t["server_ip"],
            "bytes": t["bytes"],
            "requestCount": t["request_count"],
        }
        for t in dashboard_data["topTalkers"]
    ]

    # Convert health overview keys to camelCase
    ho = dashboard_data["healthOverview"]
    dashboard_data["healthOverview"] = {
        "totalTransactions": ho["total_transactions"],
        "errorRate": ho["error_rate"],
        "avgLatencyMs": ho["avg_latency_ms"],
        "p95LatencyMs": ho["p95_latency_ms"],
        "uniqueClients": ho["unique_clients"],
        "uniqueServers": ho["unique_servers"],
        "applications": ho["applications"],
    }

    # Return JSON data - both UI and LLM can parse it
    return json.dumps(dashboard_data)


@mcp.tool(
    description="Refresh network health dashboard data (internal use only)",
    meta={
        "title": "Refresh Dashboard Data",
        "ui": {
            "resourceUri": HEALTH_DASHBOARD_RESOURCE_URI,
            "visibility": ["app"],  # Hidden from LLM, only callable by UI
        },
        "ui/resourceUri": HEALTH_DASHBOARD_RESOURCE_URI,  # Legacy key for compatibility
    },
)
def refresh_dashboard_data(
    hours: Annotated[int, "Time range in hours (1-168, default: 24)"] = 24,
    sensor_ip: Annotated[str | None, "Filter by sensor IP address"] = None,
    sensor_name: Annotated[str | None, "Filter by sensor name"] = None,
) -> str:
    """Refresh dashboard data for the UI.

    This tool is hidden from the LLM and only callable by the dashboard UI.
    Returns JSON data only.
    """
    # Validate hours
    hours = max(1, min(168, hours))

    filters = QueryFilters(
        hours=hours,
        sensor_ip=sensor_ip,
        sensor_name=sensor_name,
        limit=10,
    )

    # Fetch all dashboard data
    health_overview = get_health_overview(filters)
    top_talkers = get_top_talkers(filters)
    traffic_timeline = get_traffic_timeline(filters)

    # Build dashboard data
    dashboard_data = {
        "healthOverview": {
            "totalTransactions": health_overview.total_transactions,
            "errorRate": health_overview.error_rate,
            "avgLatencyMs": health_overview.avg_latency_ms,
            "p95LatencyMs": health_overview.p95_latency_ms,
            "uniqueClients": health_overview.unique_clients,
            "uniqueServers": health_overview.unique_servers,
            "applications": [
                {
                    "applicationName": app.application_name,
                    "totalTransactions": app.total_transactions,
                    "errorCount": app.error_count,
                    "avgLatencyMs": app.avg_latency_ms,
                    "p95LatencyMs": app.p95_latency_ms,
                }
                for app in health_overview.applications
            ],
        },
        "topTalkers": [
            {
                "clientIp": t.client_ip,
                "serverIp": t.server_ip,
                "bytes": t.bytes,
                "requestCount": t.request_count,
            }
            for t in top_talkers
        ],
        "trafficTimeline": [asdict(t) for t in traffic_timeline],
        "filters": {
            "hours": hours,
            "sensor_ip": sensor_ip,
            "sensor_name": sensor_name,
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    return json.dumps(dashboard_data)
