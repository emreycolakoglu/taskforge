import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedTask, seedComment } from '../../test/setup';

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let task: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<CommentsService>(CommentsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.lists[0].id);
  });

  afterEach(async () => {
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.list.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
  });

  describe('findByTask', () => {
    it('should return comments in reverse chronological order', async () => {
      await seedComment(prisma, task.id, { body: 'First' });
      await new Promise(r => setTimeout(r, 5));
      await seedComment(prisma, task.id, { body: 'Second' });
      const comments = await service.findByTask(task.id);
      expect(comments).toHaveLength(2);
      expect(comments[0].body).toBe('Second');
    });
  });

  describe('create', () => {
    it('should create a comment', async () => {
      const comment = await service.create({ taskId: task.id, author: 'alice', body: 'Looks good!' });
      expect(comment.author).toBe('alice');
      expect(comment.body).toBe('Looks good!');
    });

    it('should log activity on comment', async () => {
      await service.create({ taskId: task.id, author: 'bob', body: 'Needs review' });
      const activity = await prisma.activity.findMany({ where: { taskId: task.id } });
      expect(activity.some((a) => a.action === 'commented')).toBe(true);
    });
  });

  describe('remove', () => {
    it('should delete a comment', async () => {
      const comment = await seedComment(prisma, task.id);
      await service.remove(comment.id);
      const comments = await service.findByTask(task.id);
      expect(comments).toHaveLength(0);
    });
  });
});
