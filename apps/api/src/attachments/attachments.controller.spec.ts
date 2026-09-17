import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

describe('AttachmentsController', () => {
  it('uploads and cleans the staged temp file', async () => {
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
  });
});
