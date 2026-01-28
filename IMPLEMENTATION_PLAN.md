# Implementation Plan

> Updated: 2026-01-28 - Security fix and code quality improvements completed

## Summary

The Network Health Dashboard MCP ext-app is approximately 70% complete. Core functionality is working but several spec requirements remain unimplemented, along with a critical security issue.

---

## Incomplete Items (by Priority)

### P0 - Security (Critical)

- [x] **SQL injection vulnerability in clickhouse.ts:85-91** - COMPLETED
  - Fixed: `sensor_ip` and `sensor_name` are now safely parameterized using ClickHouse's `{param:Type}` syntax
  - File: `/home/stef/omnis-dashboard-ext/src/data/clickhouse.ts`
  - Implementation: Updated `buildWhereClause()` function to use query_params for all user-supplied values
  - All query functions updated to use `query_params` for safe parameter binding

### P1 - Core Functionality Missing

- [ ] **Sensor filter dropdown in header**
  - Spec requires: "Sensor filter: Dropdown populated from available sensors"
  - Tool `show_network_dashboard` supports `sensor_ip` and `sensor_name` parameters
  - UI currently has no sensor filter dropdown
  - File: `/home/stef/omnis-dashboard-ext/src/apps/health-dashboard/src/App.tsx`

- [ ] **Top talkers table missing "Requests" column**
  - Spec requires 4 columns: Client IP, Server IP, Traffic, Requests
  - Current implementation only shows 3 columns (missing Requests)
  - Data already includes `requestCount` field
  - File: `/home/stef/omnis-dashboard-ext/src/apps/health-dashboard/src/App.tsx` lines 338-356

- [ ] **Top talkers table pagination**
  - Spec requires: "Pagination (10 rows per page)"
  - Current implementation hardcoded to show only 5 rows with no pagination
  - Line 347: `data.topTalkers.slice(0, 5)`
  - Server already fetches 10 rows (limit: 10 in server.ts)

- [ ] **Top talkers table sortable columns**
  - Spec requires: "Sortable columns (click header)"
  - Current implementation has no sorting functionality
  - Need to add sort state and click handlers to table headers

### P2 - Enhanced Features

- [ ] **Delta/comparison metrics for Total Transactions card**
  - Spec requires: "Percentage change vs previous period"
  - Current card shows static count without comparison
  - Requires additional ClickHouse query to fetch previous period data
  - May also apply to Error Rate card per spec

- [ ] **Application breakdown: toggle between BarList and DonutChart**
  - Spec requires: "Toggle between bar and donut views"
  - Current implementation only shows BarList
  - Need to add toggle button and DonutChart component

- [ ] **Application breakdown: click interaction to filter dashboard**
  - Spec requires: "Click bar to filter dashboard by application"
  - Current BarList has no click handlers
  - Would need to add application filter state and refresh logic

### P3 - Error Handling & Polish

- [ ] **Error boundaries in React**
  - No React error boundaries implemented
  - Uncaught errors will crash the entire UI

- [ ] **Toast notifications for errors**
  - Spec requires: "API error: Toast notification with retry button"
  - Current error handling only logs to console or shows static error card

- [ ] **Retry logic for failed requests**
  - Spec requires retry functionality
  - Current implementation has no retry mechanism

- [ ] **HTTP transport implementation**
  - `main.ts:45` has TODO comment
  - POST /mcp returns 501 Not Implemented
  - Required for non-stdio MCP host integration

### P4 - Code Quality

- [x] **Replace `as any` casts in clickhouse.ts with proper types** - PARTIALLY COMPLETED
  - Replaced `as any` casts with proper types: `HealthOverviewRow`, `ApplicationRow`, `TopTalkerRow`, `TrafficTimelineRow`
  - File: `/home/stef/omnis-dashboard-ext/src/data/clickhouse.ts`
  - All query result types now properly typed and cast-safe

- [ ] **Add tests**
  - Vitest is configured but no test files exist
  - Need unit tests for data layer and component tests for UI

- [ ] **Initialize git repository**
  - Project directory is not a git repository
  - Run `git init` and create initial commit

---

## Discovered Issues

### UI/UX Gaps
1. **Missing Sensor Filter**: Header has time range selector and auto-refresh but no sensor filter dropdown despite spec requirement.
2. **Incomplete Table**: Top talkers table is missing the Requests column and shows only 5 of 10 available rows.
3. **No Sorting**: Table headers are not clickable for sorting.
4. **No Delta Metrics**: Health cards show absolute values without comparison to previous period.

### Code Quality
5. **No Tests**: Zero test coverage despite vitest being configured.
6. **Incomplete HTTP Transport**: HTTP mode returns 501 for all MCP requests.

---

## Completed Items

### Phase 1: Project Foundation

#### 1.1 Initialize Project Structure
- [x] Create package.json with all required dependencies
- [x] Configure TypeScript (tsconfig.json, tsconfig.server.json)
- [x] Configure Vite with vite-plugin-singlefile
- [x] Configure Tailwind CSS for Tremor
- [x] Create .env.example with required environment variables

#### 1.2 Data Access Layer
- [x] Create `src/data/clickhouse.ts` with connection handling
- [x] Create `src/data/neo4j.ts` with connection handling
- [x] Implement health overview query function
- [x] Implement top talkers query function
- [x] Implement traffic timeline query function
- [x] Add error handling and logging
- [x] Create TypeScript types for all data structures

### Phase 2: MCP Server Implementation

#### 2.1 Server Core
- [x] Create `src/server.ts` with McpServer initialization
- [x] Set up server metadata (name: "Omnis Dashboard", version: "0.1.0")
- [x] Configure stdio transport in `src/main.ts`

#### 2.2 Tool Registration
- [x] Register `show_network_dashboard` tool with UI resource link
- [x] Register `refresh_dashboard_data` tool (app-only visibility)
- [x] Implement tool handlers that call data layer
- [x] Add input validation with Zod schemas
- [x] Ensure text fallback in responses

#### 2.3 Resource Registration
- [x] Register UI resource at `ui://omnis-dashboard/health-dashboard.html`
- [x] Implement resource handler to serve bundled HTML

### Phase 3: Dashboard UI Implementation

#### 3.1 App Shell
- [x] Create `src/apps/health-dashboard/mcp-app.html` entry point
- [x] Create `src/apps/health-dashboard/src/App.tsx` main component
- [x] Set up `useApp()` hook integration
- [x] Implement theme integration with `applyDocumentTheme()`
- [x] Create loading state skeleton

#### 3.2 Health Summary Cards
- [x] Implement Total Transactions card (without delta)
- [x] Implement Error Rate card with color coding
- [x] Implement Avg Latency card with P95 subtitle
- [x] Implement Active Endpoints card
- [x] Add responsive grid layout (4 columns -> 2 -> 1)

#### 3.3 Application Breakdown Chart
- [x] Implement horizontal bar chart with Tremor BarList
- [x] Add loading skeleton (via global LoadingSkeleton)

#### 3.4 Top Talkers Table (Partial)
- [x] Implement Tremor Table with 3 columns (Client, Server, Traffic)
- [x] Implement traffic byte formatting

#### 3.5 Traffic Timeline Chart
- [x] Implement Tremor AreaChart
- [x] Configure dual series (Requests + Errors)
- [x] Add hover tooltips (built-in)
- [x] Make responsive

#### 3.6 Controls & Interactions (Partial)
- [x] Create time range selector dropdown (1h, 6h, 24h, 7d)
- [x] Implement auto-refresh toggle (60s interval)
- [x] Wire up `callServerTool` for data refresh
- [x] Add "Last updated" timestamp with relative time
- [x] Updated to use new ext-apps API (`useApp` hook)

### Phase 4: Integration & Polish (Partial)

#### 4.1 Data Flow Integration
- [x] Connect UI components to server tool data
- [x] Implement refresh mechanism via app-only tool
- [x] Handle empty data states ("No Data" message)

#### 4.3 Build & Bundling
- [x] Verify Vite produces single HTML file
- [x] Verify all assets are inlined

---

## Out of Scope for v1 (per spec)

- Drill-down to application details
- Custom time range picker
- Export data to CSV
- Alerting thresholds configuration
- Comparison with previous period overlay
- Host details on click (link to topology view)

---

## Notes

### Configuration & Setup
- Tremor requires Tailwind CSS - both are correctly configured
- ClickHouse connection via environment variables (CLICKHOUSE_URL, CLICKHOUSE_DATABASE, etc.)
- Neo4j connection is set up but not currently used by dashboard queries
- Auto-refresh interval is 60 seconds as per spec
- Server fetches 10 top talkers but UI only displays 5 (needs pagination)

### Node.js Setup
- Node.js version management: fnm (Fast Node Manager) installed
- Node 18 installed and configured for the project
- Use `fnm list` to view installed versions and `fnm use 18` to switch if needed
