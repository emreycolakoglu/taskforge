import { describe, it, expect } from 'vitest';
import { Board, Task, TaskLabel, Label, Comment, API_BASE, PREDEFINED_COLORS } from '../types';

describe('Types', () => {
  it('should have correct type structure for Board', () => {
    const board: Board = {
      id: 'b1',
      name: 'Test',
      slug: 'test',
      identifier: 'TST',
      createdAt: '2026-01-01T00:00:00Z',
      statuses: [],
      labels: [],
      members: [],
      _count: { statuses: 0, tasks: 0 },
    };
    expect(board.id).toBe('b1');
    expect(board.name).toBe('Test');
    expect(board.identifier).toBe('TST');
  });

  it('should have correct type structure for Task', () => {
    const task: Task = {
      id: 't1',
      statusId: 's1',
      boardId: 'b1',
      number: 1,
      taskNumber: 'TST-1',
      title: 'Test task',
      position: 0,
      priority: 'high',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      labels: [],
      comments: [],
      activity: [],
      _count: { comments: 0 },
    };
    expect(task.title).toBe('Test task');
    expect(task.priority).toBe('high');
    expect(task.taskNumber).toBe('TST-1');
  });

  it('should accept all priority levels', () => {
    const priorities: Task['priority'][] = ['low', 'medium', 'high', 'urgent'];
    expect(priorities).toHaveLength(4);
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
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(label.name).toBe('bug');
    expect(label.createdAt).toBeTruthy();
    expect(label.updatedAt).toBeTruthy();
  });

  it('should have correct TaskLabel type', () => {
    const taskLabel: TaskLabel = {
      taskId: 't1',
      labelId: 'lb1',
      assignedAt: '2026-01-01T00:00:00Z',
      label: {
        id: 'lb1',
        boardId: 'b1',
        name: 'bug',
        color: '#ef4444',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    };
    expect(taskLabel.assignedAt).toBeTruthy();
    expect(taskLabel.label.name).toBe('bug');
  });

  it('should have correct PREDEFINED_COLORS constant', () => {
    expect(PREDEFINED_COLORS).toHaveLength(12);
    expect(PREDEFINED_COLORS[0]).toBe('#EF4444');
    expect(PREDEFINED_COLORS[11]).toBe('#64748B');
    for (const color of PREDEFINED_COLORS) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
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
