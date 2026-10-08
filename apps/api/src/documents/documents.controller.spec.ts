import { DocumentsController } from './documents.controller';

describe('DocumentsController', () => {
  const service = {
    create: jest.fn(),
    findByProject: jest.fn(),
  };
  const controller = new DocumentsController(service as any);
  const user = { id: 'u1', displayName: 'Ada' };

  beforeEach(() => jest.clearAllMocks());

  it('task route passes a { taskId } subject', () => {
    controller.create('t1', { title: 'T' }, { user } as any);
    expect(service.create).toHaveBeenCalledWith({ taskId: 't1' }, { title: 'T' }, user);
  });

  it('project route passes a { projectId } subject', () => {
    controller.createForProject('p1', { title: 'P' }, { user } as any);
    expect(service.create).toHaveBeenCalledWith({ projectId: 'p1' }, { title: 'P' }, user);
  });

  it('lists a project’s documents', () => {
    controller.findByProject('p1');
    expect(service.findByProject).toHaveBeenCalledWith('p1');
  });
});
