import { useState, useEffect } from 'react';
import { api } from '../hooks/api';
import { Board } from '../types';
import { KanbanBoard } from '../components/KanbanBoard';

export function HomePage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  useEffect(() => {
    api.boards.list().then(setBoards).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) return;
    const board = await api.boards.create({ name: name.trim(), slug: slug.trim() });
    setBoards([board, ...boards]);
    setShowCreate(false);
    setName('');
    setSlug('');
    setActiveBoard(board);
  };

  const handleDelete = async (id: string) => {
    await api.boards.delete(id);
    setBoards(boards.filter((b) => b.id !== id));
    if (activeBoard?.id === id) setActiveBoard(null);
  };

  if (activeBoard) {
    return <KanbanBoard board={activeBoard} />;
  }

  return (
    <div style={{ padding: '48px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', marginBottom: '4px' }}>TaskForge</h1>
          <p style={{ fontSize: '14px', color: '#999' }}>Task tracking for humans and agents.</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          padding: '10px 20px', background: '#6366f1', color: '#fff',
          border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
        }}>
          + New Board
        </button>
      </div>

      {showCreate && (
        <div style={{ background: '#f8f9fc', borderRadius: '12px', padding: '20px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Board name"
              style={{
                flex: 1, padding: '10px 12px', border: '2px solid #6366f1',
                borderRadius: '8px', fontSize: '13px', outline: 'none',
              }}
            />
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, '').toLowerCase())}
              placeholder="slug-name"
              style={{
                flex: 1, padding: '10px 12px', border: '2px solid #6366f1',
                borderRadius: '8px', fontSize: '13px', outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCreate} style={{
              padding: '8px 20px', background: '#6366f1', color: '#fff',
              border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer',
            }}>
              Create Board
            </button>
            <button onClick={() => setShowCreate(false)} style={{
              padding: '8px 20px', background: '#f0f0f5', color: '#666',
              border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {boards.map((board) => (
          <div
            key={board.id}
            onClick={() => setActiveBoard(board)}
            style={{
              padding: '20px', background: '#fff', borderRadius: '12px',
              border: '1px solid #e8e8f0', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              transition: 'box-shadow 0.15s',
            }}
          >
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a2e', marginBottom: '4px' }}>{board.name}</h3>
              <p style={{ fontSize: '12px', color: '#999' }}>
                {board._count?.lists || 0} lists · {board._count?.tasks || 0} tasks
                {board.description && ` · ${board.description}`}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(board.id); }}
              style={{
                padding: '6px 12px', background: '#fef2f2', color: '#ef4444',
                border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Delete
            </button>
          </div>
        ))}
        {boards.length === 0 && (
          <p style={{ textAlign: 'center', color: '#bbb', padding: '40px', fontSize: '14px' }}>
            No boards yet. Create one to get started!
          </p>
        )}
      </div>
    </div>
  );
}
