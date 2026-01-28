# Network Health Dashboard

## Overview

Interactive dashboard displaying overall network health metrics, application breakdown, top talkers, and traffic trends. This is the primary visualization tool for network operations teams to monitor infrastructure health at a glance.

## User Story

As a **Network Operations Engineer**, I want to **see a comprehensive health overview of my network** so that I can **quickly identify issues and understand traffic patterns without writing queries**.

## Data Sources

This dashboard consumes data from the same ClickHouse and Neo4j databases as `omnis-mcp-topo`. The following query patterns are required:

### Health Overview Data
```sql
-- Total transactions, errors, latency by application (24h default)
SELECT 
    application_name,
    count() as total_transactions,
    countIf(is_error = 1) as error_count,
    avg(response_time_ms) as avg_latency_ms,
    quantile(0.95)(response_time_ms) as p95_latency_ms
FROM f_aggregate_telemetry
WHERE timestamp >= now() - INTERVAL {hours} HOUR
GROUP BY application_name
ORDER BY total_transactions DESC
```

### Top Talkers Data
```sql
-- Highest volume client-server pairs
SELECT 
    client_host_ip_address,
    server_host_ip_address,
    sum(total_bytes) as bytes,
    count() as request_count
FROM f_aggregate_telemetry
WHERE timestamp >= now() - INTERVAL {hours} HOUR
GROUP BY client_host_ip_address, server_host_ip_address
ORDER BY bytes DESC
LIMIT {limit}
```

### Traffic Timeline Data
```sql
-- Hourly traffic distribution
SELECT 
    toStartOfHour(timestamp) as hour,
    count() as requests,
    countIf(is_error = 1) as errors
FROM f_aggregate_telemetry
WHERE timestamp >= now() - INTERVAL {hours} HOUR
GROUP BY hour
ORDER BY hour
```

## MCP Server Tools

### `show_network_dashboard`

**Purpose:** Display the interactive network health dashboard

**Visibility:** `["model", "app"]` (callable by LLM and UI)

**Input Schema:**
```typescript
{
  hours?: number;        // Time range in hours (default: 24, max: 168)
  sensor_ip?: string;    // Filter by sensor IP (optional)
  sensor_name?: string;  // Filter by sensor name (optional)
}
```

**Response:** JSON with health metrics + UI renders automatically

**Example LLM interaction:**
- User: "Show me the network health dashboard"
- LLM calls: `show_network_dashboard({ hours: 24 })`
- Result: Text summary + interactive UI appears

### `refresh_dashboard_data`

**Purpose:** Refresh dashboard data without full reload (for auto-refresh)

**Visibility:** `["app"]` (hidden from LLM, UI-only)

**Input Schema:**
```typescript
{
  hours?: number;
  sensor_ip?: string;
  sensor_name?: string;
}
```

**Response:** Fresh data for UI to update state

## UI Components

### 1. Header Section
- **Title:** "Network Health Dashboard"
- **Time range selector:** Dropdown with options: 1h, 6h, 24h, 7d
- **Sensor filter:** Dropdown populated from available sensors
- **Last updated:** Timestamp with relative time ("2 minutes ago")
- **Auto-refresh toggle:** Switch to enable/disable 60s refresh

### 2. Health Summary Cards (Grid: 4 columns)

#### Card: Total Transactions
- **Metric:** Large number with locale formatting (e.g., "1,234,567")
- **Delta:** Percentage change vs previous period
- **Color:** Neutral (blue/gray)

#### Card: Error Rate
- **Metric:** Percentage with 2 decimal places (e.g., "2.34%")
- **Delta:** Change vs previous period
- **Color:** 
  - Green: < 1%
  - Yellow: 1-5%
  - Red: > 5%

#### Card: Avg Latency
- **Metric:** Milliseconds (e.g., "45.2 ms")
- **Subtitle:** P95 value in smaller text
- **Color:** Based on thresholds (configurable)

#### Card: Active Endpoints
- **Metric:** Count of unique clients + servers
- **Subtitle:** "X clients, Y servers"

### 3. Application Breakdown (Left column, 60% width)

#### Chart Type: Horizontal Bar Chart (Tremor `BarList`)
- **Data:** Applications sorted by transaction count
- **Bars:** Show transaction count with percentage of total
- **Interaction:** Click bar to filter dashboard by application
- **Colors:** Consistent palette per application

#### Alternative View: Donut Chart (Tremor `DonutChart`)
- Toggle between bar and donut views
- Center text: Total transaction count

### 4. Top Talkers Table (Right column, 40% width)

#### Table Columns:
| Column | Type | Sortable |
|--------|------|----------|
| Client IP | string | yes |
| Server IP | string | yes |
| Traffic | bytes (formatted) | yes (default) |
| Requests | number | yes |

#### Features:
- Sortable columns (click header)
- Pagination (10 rows per page)
- Row click: Could expand to show connection details (future)
- Traffic formatting: "1.2 GB", "456 MB", etc.

### 5. Traffic Timeline (Full width, bottom)

#### Chart Type: Area Chart (Tremor `AreaChart`)
- **X-axis:** Time (hourly buckets)
- **Y-axis (primary):** Request count
- **Y-axis (secondary):** Error count (different color, optional)
- **Interaction:** Hover shows tooltip with exact values
- **Colors:** 
  - Requests: Blue gradient fill
  - Errors: Red line overlay

#### Features:
- Smooth curves (curveType: "natural")
- Responsive width
- Legend showing series names

## Visual Design

### Theme Integration
- Use `applyDocumentTheme()` from ext-apps SDK
- Respect host's light/dark mode preference
- Tremor handles dark mode automatically with proper setup

### Color Palette (Tremor defaults)
```typescript
const colors = {
  primary: "blue",
  success: "emerald", 
  warning: "amber",
  error: "rose",
  neutral: "slate"
};
```

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Title | Time Range | Sensor Filter | Auto-refresh  │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│ │  Total  │ │  Error  │ │   Avg   │ │ Active  │           │
│ │  Trans  │ │  Rate   │ │ Latency │ │Endpoints│           │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
├─────────────────────────────────┬───────────────────────────┤
│                                 │                           │
│   Application Breakdown         │   Top Talkers Table       │
│   (Bar Chart)                   │                           │
│                                 │                           │
├─────────────────────────────────┴───────────────────────────┤
│                                                             │
│   Traffic Timeline (Area Chart)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Responsive Behavior
- Cards: Stack to 2x2 grid on medium screens, 1 column on mobile
- Application/Talkers: Stack vertically on smaller screens
- Timeline: Full width always, reduces height on mobile

## Interactions

### Time Range Change
1. User selects new time range from dropdown
2. UI calls `refresh_dashboard_data({ hours: newValue })`
3. All components update with new data
4. "Last updated" timestamp refreshes

### Sensor Filter
1. User selects sensor from dropdown
2. UI calls `refresh_dashboard_data({ sensor_ip: selected })`
3. All data filtered to that sensor
4. Clear filter option to reset

### Auto-Refresh
1. User toggles auto-refresh ON
2. UI sets 60-second interval
3. Each tick calls `refresh_dashboard_data()`
4. UI updates without full reload
5. Toggle OFF clears interval

### Error States
- **Loading:** Skeleton loaders for each component
- **No data:** Friendly message "No data for selected time range"
- **API error:** Toast notification with retry button
- **Partial failure:** Show available data, indicate missing sections

## Acceptance Criteria

### Functional
- [ ] Dashboard loads and displays all 4 KPI cards with real data
- [ ] Application breakdown chart renders with correct data
- [ ] Top talkers table is sortable and paginated
- [ ] Traffic timeline shows hourly data correctly
- [ ] Time range selector updates all components
- [ ] Sensor filter works correctly
- [ ] Auto-refresh updates data every 60 seconds when enabled
- [ ] Error states are handled gracefully

### Performance
- [ ] Initial load completes within 3 seconds
- [ ] Data refresh completes within 2 seconds
- [ ] UI remains responsive during data fetching
- [ ] Charts animate smoothly

### UX/Design
- [ ] Dark mode works correctly (follows host theme)
- [ ] Layout is responsive on different screen sizes
- [ ] Loading states provide visual feedback
- [ ] Numbers are formatted for readability (locale, abbreviations)

### Integration
- [ ] Tool appears correctly in MCP host tool list
- [ ] LLM can invoke `show_network_dashboard` naturally
- [ ] UI receives tool data via `toolInputs` correctly
- [ ] `callServerTool` works for refresh operations
- [ ] Text fallback is meaningful when UI not available

## Future Enhancements (Out of Scope for v1)

- Drill-down to application details
- Custom time range picker
- Export data to CSV
- Alerting thresholds configuration
- Comparison with previous period overlay
- Host details on click (link to topology view)
