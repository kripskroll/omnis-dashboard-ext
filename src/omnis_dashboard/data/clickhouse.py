"""ClickHouse data access layer for network telemetry.

Provides functions to query network telemetry data from ClickHouse.
Uses clickhouse-connect library with read-only enforcement.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import clickhouse_connect
from clickhouse_connect.driver.client import Client

from omnis_dashboard.config import settings


# =============================================================================
# Types
# =============================================================================


@dataclass
class QueryFilters:
    """Filter parameters for ClickHouse queries."""

    hours: int = 24
    sensor_ip: str | None = None
    sensor_name: str | None = None
    limit: int = 10


@dataclass
class ApplicationMetrics:
    """Per-application metrics."""

    application_name: str
    total_transactions: int
    error_count: int
    avg_latency_ms: float
    p95_latency_ms: float


@dataclass
class HealthOverviewData:
    """Overall health metrics and per-application breakdown."""

    total_transactions: int
    error_rate: float
    avg_latency_ms: float
    p95_latency_ms: float
    unique_clients: int
    unique_servers: int
    applications: list[ApplicationMetrics]


@dataclass
class TopTalkerData:
    """Top client-server traffic pair."""

    client_ip: str
    server_ip: str
    bytes: int
    request_count: int


@dataclass
class TrafficTimelinePoint:
    """Hourly traffic data point."""

    hour: str
    requests: int
    errors: int


@dataclass
class ApplicationDetailData:
    """Detailed metrics for a specific application."""

    application_name: str
    total_transactions: int
    error_count: int
    error_rate: float
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    total_bytes: int
    unique_clients: int
    unique_servers: int


@dataclass
class TopClientData:
    """Top client for an application."""

    client_ip: str
    transactions: int
    errors: int
    bytes: int


@dataclass
class TopServerData:
    """Top server for an application."""

    server_ip: str
    server_port: int
    transactions: int
    avg_latency_ms: float


# =============================================================================
# Client Management
# =============================================================================


class ClickHouseClient:
    """ClickHouse HTTP client wrapper with read-only enforcement."""

    _client: Client | None = None

    @classmethod
    def get_client(cls) -> Client:
        """Get or create the ClickHouse client singleton."""
        if cls._client is None:
            # Parse URL to extract host and port
            url = settings.clickhouse_url
            if url.startswith("http://"):
                url = url[7:]
            elif url.startswith("https://"):
                url = url[8:]

            host = url.split(":")[0] if ":" in url else url
            port = int(url.split(":")[1]) if ":" in url else 8123

            cls._client = clickhouse_connect.get_client(
                host=host,
                port=port,
                username=settings.clickhouse_username,
                password=settings.clickhouse_password,
                database=settings.clickhouse_database,
                settings={"readonly": 1},
            )
        return cls._client

    @classmethod
    def query(cls, sql: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Execute a query and return results as list of dicts."""
        client = cls.get_client()
        result = client.query(sql, parameters=parameters)
        return list(result.named_results())

    @classmethod
    def close(cls) -> None:
        """Close the client connection."""
        if cls._client is not None:
            cls._client.close()
            cls._client = None


# =============================================================================
# Query Helpers
# =============================================================================


def _build_where_clause(filters: QueryFilters) -> tuple[str, dict[str, Any]]:
    """Build a parameterized WHERE clause.

    Returns tuple of (clause_string, parameters_dict).
    Uses ClickHouse's {param:Type} syntax for safe parameter binding.
    """
    conditions: list[str] = []
    params: dict[str, Any] = {}

    # Time filter (always applied) - using cal_timestamp_time
    params["filter_hours"] = filters.hours
    conditions.append("cal_timestamp_time >= now() - INTERVAL {filter_hours:UInt32} HOUR")

    if filters.sensor_ip:
        params["filter_sensor_ip"] = filters.sensor_ip
        conditions.append("device_ip_address = {filter_sensor_ip:String}")

    if filters.sensor_name:
        params["filter_sensor_name"] = filters.sensor_name
        conditions.append("device_name = {filter_sensor_name:String}")

    clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    return clause, params


# =============================================================================
# Query Functions
# =============================================================================


def get_health_overview(filters: QueryFilters) -> HealthOverviewData:
    """Get overall health metrics and per-application breakdown."""
    where_clause, params = _build_where_clause(filters)

    # Query for overall metrics
    # Using actual column names from f_aggregate_telemetry schema
    overall_query = f"""
        SELECT
            sum(agt_successful_transactions_count + agt_failed_transactions_count) as total_transactions,
            sum(agt_failed_transactions_count) as error_count,
            sum(agt_total_response_time) / nullIf(sum(agt_successful_transactions_count + agt_failed_transactions_count), 0) / 1000 as avg_latency_ms,
            quantile(0.95)(agt_peak_response_time_usec / 1000) as p95_latency_ms,
            uniq(client_host_ip_address) as unique_clients,
            uniq(server_host_ip_address) as unique_servers
        FROM f_aggregate_telemetry
        {where_clause}
    """

    # Query for per-application metrics
    app_query = f"""
        SELECT
            application_name,
            sum(agt_successful_transactions_count + agt_failed_transactions_count) as total_transactions,
            sum(agt_failed_transactions_count) as error_count,
            sum(agt_total_response_time) / nullIf(sum(agt_successful_transactions_count + agt_failed_transactions_count), 0) / 1000 as avg_latency_ms,
            quantile(0.95)(agt_peak_response_time_usec / 1000) as p95_latency_ms
        FROM f_aggregate_telemetry
        {where_clause}
        GROUP BY application_name
        ORDER BY total_transactions DESC
        LIMIT 20
    """

    try:
        overall_results = ClickHouseClient.query(overall_query, params)
        app_results = ClickHouseClient.query(app_query, params)

        overall = overall_results[0] if overall_results else {}
        total_transactions = int(overall.get("total_transactions", 0))
        error_count = int(overall.get("error_count", 0))

        applications = [
            ApplicationMetrics(
                application_name=str(app.get("application_name", "")),
                total_transactions=int(app.get("total_transactions", 0)),
                error_count=int(app.get("error_count", 0)),
                avg_latency_ms=float(app.get("avg_latency_ms", 0)),
                p95_latency_ms=float(app.get("p95_latency_ms", 0)),
            )
            for app in app_results
        ]

        return HealthOverviewData(
            total_transactions=total_transactions,
            error_rate=(error_count / total_transactions * 100) if total_transactions > 0 else 0,
            avg_latency_ms=float(overall.get("avg_latency_ms", 0)),
            p95_latency_ms=float(overall.get("p95_latency_ms", 0)),
            unique_clients=int(overall.get("unique_clients", 0)),
            unique_servers=int(overall.get("unique_servers", 0)),
            applications=applications,
        )
    except Exception as e:
        print(f"[clickhouse] get_health_overview error: {e}")
        return HealthOverviewData(
            total_transactions=0,
            error_rate=0,
            avg_latency_ms=0,
            p95_latency_ms=0,
            unique_clients=0,
            unique_servers=0,
            applications=[],
        )


def get_top_talkers(filters: QueryFilters) -> list[TopTalkerData]:
    """Get top client-server pairs by traffic volume."""
    where_clause, params = _build_where_clause(filters)
    params["query_limit"] = filters.limit

    # Using actual column names: agt_to_server_octets_count + agt_from_server_octets_count for bytes
    query = f"""
        SELECT
            client_host_ip_address as client_ip,
            server_host_ip_address as server_ip,
            sum(agt_to_server_octets_count + agt_from_server_octets_count) as bytes,
            sum(agt_successful_transactions_count + agt_failed_transactions_count) as request_count
        FROM f_aggregate_telemetry
        {where_clause}
        GROUP BY client_host_ip_address, server_host_ip_address
        ORDER BY bytes DESC
        LIMIT {{query_limit:UInt32}}
    """

    try:
        results = ClickHouseClient.query(query, params)
        return [
            TopTalkerData(
                client_ip=str(row.get("client_ip", "")),
                server_ip=str(row.get("server_ip", "")),
                bytes=int(row.get("bytes", 0)),
                request_count=int(row.get("request_count", 0)),
            )
            for row in results
        ]
    except Exception as e:
        print(f"[clickhouse] get_top_talkers error: {e}")
        return []


def get_traffic_timeline(filters: QueryFilters) -> list[TrafficTimelinePoint]:
    """Get hourly traffic timeline."""
    where_clause, params = _build_where_clause(filters)

    # Using actual column names: cal_timestamp_time for timestamp
    query = f"""
        SELECT
            toStartOfHour(cal_timestamp_time) as hour,
            sum(agt_successful_transactions_count + agt_failed_transactions_count) as requests,
            sum(agt_failed_transactions_count) as errors
        FROM f_aggregate_telemetry
        {where_clause}
        GROUP BY hour
        ORDER BY hour
    """

    try:
        results = ClickHouseClient.query(query, params)
        return [
            TrafficTimelinePoint(
                hour=str(row.get("hour", "")),
                requests=int(row.get("requests", 0)),
                errors=int(row.get("errors", 0)),
            )
            for row in results
        ]
    except Exception as e:
        print(f"[clickhouse] get_traffic_timeline error: {e}")
        return []


def get_application_details(
    filters: QueryFilters, application_name: str
) -> tuple[ApplicationDetailData, list[TopClientData], list[TopServerData], list[TrafficTimelinePoint]]:
    """Get detailed metrics for a specific application.

    Returns:
        Tuple of (overview, top_clients, top_servers, timeline)
    """
    where_clause, params = _build_where_clause(filters)
    params["app_name"] = application_name

    # Add application filter to where clause
    app_where = f"{where_clause} AND application_name = {{app_name:String}}"

    # Overall metrics for this application
    overview_query = f"""
        SELECT
            sum(agt_successful_transactions_count + agt_failed_transactions_count) as total_transactions,
            sum(agt_failed_transactions_count) as error_count,
            sum(agt_total_response_time) / nullIf(sum(agt_successful_transactions_count + agt_failed_transactions_count), 0) / 1000 as avg_latency_ms,
            quantile(0.50)(agt_peak_response_time_usec / 1000) as p50_latency_ms,
            quantile(0.95)(agt_peak_response_time_usec / 1000) as p95_latency_ms,
            quantile(0.99)(agt_peak_response_time_usec / 1000) as p99_latency_ms,
            sum(agt_to_server_octets_count + agt_from_server_octets_count) as total_bytes,
            uniq(client_host_ip_address) as unique_clients,
            uniq(server_host_ip_address) as unique_servers
        FROM f_aggregate_telemetry
        {app_where}
    """

    # Top clients
    params["client_limit"] = filters.limit
    clients_query = f"""
        SELECT
            client_host_ip_address as client_ip,
            sum(agt_successful_transactions_count + agt_failed_transactions_count) as transactions,
            sum(agt_failed_transactions_count) as errors,
            sum(agt_to_server_octets_count + agt_from_server_octets_count) as bytes
        FROM f_aggregate_telemetry
        {app_where}
        GROUP BY client_host_ip_address
        ORDER BY transactions DESC
        LIMIT {{client_limit:UInt32}}
    """

    # Top servers
    params["server_limit"] = filters.limit
    servers_query = f"""
        SELECT
            server_host_ip_address as server_ip,
            server_port,
            sum(agt_successful_transactions_count + agt_failed_transactions_count) as transactions,
            sum(agt_total_response_time) / nullIf(sum(agt_successful_transactions_count + agt_failed_transactions_count), 0) / 1000 as avg_latency_ms
        FROM f_aggregate_telemetry
        {app_where}
        GROUP BY server_host_ip_address, server_port
        ORDER BY transactions DESC
        LIMIT {{server_limit:UInt32}}
    """

    # Traffic timeline for this application
    timeline_query = f"""
        SELECT
            toStartOfHour(cal_timestamp_time) as hour,
            sum(agt_successful_transactions_count + agt_failed_transactions_count) as requests,
            sum(agt_failed_transactions_count) as errors
        FROM f_aggregate_telemetry
        {app_where}
        GROUP BY hour
        ORDER BY hour
    """

    try:
        overview_results = ClickHouseClient.query(overview_query, params)
        clients_results = ClickHouseClient.query(clients_query, params)
        servers_results = ClickHouseClient.query(servers_query, params)
        timeline_results = ClickHouseClient.query(timeline_query, params)

        # Parse overview
        overview = overview_results[0] if overview_results else {}
        total_transactions = int(overview.get("total_transactions", 0))
        error_count = int(overview.get("error_count", 0))

        overview_data = ApplicationDetailData(
            application_name=application_name,
            total_transactions=total_transactions,
            error_count=error_count,
            error_rate=(error_count / total_transactions * 100) if total_transactions > 0 else 0,
            avg_latency_ms=float(overview.get("avg_latency_ms", 0) or 0),
            p50_latency_ms=float(overview.get("p50_latency_ms", 0) or 0),
            p95_latency_ms=float(overview.get("p95_latency_ms", 0) or 0),
            p99_latency_ms=float(overview.get("p99_latency_ms", 0) or 0),
            total_bytes=int(overview.get("total_bytes", 0)),
            unique_clients=int(overview.get("unique_clients", 0)),
            unique_servers=int(overview.get("unique_servers", 0)),
        )

        # Parse top clients
        top_clients = [
            TopClientData(
                client_ip=str(row.get("client_ip", "")),
                transactions=int(row.get("transactions", 0)),
                errors=int(row.get("errors", 0)),
                bytes=int(row.get("bytes", 0)),
            )
            for row in clients_results
        ]

        # Parse top servers
        top_servers = [
            TopServerData(
                server_ip=str(row.get("server_ip", "")),
                server_port=int(row.get("server_port", 0)),
                transactions=int(row.get("transactions", 0)),
                avg_latency_ms=float(row.get("avg_latency_ms", 0) or 0),
            )
            for row in servers_results
        ]

        # Parse timeline
        timeline = [
            TrafficTimelinePoint(
                hour=str(row.get("hour", "")),
                requests=int(row.get("requests", 0)),
                errors=int(row.get("errors", 0)),
            )
            for row in timeline_results
        ]

        return overview_data, top_clients, top_servers, timeline

    except Exception as e:
        print(f"[clickhouse] get_application_details error: {e}")
        return (
            ApplicationDetailData(
                application_name=application_name,
                total_transactions=0,
                error_count=0,
                error_rate=0,
                avg_latency_ms=0,
                p50_latency_ms=0,
                p95_latency_ms=0,
                p99_latency_ms=0,
                total_bytes=0,
                unique_clients=0,
                unique_servers=0,
            ),
            [],
            [],
            [],
        )
