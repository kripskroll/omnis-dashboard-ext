# AGENTS.md - Omnis Dashboard Ext

## Build & Run

### Prerequisites
- Node.js 18+
- npm or bun
- Access to ClickHouse database (same as omnis-mcp-topo)
- Access to Neo4j database (same as omnis-mcp-topo)

### fnm (Fast Node Manager) Setup
If using fnm for Node.js version management:
```bash
export FNM_PATH="$HOME/.local/share/fnm"
export PATH="$FNM_PATH:$PATH"
eval "$(fnm env)"
```

### Install Dependencies
```bash
npm install
```

### Build
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Start Server
```bash
# HTTP transport (for testing with basic-host)
npm run start:http

# Stdio transport (for MCP client integration)
npm run start:stdio
```

## Validation

Run these after implementing to get immediate feedback:

- **Build check**: `npm run build`
- **Typecheck**: `npm run typecheck`
- **Lint**: `npm run lint`
- **Test**: `npm test`

## Operational Notes

### MCP ext-apps Architecture
- Tools are registered with `registerAppTool()` from `@modelcontextprotocol/ext-apps/server`
- UI resources are registered with `registerAppResource()` 
- Resource URI format: `ui://omnis-dashboard/{app-name}.html`
- Tool `_meta.ui.resourceUri` links tool to its UI resource

### Build System
- Vite bundles each app into a single HTML file using `vite-plugin-singlefile`
- Each app in `src/apps/` has its own entry point and builds to `dist/`
- Server TypeScript compiles separately via `tsconfig.server.json`

### Data Access
- ClickHouse queries go through `src/data/clickhouse.ts`
- Neo4j queries go through `src/data/neo4j.ts`
- Connection strings from environment variables (see `.env.example`)

### UI Development
- React 18+ with Tremor components for dashboard UI
- Tailwind CSS for styling (Tremor requires it)
- `useApp()` hook from `@modelcontextprotocol/ext-apps/react` for MCP communication
- `callServerTool()` to invoke server tools from UI
- `applyDocumentTheme()` for host theme integration

### CSP Configuration
- External CDN resources require CSP `resourceDomains` in resource metadata
- Tremor/Tailwind are bundled, no CDN needed
- If adding external libs, update CSP in `server.ts`

## Codebase Patterns

### Tool Registration Pattern
```typescript
registerAppTool(server, "tool-name", {
  title: "Human Title",
  description: "Description for LLM",
  inputSchema: { /* zod schema */ },
  _meta: { ui: { resourceUri: "ui://omnis-dashboard/app.html" } }
}, async (params) => {
  const data = await fetchData(params);
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});
```

### App-Only Tool Pattern (hidden from LLM)
```typescript
registerAppTool(server, "refresh-data", {
  // ...
  _meta: { 
    ui: { 
      resourceUri: "ui://omnis-dashboard/app.html",
      visibility: ["app"]  // Hidden from model, callable by UI only
    } 
  }
}, handler);
```

### React App Pattern
```tsx
import { useApp } from "@modelcontextprotocol/ext-apps/react";

function App() {
  const { toolInputs, callServerTool, isReady } = useApp();
  
  // toolInputs contains data from initial tool call
  // callServerTool("tool-name", params) to call server tools
}
```

### Error Handling
- Always provide meaningful text fallback in tool response
- UI should handle loading, error, and empty states
- Use try/catch in data fetching, log errors with `sendLog()`
