import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpService, AuthUser } from './mcp.service';
import { TOOL_DEFINITIONS } from './tool-definitions';

const VERSION = process.env.npm_package_version ?? '0.1.0';

/**
 * Builds an McpServer instance with taskforge's tools registered.
 * One McpServer per MCP session; cheap to construct. The authenticated user
 * is captured at session creation and threaded into every tool call so that
 * Activity/Comment attribution and assigneeId defaults work.
 */
@Injectable()
export class McpServerFactory {
  constructor(private mcpService: McpService) {}

  create(user: AuthUser): McpServer {
    const server = new McpServer(
      { name: 'taskforge', version: VERSION },
      { capabilities: { tools: {} } },
    );

    for (const def of TOOL_DEFINITIONS) {
      server.registerTool(
        def.name,
        { title: def.title, description: def.description, inputSchema: def.inputSchema },
        async (args: Record<string, unknown>) => {
          const response = await this.mcpService.handleRequest(
            { method: def.name, params: args, id: 'mcp' },
            user,
          );
          if (response.error) {
            return {
              content: [{ type: 'text' as const, text: response.error.message }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(response.result) }],
          };
        },
      );
    }

    return server;
  }
}