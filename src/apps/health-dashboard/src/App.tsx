/**
 * Network Health Dashboard - Main Application Component
 *
 * Displays network health metrics, application breakdown, top talkers,
 * and traffic timeline using Tremor components.
 */
import { useApp, applyDocumentTheme, App as McpApp } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  Title,
  Text,
  Metric,
  Flex,
  Grid,
  BadgeDelta,
  AreaChart,
  DonutChart,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Select,
  SelectItem,
  Switch,
} from "@tremor/react";

// =============================================================================
// Types
// =============================================================================

interface ApplicationMetrics {
  applicationName: string;
  totalTransactions: number;
  errorCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

interface HealthOverviewData {
  totalTransactions: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  uniqueClients: number;
  uniqueServers: number;
  applications: ApplicationMetrics[];
}

interface TopTalkerData {
  clientIp: string;
  serverIp: string;
  bytes: number;
  requestCount: number;
}

interface TrafficTimelinePoint {
  hour: string;
  requests: number;
  errors: number;
}

interface DashboardData {
  healthOverview: HealthOverviewData;
  topTalkers: TopTalkerData[];
  trafficTimeline: TrafficTimelinePoint[];
  filters: {
    hours: number;
    sensor_ip?: string;
    sensor_name?: string;
  };
  generatedAt: string;
}

interface ToolContent {
  type: string;
  text: string;
}

interface ApplicationDetails {
  overview: {
    applicationName: string;
    totalTransactions: number;
    errorCount: number;
    errorRate: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    totalBytes: number;
    uniqueClients: number;
    uniqueServers: number;
  };
  topClients: Array<{
    clientIp: string;
    transactions: number;
    errors: number;
    bytes: number;
  }>;
  topServers: Array<{
    serverIp: string;
    serverPort: number;
    transactions: number;
    avgLatencyMs: number;
  }>;
  timeline: TrafficTimelinePoint[];
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function getErrorRateColor(rate: number): "emerald" | "amber" | "rose" {
  if (rate < 1) return "emerald";
  if (rate < 5) return "amber";
  return "rose";
}

function timeAgo(isoString: string): string {
  const date = new Date(isoString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// =============================================================================
// Main Component
// =============================================================================

export default function App() {
  // State
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Application drilldown state
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [appDetails, setAppDetails] = useState<ApplicationDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Store app reference for calling tools
  const appRef = useRef<McpApp | null>(null);

  // Use the new ext-apps API
  const { app, isConnected, error: connectionError } = useApp({
    appInfo: { name: "NetworkHealthDashboard", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (newApp) => {
      appRef.current = newApp;

      // Handle tool result notifications (both initial and refresh data)
      // The initial tool call result and refresh calls both send results via ontoolresult
      newApp.ontoolresult = (params) => {
        try {
          const content = params.content as ToolContent[] | undefined;
          if (Array.isArray(content)) {
            // Try to find JSON data - it could be at index 0 (refresh) or index 1 (initial)
            for (let i = content.length - 1; i >= 0; i--) {
              try {
                const jsonData = JSON.parse(content[i].text);
                if (jsonData.healthOverview) {
                  setData(jsonData);
                  setHours(jsonData.filters?.hours || 24);
                  setLastUpdated(jsonData.generatedAt);
                  setError(null);
                  break;
                }
              } catch {
                // Continue to next content item
              }
            }
          }
          setLoading(false);
        } catch (e) {
          console.error("Failed to parse tool result:", e);
          setLoading(false);
        }
      };

      // Handle context changes (theme, etc.)
      newApp.onhostcontextchanged = (params) => {
        if (params.theme) {
          applyDocumentTheme(params.theme);
        }
      };
    },
  });

  // Update app ref when app changes
  useEffect(() => {
    if (app) {
      appRef.current = app;
    }
  }, [app]);

  // Handle connection errors
  useEffect(() => {
    if (connectionError) {
      setError(`Connection error: ${connectionError.message}`);
      setLoading(false);
    }
  }, [connectionError]);

  // Apply host theme when connected
  useEffect(() => {
    if (isConnected && app) {
      const context = app.getHostContext();
      if (context?.theme) {
        applyDocumentTheme(context.theme);
      }
    }
  }, [isConnected, app]);

  // Fetch initial data when connected
  // Since show_network_dashboard now returns text summary, UI must call refresh_dashboard_data
  useEffect(() => {
    if (isConnected && app && !data) {
      const fetchInitialData = async () => {
        try {
          const result = await app.callServerTool({
            name: "refresh_dashboard_data",
            arguments: { hours },
          });

          const content = result.content as ToolContent[] | undefined;
          if (Array.isArray(content) && content.length > 0) {
            const jsonData = JSON.parse(content[0].text);
            setData(jsonData);
            setLastUpdated(jsonData.generatedAt);
            setError(null);
          }
        } catch (e) {
          console.error("Failed to fetch initial data:", e);
          setError("Failed to load dashboard data");
        } finally {
          setLoading(false);
        }
      };

      fetchInitialData();
    }
  }, [isConnected, app, data, hours]);

  // Refresh data function
  const refreshData = useCallback(async () => {
    const currentApp = appRef.current;
    if (!currentApp) return;

    try {
      setLoading(true);
      const result = await currentApp.callServerTool({
        name: "refresh_dashboard_data",
        arguments: { hours },
      });

      const content = result.content as ToolContent[] | undefined;
      if (Array.isArray(content) && content.length > 0) {
        const jsonData = JSON.parse(content[0].text);
        setData(jsonData);
        setLastUpdated(jsonData.generatedAt);
        setError(null);
      }
    } catch (e) {
      console.error("Refresh failed:", e);
      setError("Failed to refresh data");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshData();
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, refreshData]);

  // Handle time range change
  const handleHoursChange = async (newHours: string) => {
    const currentApp = appRef.current;
    if (!currentApp) return;

    const h = parseInt(newHours, 10);
    setHours(h);

    try {
      setLoading(true);
      const result = await currentApp.callServerTool({
        name: "refresh_dashboard_data",
        arguments: { hours: h },
      });

      const content = result.content as ToolContent[] | undefined;
      if (Array.isArray(content) && content.length > 0) {
        const jsonData = JSON.parse(content[0].text);
        setData(jsonData);
        setLastUpdated(jsonData.generatedAt);
      }
    } catch (e) {
      console.error("Failed to update time range:", e);
    } finally {
      setLoading(false);
    }
  };

  // Handle application click for drilldown
  const handleAppClick = async (appName: string | undefined) => {
    const currentApp = appRef.current;
    if (!appName || !currentApp) return;

    setSelectedApp(appName);
    setLoadingDetails(true);
    setAppDetails(null);

    try {
      const result = await currentApp.callServerTool({
        name: "get_application_details_tool",
        arguments: { application_name: appName, hours },
      });

      const content = result.content as ToolContent[] | undefined;
      if (Array.isArray(content) && content.length > 0) {
        const jsonData = JSON.parse(content[0].text);
        setAppDetails(jsonData);
      }
    } catch (e) {
      console.error("Failed to fetch application details:", e);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Handle back button from detail view
  const handleBackToOverview = () => {
    setSelectedApp(null);
    setAppDetails(null);
  };

  // Loading state
  if (loading && !data) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (error && !data) {
    return (
      <div className="p-6">
        <Card className="bg-rose-50 dark:bg-rose-950">
          <Title className="text-rose-700 dark:text-rose-300">Error</Title>
          <Text className="text-rose-600 dark:text-rose-400">{error}</Text>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Card>
          <Title>No Data</Title>
          <Text>No dashboard data available.</Text>
        </Card>
      </div>
    );
  }

  // Prepare data for charts
  const applicationBarData = data.healthOverview.applications.map((app) => ({
    name: app.applicationName,
    value: app.totalTransactions,
  }));

  const timelineData = data.trafficTimeline.map((point) => ({
    hour: new Date(point.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    Requests: point.requests,
    Errors: point.errors,
  }));

  // Render application detail view if an app is selected
  if (selectedApp) {
    return (
      <ApplicationDetailView
        appName={selectedApp}
        details={appDetails}
        loading={loadingDetails}
        hours={hours}
        onBack={handleBackToOverview}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 min-h-screen bg-tremor-background dark:bg-dark-tremor-background">
      {/* Header */}
      <Flex className="mb-6" justifyContent="between" alignItems="center">
        <div>
          <Title>Network Health Dashboard</Title>
          <Text className="text-tremor-content dark:text-dark-tremor-content">
            {lastUpdated && `Last updated: ${timeAgo(lastUpdated)}`}
            {loading && " • Refreshing..."}
          </Text>
        </div>

        <Flex className="gap-4" justifyContent="end" alignItems="center">
          {/* Time Range Selector */}
          <Select value={String(hours)} onValueChange={handleHoursChange}>
            <SelectItem value="1">Last 1 hour</SelectItem>
            <SelectItem value="6">Last 6 hours</SelectItem>
            <SelectItem value="24">Last 24 hours</SelectItem>
            <SelectItem value="168">Last 7 days</SelectItem>
          </Select>

          {/* Auto-refresh Toggle */}
          <Flex className="gap-2" alignItems="center">
            <Text className="text-sm">Auto-refresh</Text>
            <Switch checked={autoRefresh} onChange={() => setAutoRefresh(!autoRefresh)} />
          </Flex>
        </Flex>
      </Flex>

      {/* Health Summary Cards */}
      <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-6">
        <Card decoration="top" decorationColor="blue">
          <Text>Total Transactions</Text>
          <Metric>{formatNumber(data.healthOverview.totalTransactions)}</Metric>
          <Flex className="mt-2">
            <Text className="text-sm text-tremor-content dark:text-dark-tremor-content">
              {formatNumber(data.healthOverview.uniqueClients)} clients
            </Text>
          </Flex>
        </Card>

        <Card decoration="top" decorationColor={getErrorRateColor(data.healthOverview.errorRate)}>
          <Text>Error Rate</Text>
          <Metric>{data.healthOverview.errorRate.toFixed(2)}%</Metric>
          <Flex className="mt-2">
            <BadgeDelta
              deltaType={data.healthOverview.errorRate > 5 ? "increase" : "unchanged"}
              size="xs"
            >
              {data.healthOverview.errorRate < 1 ? "Healthy" : data.healthOverview.errorRate < 5 ? "Warning" : "Critical"}
            </BadgeDelta>
          </Flex>
        </Card>

        <Card decoration="top" decorationColor="blue">
          <Text>Avg Latency</Text>
          <Metric>{data.healthOverview.avgLatencyMs.toFixed(1)} ms</Metric>
          <Flex className="mt-2">
            <Text className="text-sm text-tremor-content dark:text-dark-tremor-content">
              P95: {data.healthOverview.p95LatencyMs.toFixed(1)} ms
            </Text>
          </Flex>
        </Card>

        <Card decoration="top" decorationColor="blue">
          <Text>Active Endpoints</Text>
          <Metric>
            {formatNumber(data.healthOverview.uniqueClients + data.healthOverview.uniqueServers)}
          </Metric>
          <Flex className="mt-2">
            <Text className="text-sm text-tremor-content dark:text-dark-tremor-content">
              {formatNumber(data.healthOverview.uniqueServers)} servers
            </Text>
          </Flex>
        </Card>
      </Grid>

      {/* Middle Row: Application Breakdown + Top Talkers */}
      <Grid numItemsMd={2} className="gap-4 mb-6">
        {/* Application Breakdown */}
        <Card>
          <Title>Application Breakdown</Title>
          <Text className="mb-4">Transactions by application</Text>
          <DonutChart
            data={applicationBarData}
            category="value"
            index="name"
            className="h-48 cursor-pointer"
            colors={["blue", "cyan", "indigo", "violet", "fuchsia"]}
            showLabel
            valueFormatter={formatNumber}
            onValueChange={(v) => handleAppClick(v?.name)}
          />
          <Text className="text-center text-xs text-tremor-content dark:text-dark-tremor-content mt-2">
            Click an application for details
          </Text>
        </Card>

        {/* Top Talkers */}
        <Card>
          <Title>Top Talkers</Title>
          <Text className="mb-4">Highest traffic client-server pairs</Text>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Client</TableHeaderCell>
                <TableHeaderCell>Server</TableHeaderCell>
                <TableHeaderCell className="text-right">Traffic</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.topTalkers.slice(0, 5).map((talker, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-sm">{talker.clientIp}</TableCell>
                  <TableCell className="font-mono text-sm">{talker.serverIp}</TableCell>
                  <TableCell className="text-right">{formatBytes(talker.bytes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Grid>

      {/* Traffic Timeline */}
      <Card>
        <Title>Traffic Timeline</Title>
        <Text className="mb-4">Requests and errors over time</Text>
        <AreaChart
          className="h-72 mt-4"
          data={timelineData}
          index="hour"
          categories={["Requests", "Errors"]}
          colors={["blue", "rose"]}
          valueFormatter={(value) => formatNumber(value)}
          showLegend
          showGridLines
          curveType="natural"
        />
      </Card>
    </div>
  );
}

// =============================================================================
// Loading Skeleton Component
// =============================================================================

function LoadingSkeleton() {
  return (
    <div className="p-4 md:p-6 min-h-screen bg-tremor-background dark:bg-dark-tremor-background">
      <div className="mb-6">
        <div className="h-8 w-64 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
        <div className="h-4 w-32 mt-2 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
      </div>

      <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <div className="h-4 w-24 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
            <div className="h-10 w-32 mt-2 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
          </Card>
        ))}
      </Grid>

      <Grid numItemsMd={2} className="gap-4 mb-6">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <div className="h-64 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
          </Card>
        ))}
      </Grid>

      <Card>
        <div className="h-72 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
      </Card>
    </div>
  );
}

// =============================================================================
// Application Detail View Component
// =============================================================================

interface ApplicationDetailViewProps {
  appName: string;
  details: ApplicationDetails | null;
  loading: boolean;
  hours: number;
  onBack: () => void;
}

function ApplicationDetailView({ appName, details, loading, hours, onBack }: ApplicationDetailViewProps) {
  // Loading state
  if (loading || !details) {
    return (
      <div className="p-4 md:p-6 min-h-screen bg-tremor-background dark:bg-dark-tremor-background">
        <Flex className="mb-6" alignItems="center">
          <button
            onClick={onBack}
            className="mr-4 text-tremor-content hover:text-tremor-content-emphasis dark:text-dark-tremor-content dark:hover:text-dark-tremor-content-emphasis"
          >
            ← Back
          </button>
          <Title>{appName} Details</Title>
        </Flex>

        <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <div className="h-4 w-24 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
              <div className="h-10 w-32 mt-2 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
            </Card>
          ))}
        </Grid>

        <Grid numItemsMd={2} className="gap-4 mb-6">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <div className="h-48 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
            </Card>
          ))}
        </Grid>

        <Card>
          <div className="h-72 bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle rounded animate-pulse" />
        </Card>
      </div>
    );
  }

  const { overview, topClients, topServers, timeline } = details;

  // Prepare timeline data for chart
  const timelineData = timeline.map((point) => ({
    hour: new Date(point.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    Requests: point.requests,
    Errors: point.errors,
  }));

  return (
    <div className="p-4 md:p-6 min-h-screen bg-tremor-background dark:bg-dark-tremor-background">
      {/* Header with Back Button */}
      <Flex className="mb-6" justifyContent="between" alignItems="center">
        <Flex alignItems="center">
          <button
            onClick={onBack}
            className="mr-4 px-3 py-1 rounded text-tremor-content hover:text-tremor-content-emphasis hover:bg-tremor-background-subtle dark:text-dark-tremor-content dark:hover:text-dark-tremor-content-emphasis dark:hover:bg-dark-tremor-background-subtle transition-colors"
          >
            ← Back
          </button>
          <div>
            <Title>{overview.applicationName} Details</Title>
            <Text className="text-tremor-content dark:text-dark-tremor-content">
              Last {hours} hour{hours !== 1 ? "s" : ""}
            </Text>
          </div>
        </Flex>
      </Flex>

      {/* Metrics Cards */}
      <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-6">
        <Card decoration="top" decorationColor="blue">
          <Text>Transactions</Text>
          <Metric>{formatNumber(overview.totalTransactions)}</Metric>
          <Flex className="mt-2">
            <Text className="text-sm text-tremor-content dark:text-dark-tremor-content">
              P95: {overview.p95LatencyMs.toFixed(1)}ms
            </Text>
          </Flex>
        </Card>

        <Card decoration="top" decorationColor={getErrorRateColor(overview.errorRate)}>
          <Text>Error Rate</Text>
          <Metric>{overview.errorRate.toFixed(2)}%</Metric>
          <Flex className="mt-2">
            <Text className="text-sm text-tremor-content dark:text-dark-tremor-content">
              {formatNumber(overview.errorCount)} errors
            </Text>
          </Flex>
        </Card>

        <Card decoration="top" decorationColor="blue">
          <Text>Avg Latency</Text>
          <Metric>{overview.avgLatencyMs.toFixed(1)} ms</Metric>
          <Flex className="mt-2">
            <Text className="text-sm text-tremor-content dark:text-dark-tremor-content">
              P99: {overview.p99LatencyMs.toFixed(1)}ms
            </Text>
          </Flex>
        </Card>

        <Card decoration="top" decorationColor="blue">
          <Text>Traffic</Text>
          <Metric>{formatBytes(overview.totalBytes)}</Metric>
          <Flex className="mt-2">
            <Text className="text-sm text-tremor-content dark:text-dark-tremor-content">
              {formatNumber(overview.uniqueClients)} clients • {formatNumber(overview.uniqueServers)} servers
            </Text>
          </Flex>
        </Card>
      </Grid>

      {/* Top Clients & Servers */}
      <Grid numItemsMd={2} className="gap-4 mb-6">
        {/* Top Clients */}
        <Card>
          <Title>Top Clients</Title>
          <Text className="mb-4">Highest transaction count</Text>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Client IP</TableHeaderCell>
                <TableHeaderCell className="text-right">Transactions</TableHeaderCell>
                <TableHeaderCell className="text-right">Errors</TableHeaderCell>
                <TableHeaderCell className="text-right">Traffic</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {topClients.map((client, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-sm">{client.clientIp}</TableCell>
                  <TableCell className="text-right">{formatNumber(client.transactions)}</TableCell>
                  <TableCell className="text-right">{formatNumber(client.errors)}</TableCell>
                  <TableCell className="text-right">{formatBytes(client.bytes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Top Servers */}
        <Card>
          <Title>Top Servers</Title>
          <Text className="mb-4">Highest transaction count</Text>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Server</TableHeaderCell>
                <TableHeaderCell className="text-right">Transactions</TableHeaderCell>
                <TableHeaderCell className="text-right">Avg Latency</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {topServers.map((server, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-sm">
                    {server.serverIp}:{server.serverPort}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(server.transactions)}</TableCell>
                  <TableCell className="text-right">{server.avgLatencyMs.toFixed(1)} ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Grid>

      {/* Traffic Timeline */}
      <Card>
        <Title>Traffic Timeline</Title>
        <Text className="mb-4">Requests and errors over time for {overview.applicationName}</Text>
        <AreaChart
          className="h-72 mt-4"
          data={timelineData}
          index="hour"
          categories={["Requests", "Errors"]}
          colors={["blue", "rose"]}
          valueFormatter={(value) => formatNumber(value)}
          showLegend
          showGridLines
          curveType="natural"
        />
      </Card>
    </div>
  );
}
