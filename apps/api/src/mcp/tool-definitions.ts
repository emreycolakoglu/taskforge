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
    description: 'List all boards with status and member counts.',
    inputSchema: {},
  },
  {
    name: 'boards_get',
    title: 'Get board',
    description: 'Get a single board with its statuses, tasks, and labels.',
    inputSchema: { id: idField('Board') },
  },
  {
    name: 'boards_create',
    title: 'Create board',
    description: 'Create a board with the given slug/identifier and five default statuses.',
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
    description: 'Delete a board and all of its statuses, tasks, and labels.',
    inputSchema: { id: idField('Board') },
  },
  {
    name: 'boards_update',
    title: 'Update board',
    description: 'Update a board\'s name, slug, identifier, description, or icon.',
    inputSchema: {
      id: idField('Board'),
      name: z.string().optional(),
      slug: z.string().optional(),
      identifier: z.string().optional().describe('Short uppercase prefix for task numbers, e.g. TF'),
      description: z.string().optional(),
      icon: z.string().optional().describe('Emoji icon for the board, e.g. ⭐'),
    },
  },

  // statuses
  {
    name: 'statuses_list',
    title: 'List statuses',
    description: 'List statuses for a board, ordered by position.',
    inputSchema: { boardId: idField('Board') },
  },
  {
    name: 'statuses_create',
    title: 'Create status',
    description: 'Create a status in a board. position defaults to end of board.',
    inputSchema: {
      boardId: idField('Board'),
      name: z.string(),
      position: z.number().optional(),
      color: z.string().optional(),
      wipLimit: z.number().optional(),
    },
  },
  {
    name: 'statuses_update',
    title: 'Update status',
    description: 'Update a status name, color, or WIP limit.',
    inputSchema: {
      id: idField('Status'),
      name: z.string().optional(),
      color: z.string().optional(),
      wipLimit: z.number().optional(),
    },
  },
  {
    name: 'statuses_delete',
    title: 'Delete status',
    description: 'Delete a status and its tasks.',
    inputSchema: { id: idField('Status') },
  },
  {
    name: 'statuses_toggle_done',
    title: 'Toggle Done status',
    description: 'Set a status as the board\'s Done column. Stamps doneAt on its tasks and clears doneAt on the previous Done status\'s tasks.',
    inputSchema: { id: idField('Status') },
  },
  {
    name: 'statuses_unset_done',
    title: 'Unset Done status',
    description: 'Clear the board\'s Done column. Clears isDone and doneAt on the current Done status and its tasks.',
    inputSchema: { boardId: idField('Board') },
  },

  // tasks
  {
    name: 'tasks_list',
    title: 'List tasks',
    description: 'List tasks with optional filters.',
    inputSchema: {
      boardId: optionalId('Board'),
      statusId: optionalId('Status'),
      assigneeId: optionalId('Assignee'),
      parentId: z.string().nullable().optional().describe('Filter by parent task id; null for top-level tasks only'),
      include: z.enum(['top', 'sub']).optional().describe('"top" = top-level only, "sub" = sub-tasks only'),
      limit: z.number().optional(),
    },
  },
  {
    name: 'tasks_get',
    title: 'Get task',
    description: 'Get a single task with status, board, labels, comments, activity, and sub-tasks.',
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
    description: 'Create a task in a status. assigneeId defaults to the authenticated user.',
    inputSchema: {
      statusId: idField('Status'),
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
      assigneeId: z.string().optional(),
      dueDate: z.string().optional(),
      statusId: z.string().optional(),
      position: z.number().optional(),
      parentId: z.string().nullable().optional(),
      labelIds: z.array(z.string()).optional(),
    },
  },
  {
    name: 'tasks_move',
    title: 'Move task',
    description: 'Move a task to a different status. position defaults to end of status.',
    inputSchema: {
      id: idField('Task'),
      statusId: idField('Target status'),
      position: z.number().optional(),
    },
  },
  {
    name: 'tasks_delete',
    title: 'Delete task',
    description: 'Hard-delete a task. Cleans up its relations.',
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
  {
    name: 'comments_delete',
    title: 'Delete comment',
    description: 'Delete a comment by its id. Only the author or an admin can delete. Anonymous (MCP bot) comments require admin.',
    inputSchema: {
      id: z.string(),
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