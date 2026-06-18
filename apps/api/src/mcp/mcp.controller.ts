import { Controller, Post, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { McpService } from './mcp.service';

@Controller('api/mcp')
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  async handlePost(@Body() body: any, @Req() req: Request) {
    const user = (req as any).user;
    return this.mcp.handleRequest(body, user);
  }

  @Post('jsonrpc')
  async handleJsonRpc(@Body() body: any, @Req() req: Request) {
    const user = (req as any).user;
    return this.mcp.handleRequest(body, user);
  }
}
