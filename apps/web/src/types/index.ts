export interface Board {
  id: string;
  name: string;
  slug: string;
  identifier: string;
  description?: string;
  createdAt: string;
  lists?: List[];
  labels?: Label[];
  members?: Member[];
  _count?: { lists: number; tasks: number };
  nextTaskNum?: number;
}

export interface List {
  id: string;
  boardId: string;
  name: string;
  position: number;
  color?: string;
  wipLimit?: number;
  tasks?: Task[];
  _count?: { tasks: number };
}

export interface Task {
  id: string;
  listId: string;
  boardId: string;
  number: number;
  taskNumber: string;
  title: string;
  description?: string;
  position: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'active' | 'archived' | 'done';
  assigneeId?: string | null;
  assignee?: User | null;
  metadata?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  list?: List;
  labels?: TaskLabel[];
  taskLabels?: TaskLabel[];
  comments?: Comment[];
  activity?: Activity[];
  _count?: { comments: number };
}

export interface TaskLabel {
  taskId: string;
  labelId: string;
  assignedAt: string;
  label: Label;
}

export interface Label {
  id: string;
  boardId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  taskId: string;
  actor: string;
  action: string;
  detail?: string;
  createdAt: string;
}

export interface Member {
  id: string;
  boardId: string;
  userId: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  createdAt: string;
  updatedAt: string;
}

export interface AuthStatus {
  onboarded: boolean;
  title: string | null;
}

export interface OnboardRequest {
  email: string;
  password: string;
  displayName: string;
  title: string;
}

export interface AuthResponse {
  user: User;
  session: {
    token: string;
    expiresAt: string;
  };
}

export interface InviteTokenResponse {
  id: string;
  token: string;
  expiresAt: string;
}

export interface Invite {
  id: string;
  token: string;
  createdBy: string;
  creatorName: string;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
  isUsed: boolean;
}

export interface Settings {
  id: string;
  title: string;
  onboarded: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export const API_BASE = '/api';

export const PREDEFINED_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#22C55E', // green
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#A855F7', // purple
  '#EC4899', // pink
  '#78716C', // stone
  '#64748B', // slate
];