import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService],
    }).compile();
    service = module.get<EventsService>(EventsService);
  });

  it('should emit and observe events', (done) => {
    const subscription = service.observe().subscribe(({ event, data, boardId }) => {
      expect(event).toBe('test:event');
      expect(data).toEqual({ foo: 'bar' });
      expect(boardId).toBeUndefined();
      subscription.unsubscribe();
      done();
    });

    service.emit('test:event', { foo: 'bar' });
  });

  it('should emit events with boardId', (done) => {
    const subscription = service.observe().subscribe(({ event, data, boardId }) => {
      expect(event).toBe('task:created');
      expect(data).toEqual({ id: '1' });
      expect(boardId).toBe('board-123');
      subscription.unsubscribe();
      done();
    });

    service.emit('task:created', { id: '1' }, 'board-123');
  });

  it('should support multiple events', (done) => {
    const events: string[] = [];
    const subscription = service.observe().subscribe(({ event }) => {
      events.push(event);
      if (events.length === 2) {
        expect(events).toEqual(['first', 'second']);
        subscription.unsubscribe();
        done();
      }
    });

    service.emit('first', {});
    service.emit('second', {});
  });

  it('should support multiple subscribers', () => {
    const received1: any[] = [];
    const received2: any[] = [];

    const sub1 = service.observe().subscribe(({ event }) => received1.push(event));
    const sub2 = service.observe().subscribe(({ event }) => received2.push(event));

    service.emit('event1', {});
    service.emit('event2', {});

    expect(received1).toEqual(['event1', 'event2']);
    expect(received2).toEqual(['event1', 'event2']);

    sub1.unsubscribe();
    sub2.unsubscribe();
  });
});
