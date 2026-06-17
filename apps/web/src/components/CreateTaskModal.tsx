import { useState } from 'react';

interface CreateTaskModalProps {
  listId: string;
  onSubmit: (title: string) => void;
  onClose: () => void;
}

export function CreateTaskModal({ listId, onSubmit, onClose }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit(title.trim());
  };

  return (
    <div>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Task title..."
        style={{
          width: '100%', padding: '8px 10px', border: '2px solid #6366f1',
          borderRadius: '6px', fontSize: '13px', outline: 'none', marginBottom: '8px',
        }}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleSubmit} style={{
          padding: '6px 14px', background: '#6366f1', color: '#fff',
          border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer',
        }}>
          Add
        </button>
        <button onClick={onClose} style={{
          padding: '6px 14px', background: '#f0f0f5', color: '#666',
          border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer',
        }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
