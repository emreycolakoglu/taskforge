import { Controller, Post, Body, Sse, Res, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { Observable, Subject } from 'rxjs';
import { McpService } from './mcp.service';

@Controller('api/mcp')
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  async handlePost(@Body() body: any) {
    return this.mcp.handleRequest(body);
  }

  @Post('jsonrpc')
  async handleJsonRpc(@Body() body: any) {
    return this.mcp.handleRequest(body);
  }
}
