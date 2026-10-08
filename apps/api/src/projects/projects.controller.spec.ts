import { ProjectsController } from './projects.controller';

describe('ProjectsController', () => {
  const service = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const controller = new ProjectsController(service as any);
  const user = { id: 'u1', displayName: 'Ada' };

  beforeEach(() => jest.clearAllMocks());

  it('forwards bot: true from a bot session so the service gate can reject it', () => {
    const req = { user, session: { bot: true } } as any;
    controller.create({ name: 'P' } as any, req);
    controller.update('p1', {}, req);
    controller.remove('p1', req);
    expect(service.create).toHaveBeenCalledWith({ name: 'P' }, { ...user, bot: true });
    expect(service.update).toHaveBeenCalledWith('p1', {}, { ...user, bot: true });
    expect(service.remove).toHaveBeenCalledWith('p1', { ...user, bot: true });
  });

  it('forwards bot: false for a human session', () => {
    controller.create({ name: 'P' } as any, { user, session: { bot: false } } as any);
    expect(service.create).toHaveBeenCalledWith({ name: 'P' }, { ...user, bot: false });
  });
});
