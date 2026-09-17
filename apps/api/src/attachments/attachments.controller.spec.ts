import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

describe('AttachmentsController', () => {
  it('uploads with the right args and removes the staged temp file', async () => {
    const rmSpy = jest.spyOn(fs.promises, 'rm').mockResolvedValue(undefined) as jest.Mock;
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'a1' }),
      remove: jest.fn(),
      list: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentsController],
    })
      .useMocker((token) => {
        if (token === AttachmentsService) return service;
        return jest.fn();
      })
      .compile();
    const ctrl = module.get(AttachmentsController);
    const req: any = { user: { id: 'u1', displayName: 'U', role: 'member' } };
    const file: any = {
      originalname: 'a.txt',
      mimetype: 'text/plain',
      path: '/tmp/definitely-gone-xyz',
    };
    const result = await (ctrl as any).upload('task', 't1', file, req);
    expect(result).toEqual({ id: 'a1' });
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ subjectType: 'task', subjectId: 't1', filename: 'a.txt' }),
    );
    expect(rmSpy).toHaveBeenCalledWith('/tmp/definitely-gone-xyz', { force: true });
    rmSpy.mockRestore();
  });

  it('removes the staged temp file when the subject type is unknown', async () => {
    const rmSpy = jest.spyOn(fs.promises, 'rm').mockResolvedValue(undefined) as jest.Mock;
    const service = {
      create: jest.fn(),
      remove: jest.fn(),
      list: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentsController],
    })
      .useMocker((token) => {
        if (token === AttachmentsService) return service;
        return jest.fn();
      })
      .compile();
    const ctrl = module.get(AttachmentsController);
    const req: any = { user: { id: 'u1', displayName: 'U', role: 'member' } };
    const file: any = {
      originalname: 'a.txt',
      mimetype: 'text/plain',
      path: '/tmp/definitely-gone-xyz',
    };
    await expect((ctrl as any).upload('bogus', 't1', file, req)).rejects.toMatchObject({
      status: 404,
    });
    expect(service.create).not.toHaveBeenCalled();
    expect(rmSpy).toHaveBeenCalledWith('/tmp/definitely-gone-xyz', { force: true });
    rmSpy.mockRestore();
  });
});
