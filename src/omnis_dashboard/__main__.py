"""Entry point for running omnis-dashboard as a module.

Supports both stdio and HTTP transports:
  python -m omnis_dashboard --stdio   # For MCP hosts (Claude Desktop)
  python -m omnis_dashboard           # HTTP server for development
"""

from __future__ import annotations

import logging
import sys

from omnis_dashboard.config import settings
from omnis_dashboard.server import mcp

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    """Run the MCP server."""
    if "--stdio" in sys.argv:
        logger.info("Starting MCP server in stdio mode")
        mcp.run(transport="stdio")
    else:
        # HTTP mode for development
        logger.info(f"Starting HTTP server on http://0.0.0.0:{settings.port}/mcp")

        # Use FastMCP's built-in HTTP runner with CORS
        mcp.run(
            transport="http",
            host="0.0.0.0",
            port=settings.port,
            path="/mcp",
        )


if __name__ == "__main__":
    main()
