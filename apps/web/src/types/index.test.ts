import { describe, it, expect } from 'vitest';
import { Board, Task, Label, Comment, API_BASE } from '../types';

describe('Types', () => {
  it('should have correct type structure for Board', () => {
    const board: Board = {
      id: 'b1',
      name: 'Test',
      slug: 'test',
      createdAt: '2026-01-01T00:00:00Z',
      lists: [],
      labels: [],
      members: [],
      _count: { lists: 0, tasks: 0 },
    };
    expect(board.id).toBe('b1');
    expect(board.name).toBe('Test');
  });

  it('should have correct type structure for Task', () => {
    const task: Task = {
      id: 't1',
      listId: 'l1',
      title: 'Test task',
      position: 0,
      priority: 'high',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      labels: [],
      comments: [],
      activity: [],
      _count: { comments: 0 },
    };
    expect(task.title).toBe('Test task');
    expect(task.priority).toBe('high');
  });

  it('should accept all priority levels', () => {
    const priorities: Task['priority'][] = ['low', 'medium', 'high', 'urgent'];
    expect(priorities).toHaveLength(4);
  });

  it('should accept all task statuses', () => {
    const statuses: Task['status'][] = ['active', 'archived', 'done'];
    expect(statuses).toHaveLength(3);
  });

  it('should have correct API_BASE constant', () => {
    expect(API_BASE).toBe('/api');
  });

  it('should have correct Label type', () => {
    const label: Label = {
      id: 'lb1',
      boardId: 'b1',
      name: 'bug',
      color: '#ef4444',
    };
    expect(label.name).toBe('bug');
  });

  it('should have correct Comment type', () => {
    const comment: Comment = {
      id: 'c1',
      taskId: 't1',
      author: 'alice',
      body: 'Nice work!',
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(comment.body).toBe('Nice work!');
  });
});
