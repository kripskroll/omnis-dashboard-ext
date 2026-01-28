# Omnis Dashboard Ext

MCP ext-app server providing interactive network health visualization dashboards. Built with React, Tremor, and the MCP Apps SDK.

## Features

- **Network Health Dashboard** - Real-time overview of network metrics, application breakdown, top talkers, and traffic trends
- **Interactive Visualizations** - Built with Tremor for professional, modern charts and tables
- **MCP Integration** - Renders inline in MCP-compatible hosts like Claude Desktop
- **Theme Support** - Automatically adapts to host light/dark mode

## Quick Start

### Prerequisites

- Node.js 18+
- Access to ClickHouse database (same as omnis-mcp-topo)
- Optional: Neo4j for topology features

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/omnis-dashboard-ext.git
cd omnis-dashboard-ext

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database credentials
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Or run in stdio mode for MCP testing
npm run start:stdio
```

### Production Build

```bash
npm run build
npm run start:http
```

## MCP Client Configuration

Add to your MCP client configuration (e.g., Claude Desktop):

### Stdio Transport

```json
{
  "mcpServers": {
    "omnis-dashboard": {
      "command": "npx",
      "args": [
        "-y",
        "omnis-dashboard-ext",
        "--stdio"
      ]
    }
  }
}
```

### Local Development

```json
{
  "mcpServers": {
    "omnis-dashboard": {
      "command": "bash",
      "args": [
        "-c",
        "cd /path/to/omnis-dashboard-ext && npm run start:stdio"
      ]
    }
  }
}
```

## Tools

### `show_network_dashboard`

Display the interactive network health dashboard.

**Input:**
```json
{
  "hours": 24,
  "sensor_ip": "10.0.0.1",
  "sensor_name": "sensor-01"
}
```

All parameters are optional. Defaults to 24-hour view with no sensor filter.

**Usage:**
- "Show me the network health dashboard"
- "Display network status for the last 6 hours"
- "Show dashboard filtered by sensor 10.0.0.1"

## Architecture

```
omnis-dashboard-ext/
├── src/
│   ├── server.ts           # MCP server with tool/resource registration
│   ├── main.ts             # Entry point (stdio/http transports)
│   ├── data/               # Database access layer
│   │   ├── clickhouse.ts   # ClickHouse queries
│   │   └── neo4j.ts        # Neo4j queries
│   └── apps/
│       └── health-dashboard/
│           ├── mcp-app.html    # UI entry point
│           └── src/
│               ├── App.tsx     # Main React component
│               └── components/ # UI components
├── specs/                  # Feature specifications
├── AGENTS.md               # Operational guide
├── IMPLEMENTATION_PLAN.md  # Task tracking
└── loop.sh                 # Ralph development loop
```

## Development Workflow (Ralph)

This project uses the Ralph methodology for AI-assisted development:

```bash
# Make loop.sh executable
chmod +x loop.sh

# Run planning phase
./loop.sh plan 5

# Run building phase
./loop.sh 20
```

## Contributing

1. Read `specs/` to understand requirements
2. Check `IMPLEMENTATION_PLAN.md` for current status
3. Follow patterns in `AGENTS.md`
4. Run `npm run typecheck && npm run lint` before committing

## License

MIT
