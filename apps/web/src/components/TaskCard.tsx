import { Task } from '../types';

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  return (
    <div style={{
      background: '#fff', borderRadius: '8px', padding: '12px',
      border: '1px solid #e8e8f0', cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a2e', marginBottom: '8px' }}>{task.title}</p>
      {task.description && (
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '8px', lineHeight: 1.4 }}>
          {task.description.substring(0, 80)}{task.description.length > 80 ? '...' : ''}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#aaa' }}>
        <span>{task.assignee || 'Unassigned'}</span>
        {task._count?.comments ? <span>💬 {task._count.comments}</span> : null}
      </div>
    </div>
  );
}
