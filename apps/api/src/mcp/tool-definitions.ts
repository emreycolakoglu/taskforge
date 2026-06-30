import { z } from 'zod';

export type ZodRawShape = Record<string, z.ZodTypeAny>;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
}

const idField = (label: string) => z.string().describe(`${label} id`);
const optionalId = (label: string) => z.string().optional().describe(`${label} id`);

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // boards
  {
    name: 'boards_list',
    title: 'List boards',
    description: 'List all boards with list and member counts.',
    inputSchema: {},
  },
  {
    name: 'boards_get',
    title: 'Get board',
    description: 'Get a single board with its lists, tasks, and labels.',
    inputSchema: { id: idField('Board') },
  },
  {
    name: 'boards_create',
    title: 'Create board',
    description: 'Create a board with the given slug/identifier and five default lists.',
    inputSchema: {
      name: z.string(),
      slug: z.string(),
      identifier: z.string().optional().describe('Short uppercase prefix for task numbers, e.g. TF'),
      description: z.string().optional(),
    },
  },
  {
    name: 'boards_delete',
    title: 'Delete board',
    description: 'Delete a board and all of its lists, tasks, and labels.',
    inputSchema: { id: idField('Board') },
  },

  // lists
  {
    name: 'lists_list',
    title: 'List lists',
    description: 'List lists for a board, ordered by position.',
    inputSchema: { boardId: idField('Board') },
  },
  {
    name: 'lists_create',
    title: 'Create list',
    description: 'Create a list in a board. position defaults to end of board.',
    inputSchema: {
      boardId: idField('Board'),
      name: z.string(),
      position: z.number().optional(),
      color: z.string().optional(),
      wipLimit: z.number().optional(),
    },
  },
  {
    name: 'lists_update',
    title: 'Update list',
    description: 'Update a list name, color, or WIP limit.',
    inputSchema: {
      id: idField('List'),
      name: z.string().optional(),
      color: z.string().optional(),
      wipLimit: z.number().optional(),
    },
  },
  {
    name: 'lists_delete',
    title: 'Delete list',
    description: 'Delete a list and its tasks.',
    inputSchema: { id: idField('List') },
  },

  // tasks
  {
    name: 'tasks_list',
    title: 'List tasks',
    description: 'List tasks with optional filters. Defaults to active status.',
    inputSchema: {
      boardId: optionalId('Board'),
      listId: optionalId('List'),
      assigneeId: optionalId('Assignee'),
      status: z.enum(['active', 'archived', 'done']).optional(),
      parentId: z.string().nullable().optional().describe('Filter by parent task id; null for top-level tasks only'),
      include: z.enum(['top', 'sub']).optional().describe('"top" = top-level only, "sub" = sub-tasks only'),
      limit: z.number().optional(),
    },
  },
  {
    name: 'tasks_get',
    title: 'Get task',
    description: 'Get a single task with list, board, labels, comments, activity, and sub-tasks.',
    inputSchema: { id: idField('Task') },
  },
  {
    name: 'tasks_search',
    title: 'Search tasks',
    description: 'Search tasks by title/description substring or by task number (e.g. TF-12).',
    inputSchema: { query: z.string() },
  },
  {
    name: 'tasks_create',
    title: 'Create task',
    description: 'Create a task in a list. assigneeId defaults to the authenticated user.',
    inputSchema: {
      listId: idField('List'),
      title: z.string(),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      assigneeId: z.string().optional(),
      dueDate: z.string().optional().describe('ISO date string'),
      parentId: z.string().nullable().optional().describe('Parent task id to create a sub-task'),
      labelIds: z.array(z.string()).optional(),
      position: z.number().optional(),
      metadata: z.record(z.unknown()).optional(),
    },
  },
  {
    name: 'tasks_update',
    title: 'Update task',
    description: 'Update one or more task fields. parentId: null un-nests.',
    inputSchema: {
      id: idField('Task'),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      status: z.enum(['active', 'archived', 'done']).optional(),
      assigneeId: z.string().optional(),
      dueDate: z.string().optional(),
      listId: z.string().optional(),
      position: z.number().optional(),
      parentId: z.string().nullable().optional(),
      labelIds: z.array(z.string()).optional(),
    },
  },
  {
    name: 'tasks_move',
    title: 'Move task',
    description: 'Move a task to a different list. position defaults to end of list.',
    inputSchema: {
      id: idField('Task'),
      listId: idField('Target list'),
      position: z.number().optional(),
    },
  },
  {
    name: 'tasks_delete',
    title: 'Archive task',
    description: 'Archive a task (soft delete). Cleans up its relations.',
    inputSchema: { id: idField('Task') },
  },

  // comments
  {
    name: 'comments_list',
    title: 'List comments',
    description: 'List comments on a task, newest first.',
    inputSchema: { taskId: idField('Task') },
  },
  {
    name: 'comments_create',
    title: 'Create comment',
    description: 'Add a comment to a task, attributed to the authenticated user.',
    inputSchema: {
      taskId: idField('Task'),
      body: z.string(),
    },
  },

  // labels
  {
    name: 'labels_list',
    title: 'List labels',
    description: 'List labels on a board.',
    inputSchema: { boardId: idField('Board') },
  },
  {
    name: 'labels_create',
    title: 'Create label',
    description: 'Create a label on a board.',
    inputSchema: {
      boardId: idField('Board'),
      name: z.string(),
      color: z.string().optional().describe('Hex color, defaults to #6366f1'),
    },
  },
  {
    name: 'labels_delete',
    title: 'Delete label',
    description: 'Delete a label and remove it from all tasks.',
    inputSchema: { id: idField('Label') },
  },

  // activity
  {
    name: 'activity_list',
    title: 'List activity',
    description: 'List activity entries for a task or board, newest first.',
    inputSchema: {
      taskId: optionalId('Task'),
      boardId: optionalId('Board'),
      limit: z.number().optional(),
    },
  },

  // relations
  {
    name: 'relations_list',
    title: 'List relations',
    description: 'List blocking/blockedBy/relatedTo relations for a task.',
    inputSchema: { taskId: idField('Task') },
  },
  {
    name: 'relations_create',
    title: 'Create relation',
    description: 'Create a relation between two tasks. direction: "source" = URL task blocks other; "target" = URL task blocked by other. Defaults to "source".',
    inputSchema: {
      taskId: idField('Task'),
      otherTaskId: idField('Other task'),
      type: z.enum(['blocks', 'related_to']),
      direction: z.enum(['source', 'target']).optional(),
    },
  },
  {
    name: 'relations_delete',
    title: 'Delete relation',
    description: 'Delete a task relation by id.',
    inputSchema: { relationId: idField('Relation') },
  },

  // subscriptions
  {
    name: 'task_subscribe',
    title: 'Subscribe to task',
    description: 'Subscribe the authenticated user to a task. Idempotent.',
    inputSchema: { taskId: idField('Task') },
  },
  {
    name: 'task_unsubscribe',
    title: 'Unsubscribe from task',
    description: 'Remove the authenticated user\'s subscription to a task.',
    inputSchema: { taskId: idField('Task') },
  },
  {
    name: 'inbox_list',
    title: 'List inbox notifications',
    description: 'List the authenticated user\'s inbox notifications, newest first.',
    inputSchema: {
      filter: z.enum(['unread', 'all']).optional(),
      limit: z.number().optional(),
    },
  },
  {
    name: 'notifications_mark_read',
    title: 'Mark notification(s) read',
    description: 'Mark a single notification read by id, or all of the user\'s notifications read when id is omitted.',
    inputSchema: { id: optionalId('Notification') },
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map(t => t.name);