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
      identifier: z
        .string()
        .optional()
        .describe('Short uppercase prefix for task numbers, e.g. TF'),
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
    description: "Update a board's name, slug, identifier, description, or icon.",
    inputSchema: {
      id: idField('Board'),
      name: z.string().optional(),
      slug: z.string().optional(),
      identifier: z
        .string()
        .optional()
        .describe('Short uppercase prefix for task numbers, e.g. TF'),
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
      type: z
        .enum(['triage', 'backlog', 'todo', 'in_progress', 'done', 'cancelled', 'duplicate'])
        .describe('Status type — determines progress defaults and terminal behavior'),
      position: z.number().optional(),
      color: z.string().optional(),
    },
  },
  {
    name: 'statuses_update',
    title: 'Update status',
    description: 'Update a status name, type, color, or progress.',
    inputSchema: {
      id: idField('Status'),
      name: z.string().optional(),
      type: z
        .enum(['triage', 'backlog', 'todo', 'in_progress', 'done', 'cancelled', 'duplicate'])
        .optional(),
      color: z.string().optional(),
      position: z.number().optional(),
      progress: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe('Progress percentage (0-100). Only editable for triage and in_progress types.'),
    },
  },
  {
    name: 'statuses_delete',
    title: 'Delete status',
    description: 'Delete a status and its tasks.',
    inputSchema: { id: idField('Status') },
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
      parentId: z
        .string()
        .nullable()
        .optional()
        .describe('Filter by parent task id; null for top-level tasks only'),
      include: z
        .enum(['top', 'sub'])
        .optional()
        .describe('"top" = top-level only, "sub" = sub-tasks only'),
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
      estimate: z.number().optional(),
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
      estimate: z.number().nullable().optional(),
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
    description:
      'List comments on a task as a threaded tree: top-level comments newest-first, replies nested under parents oldest-first. Tombstoned (deleted) comments come back with body "" and a deletedAt timestamp.',
    inputSchema: { taskId: idField('Task') },
  },
  {
    name: 'comments_create',
    title: 'Create comment',
    description:
      'Add a comment to a task, attributed to the authenticated user. To reply, set parentId to the comment being replied to (must be on the same task).',
    inputSchema: {
      taskId: idField('Task'),
      body: z.string(),
      parentId: z.string().optional().describe('Id of the comment being replied to'),
    },
  },
  {
    name: 'comments_delete',
    title: 'Delete comment',
    description:
      'Delete a comment by its id. Only the author or an admin can delete. Anonymous (MCP bot) comments require admin. Comments that have replies are tombstoned (body blanked, deletedAt set) so the thread structure survives; leaf comments are removed outright.',
    inputSchema: {
      id: z.string(),
    },
  },
  {
    name: 'comments_update',
    title: 'Update comment',
    description: 'Edit a comment body. Only the author or an admin can edit.',
    inputSchema: {
      id: z.string(),
      body: z.string(),
    },
  },
  {
    name: 'comments_react',
    title: 'Toggle reaction',
    description:
      'Toggle an emoji reaction on a comment. Idempotent: reacting again removes it. Emoji must be in the curated allowlist.',
    inputSchema: {
      commentId: z.string(),
      emoji: z.string(),
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

  // views
  {
    name: 'views_list',
    title: 'List views',
    description: "List saved views on a board (shared views plus the caller's own personal views).",
    inputSchema: { boardId: idField('Board') },
  },
  {
    name: 'views_create',
    title: 'Create view',
    description:
      'Create a saved view for a board. shared=false (default) makes it personal to the caller; shared=true requires board membership.',
    inputSchema: {
      boardId: idField('Board'),
      name: z.string(),
      filters: z
        .object({
          labelIds: z.array(z.string()).optional(),
          assigneeIds: z.array(z.string()).optional(),
          priorities: z.array(z.enum(['low', 'medium', 'high', 'urgent'])).optional(),
          dueDateRange: z
            .object({ from: z.string().optional(), to: z.string().optional() })
            .optional(),
          searchQuery: z.string().optional(),
        })
        .optional(),
      groupBy: z.enum(['status', 'assignee', 'priority', 'label', 'none']).optional(),
      sortBy: z.enum(['position', 'priority', 'dueDate', 'title']).optional(),
      layout: z.enum(['board', 'list']).optional(),
      shared: z.boolean().optional(),
      position: z.number().optional(),
    },
  },
  {
    name: 'views_update',
    title: 'Update view',
    description:
      'Update a saved view (name, filters, groupBy, sortBy, layout, position). Personal views: owner only. Shared views: owner or board admin.',
    inputSchema: {
      id: idField('View'),
      name: z.string().optional(),
      filters: z.record(z.any()).optional(),
      groupBy: z.enum(['status', 'assignee', 'priority', 'label', 'none']).optional(),
      sortBy: z.enum(['position', 'priority', 'dueDate', 'title']).optional(),
      layout: z.enum(['board', 'list']).optional(),
      position: z.number().optional(),
    },
  },
  {
    name: 'views_delete',
    title: 'Delete view',
    description:
      'Delete a saved view. Personal views: owner only. Shared views: owner or board admins.',
    inputSchema: { id: idField('View') },
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
    description:
      'Create a relation between two tasks. direction: "source" = URL task is the source; "target" = other is the source. For "blocks": source blocks other. For "duplicate_of": source is the duplicate of other (the canonical). Defaults to "source".',
    inputSchema: {
      taskId: idField('Task'),
      otherTaskId: idField('Other task'),
      type: z.enum(['blocks', 'related_to', 'duplicate_of']),
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
    description: "Remove the authenticated user's subscription to a task.",
    inputSchema: { taskId: idField('Task') },
  },
  {
    name: 'inbox_list',
    title: 'List inbox notifications',
    description:
      'List the authenticated user\'s inbox notifications, newest first. Actions include "commented" (someone commented on a subscribed task) and "mentioned" (you were @-mentioned).',
    inputSchema: {
      filter: z.enum(['unread', 'all']).optional(),
      limit: z.number().optional(),
    },
  },
  {
    name: 'notifications_mark_read',
    title: 'Mark notification(s) read',
    description:
      "Mark a single notification read by id, or all of the user's notifications read when id is omitted.",
    inputSchema: { id: optionalId('Notification') },
  },

  // members
  {
    name: 'members_list',
    title: 'List members',
    description: 'List members of a board.',
    inputSchema: { boardId: idField('Board') },
  },
  {
    name: 'members_add',
    title: 'Add member',
    description: 'Add a member to a board. Requires board admin or global admin.',
    inputSchema: {
      boardId: idField('Board'),
      userId: idField('User'),
      role: z
        .enum(['admin', 'member', 'viewer'])
        .optional()
        .describe('Role: admin, member, or viewer'),
    },
  },
  {
    name: 'members_remove',
    title: 'Remove member',
    description: 'Remove a member from a board. Requires board admin or global admin.',
    inputSchema: {
      boardId: idField('Board'),
      userId: idField('User'),
    },
  },
  {
    name: 'members_join',
    title: 'Join board',
    description: 'Join a board as a member. Any authenticated user can join any board.',
    inputSchema: { boardId: idField('Board') },
  },
  {
    name: 'members_leave',
    title: 'Leave board',
    description: 'Leave a board. Cannot leave if you are the last admin.',
    inputSchema: { boardId: idField('Board') },
  },

  // documents
  {
    name: 'documents_list',
    title: 'List documents',
    description:
      'List documents for a board or a task, newest first. Excludes bodies. With neither boardId nor taskId, lists every document across all boards.',
    inputSchema: {
      boardId: optionalId('Board'),
      taskId: optionalId('Task'),
      limit: z.number().optional(),
    },
  },
  {
    name: 'documents_get',
    title: 'Get document',
    description: 'Get a single document with its full markdown body and linked task.',
    inputSchema: { id: idField('Document') },
  },
  {
    name: 'documents_create',
    title: 'Create document',
    description: 'Create a markdown document attached to a task.',
    inputSchema: {
      taskId: idField('Task'),
      title: z.string(),
      body: z.string().optional(),
    },
  },
  {
    name: 'documents_update',
    title: 'Update document',
    description: 'Update a document title or body.',
    inputSchema: {
      id: idField('Document'),
      title: z.string().optional(),
      body: z.string().optional(),
    },
  },
  {
    name: 'documents_delete',
    title: 'Delete document',
    description: 'Delete a document.',
    inputSchema: { id: idField('Document') },
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);
