import { useState, useEffect } from 'react';
import { api } from '../hooks/api';
import { Task, Label as LabelType } from '../types';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
}

export function TaskDetail({ task, onClose, onUpdate }: TaskDetailProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [assignee, setAssignee] = useState(task.assignee || '');
  const [comment, setComment] = useState('');
  const [labels, setLabels] = useState<LabelType[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details');
  const [activity, setActivity] = useState(task.activity || []);
  const [comments, setComments] = useState(task.comments || []);

  useEffect(() => {
    api.labels.list(task.list?.boardId || '').then(setLabels).catch(() => {});
    api.comments.list(task.id).then(setComments).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const handleSave = async () => {
    await api.tasks.update(task.id, {
      title,
      description,
      priority: priority as any,
      assignee: assignee || undefined,
    });
    onUpdate();
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    const c = await api.comments.create({ taskId: task.id, author: assignee || 'user', body: comment.trim() });
    setComments([c, ...comments]);
    setComment('');
    onUpdate();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 100, padding: '40px',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px',
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e8e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['low', 'medium', 'high', 'urgent'].map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{
                  padding: '3px 10px', fontSize: '11px', fontWeight: 600,
                  borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: priority === p ? '#6366f1' : '#f0f0f5',
                  color: priority === p ? '#fff' : '#666',
                  textTransform: 'capitalize',
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <button onClick={handleSave} style={{
            padding: '6px 16px', background: '#6366f1', color: '#fff',
            border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
          }}>
            Save
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%', fontSize: '20px', fontWeight: 700, border: 'none',
              outline: 'none', marginBottom: '16px', color: '#1a1a2e',
            }}
          />

          {/* Labels */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {(task.labels || []).map((tl) => (
              <span key={tl.labelId} style={{ background: tl.label.color, color: '#fff', fontSize: '11px', padding: '2px 10px', borderRadius: '10px', fontWeight: 600 }}>
                {tl.label.name}
              </span>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', borderBottom: '2px solid #f0f0f5' }}>
            {(['details', 'activity'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 0', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600,
                  color: activeTab === tab ? '#6366f1' : '#999',
                  borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                  marginBottom: '-2px', textTransform: 'capitalize',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'details' ? (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%', padding: '10px', border: '1px solid #e8e8f0',
                    borderRadius: '8px', fontSize: '13px', resize: 'vertical', outline: 'none',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>
                  Assignee
                </label>
                <input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="User or agent ID..."
                  style={{
                    width: '100%', padding: '10px', border: '1px solid #e8e8f0',
                    borderRadius: '8px', fontSize: '13px', outline: 'none',
                  }}
                />
              </div>
              {task.dueDate && (
                <p style={{ fontSize: '12px', color: '#999' }}>
                  Due: {new Date(task.dueDate).toLocaleDateString()}
                </p>
              )}

              {/* Comments */}
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: '#1a1a2e' }}>
                  Comments ({comments.length})
                </h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    placeholder="Add a comment..."
                    style={{
                      flex: 1, padding: '10px', border: '1px solid #e8e8f0',
                      borderRadius: '8px', fontSize: '13px', outline: 'none',
                    }}
                  />
                  <button onClick={handleAddComment} style={{
                    padding: '8px 16px', background: '#6366f1', color: '#fff',
                    border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '12px', cursor: 'pointer',
                  }}>
                    Send
                  </button>
                </div>
                {comments.map((c) => (
                  <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#6366f1' }}>{c.author}</span>
                      <span style={{ fontSize: '11px', color: '#bbb' }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: '#444', lineHeight: 1.5 }}>{c.body}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div>
              {activity.map((a) => (
                <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f5', fontSize: '13px', color: '#666' }}>
                  <span style={{ fontWeight: 600, color: '#6366f1' }}>{a.actor}</span>
                  {' '}{a.action}
                  {a.detail && (() => {
                    try { const d = JSON.parse(a.detail); return d.changes ? ` — ${d.changes.join(', ')}` : d.to ? ` → ${d.to}` : d.listName ? ` → ${d.listName}` : ''; } catch { return ''; }
                  })()}
                  <span style={{ float: 'right', fontSize: '11px', color: '#bbb' }}>{new Date(a.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
