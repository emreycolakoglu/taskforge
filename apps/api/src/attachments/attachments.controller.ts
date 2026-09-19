import {
  Controller,
  Delete,
  Get,
  Head,
  Param,
  Post,
  Res,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request } from 'express';
import { promises as fs } from 'fs';
import * as os from 'os';
import { AttachmentsService, SubjectType } from './attachments.service';

interface AuthedUser {
  id: string;
  displayName: string;
  role: string;
}

const ABSOLUTE_MAX_BYTES = 100 * 1024 * 1024;

const SUBJECT_TYPE_VALUES = ['task', 'comment', 'document'] as const;

/**
 * subjectType routes must not collide with existing controllers: the only
 * two-segment `api/:a/:b` shapes today are boards/:id, boards/:id/full etc.
 * The literal 'attachments' segment is reserved by the download/list routes
 * below; 'tasks|comments|documents' are the valid subject types.
 */
function assertValidSubject(subjectType: string): void {
  if (!SUBJECT_TYPE_VALUES.includes(subjectType as any)) {
    throw new NotFoundException('Unknown subject type');
  }
}

@Controller('api')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Post(':subjectType/:subjectId/attachments')
  @UseInterceptors(
    FileInterceptor('file', { dest: os.tmpdir(), limits: { fileSize: ABSOLUTE_MAX_BYTES } }),
  )
  async upload(
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('Missing file field');
    }
    const user = (req as any).user as AuthedUser | undefined;
    try {
      // First statement inside the try so an unknown-subject 404 still runs
      // the finally block below and deletes the temp file Multer staged.
      assertValidSubject(subjectType);
      return await this.service.create({
        subjectType: subjectType as any,
        subjectId,
        filename: file.originalname,
        mimeType: file.mimetype,
        tempPath: file.path,
        user,
      });
    } finally {
      // create() moved the temp file via driver.put (rename); if validation
      // failed earlier, the staged file is still here — clean it up.
      await fs.rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  @Get(':subjectType/:subjectId/attachments')
  async list(@Param('subjectType') subjectType: string, @Param('subjectId') subjectId: string) {
    assertValidSubject(subjectType);
    return this.service.list(subjectType as any, subjectId);
  }

  @Get('attachments/policy')
  async attachmentPolicy() {
    return this.service.getAttachmentPolicy();
  }

  // Must stay above @Get('attachments/:id'): routes register in declaration
  // order, and Express answers HEAD with the GET handler when no HEAD route
  // matched first — which would make this handler dead code.
  @Head('attachments/:id')
  async head(@Param('id') id: string, @Res() res: Response) {
    const att = await this.service.findForDownload(id);
    res.setHeader('Content-Type', att.mimeType);
    res.setHeader('Content-Length', String(att.sizeBytes));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.end();
  }

  @Get('attachments/:id')
  async download(@Param('id') id: string, @Res() res: Response) {
    const att = await this.service.findForDownload(id);
    const buf = await this.service.readBytes(id);
    res.setHeader('Content-Type', att.mimeType);
    res.setHeader('Content-Length', String(buf.byteLength));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  }

  @Delete('attachments/:id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    await this.service.remove(id, user);
    return { success: true };
  }
}
