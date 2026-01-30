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
    get_application_details,
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


def _format_number(num: int) -> str:
    """Format a number with commas for thousands."""
    if num >= 1_000_000:
        return f"{num / 1_000_000:.1f}M"
    if num >= 1_000:
        return f"{num / 1_000:.1f}K"
    return str(num)


@mcp.tool(
    description=(
        "Display an interactive network health dashboard showing overall metrics, "
        "application breakdown, top talkers, and traffic trends. "
        "Use this when the user wants to see network status, health overview, or traffic visualization."
    ),
    meta={
        "title": "Network Health Dashboard",
        "ui": {
            "resourceUri": HEALTH_DASHBOARD_RESOURCE_URI,
            "mcpui.dev/ui-preferred-frame-size": ["100%", "1200px"],
        },
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
    Returns a text summary for the LLM conversation.
    The UI calls refresh_dashboard_data to get full JSON data.
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

    # Build text summary for LLM conversation
    time_range = f"last {hours} hour{'s' if hours != 1 else ''}"

    # Calculate total errors for error count display
    total_errors = sum(app.error_count for app in health_overview.applications)

    lines = [
        f"Network Health Dashboard ({time_range})",
        "",
        "Overview:",
        f"- Total Transactions: {_format_number(health_overview.total_transactions)}",
        f"- Error Rate: {health_overview.error_rate:.2f}% ({_format_number(total_errors)} errors)",
        f"- Avg Latency: {health_overview.avg_latency_ms:.1f}ms (P95: {health_overview.p95_latency_ms:.1f}ms)",
        f"- Unique Clients: {health_overview.unique_clients} | Servers: {health_overview.unique_servers}",
        "",
    ]

    # Top applications by transaction volume
    if health_overview.applications:
        lines.append("Top Applications:")
        for i, app in enumerate(health_overview.applications[:5], 1):
            error_pct = (
                (app.error_count / app.total_transactions * 100)
                if app.total_transactions > 0
                else 0
            )
            lines.append(
                f"{i}. {app.application_name} - "
                f"{_format_number(app.total_transactions)} transactions, "
                f"{error_pct:.1f}% errors"
            )
        lines.append("")

    # Top talkers summary
    if top_talkers:
        lines.append("Top Talkers (by traffic):")
        for i, talker in enumerate(top_talkers[:3], 1):
            bytes_str = _format_bytes(talker.bytes)
            lines.append(f"{i}. {talker.client_ip} → {talker.server_ip}: {bytes_str}")
        lines.append("")

    lines.append("The interactive dashboard is displayed above with traffic trends and detailed breakdowns.")

    return "\n".join(lines)


def _format_bytes(num_bytes: int) -> str:
    """Format bytes into human-readable string."""
    if num_bytes >= 1_000_000_000:
        return f"{num_bytes / 1_000_000_000:.1f} GB"
    if num_bytes >= 1_000_000:
        return f"{num_bytes / 1_000_000:.1f} MB"
    if num_bytes >= 1_000:
        return f"{num_bytes / 1_000:.1f} KB"
    return f"{num_bytes} B"


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


@mcp.tool(
    description="Get detailed metrics for a specific application (internal use only)",
    meta={
        "title": "Application Details",
        "ui": {
            "resourceUri": HEALTH_DASHBOARD_RESOURCE_URI,
            "visibility": ["app"],  # Hidden from LLM, only callable by UI
        },
        "ui/resourceUri": HEALTH_DASHBOARD_RESOURCE_URI,
    },
)
def get_application_details_tool(
    application_name: Annotated[str, "Application name to get details for"],
    hours: Annotated[int, "Time range in hours (1-168, default: 24)"] = 24,
    sensor_ip: Annotated[str | None, "Filter by sensor IP address"] = None,
    sensor_name: Annotated[str | None, "Filter by sensor name"] = None,
) -> str:
    """Get detailed metrics for a specific application.

    This tool is hidden from the LLM and only callable by the dashboard UI.
    Returns JSON data with overview, top clients, top servers, and timeline.
    """
    # Validate hours
    hours = max(1, min(168, hours))

    filters = QueryFilters(
        hours=hours,
        sensor_ip=sensor_ip,
        sensor_name=sensor_name,
        limit=10,
    )

    # Fetch application details
    overview, top_clients, top_servers, timeline = get_application_details(
        filters, application_name
    )

    # Build response data
    response_data = {
        "overview": {
            "applicationName": overview.application_name,
            "totalTransactions": overview.total_transactions,
            "errorCount": overview.error_count,
            "errorRate": overview.error_rate,
            "avgLatencyMs": overview.avg_latency_ms,
            "p50LatencyMs": overview.p50_latency_ms,
            "p95LatencyMs": overview.p95_latency_ms,
            "p99LatencyMs": overview.p99_latency_ms,
            "totalBytes": overview.total_bytes,
            "uniqueClients": overview.unique_clients,
            "uniqueServers": overview.unique_servers,
        },
        "topClients": [
            {
                "clientIp": c.client_ip,
                "transactions": c.transactions,
                "errors": c.errors,
                "bytes": c.bytes,
            }
            for c in top_clients
        ],
        "topServers": [
            {
                "serverIp": s.server_ip,
                "serverPort": s.server_port,
                "transactions": s.transactions,
                "avgLatencyMs": s.avg_latency_ms,
            }
            for s in top_servers
        ],
        "timeline": [
            {
                "hour": t.hour,
                "requests": t.requests,
                "errors": t.errors,
            }
            for t in timeline
        ],
        "filters": {
            "hours": hours,
            "sensor_ip": sensor_ip,
            "sensor_name": sensor_name,
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    return json.dumps(response_data)
