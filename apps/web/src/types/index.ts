export interface Board {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
  lists?: List[];
  labels?: Label[];
  members?: Member[];
  _count?: { lists: number; tasks: number };
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
  title: string;
  description?: string;
  position: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'active' | 'archived' | 'done';
  assignee?: string;
  metadata?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  list?: List;
  labels?: TaskLabel[];
  comments?: Comment[];
  activity?: Activity[];
  _count?: { comments: number };
}

export interface TaskLabel {
  taskId: string;
  labelId: string;
  label: Label;
}

export interface Label {
  id: string;
  boardId: string;
  name: string;
  color: string;
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

export const API_BASE = '/api';
