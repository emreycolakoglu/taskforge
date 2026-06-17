import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { api } from '../hooks/api';
import { useSocket } from '../hooks/useSocket';
import { Board, List, Task, Label } from '../types';
import { TaskCard } from './TaskCard';
import { TaskDetail } from './TaskDetail';
import { CreateTaskModal } from './CreateTaskModal';

interface KanbanBoardProps {
  board: Board;
}

export function KanbanBoard({ board }: KanbanBoardProps) {
  const [lists, setLists] = useState<List[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [creatingInList, setCreatingInList] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  const loadBoard = useCallback(async () => {
    const full = await api.boards.getFull(board.id);
    setLists(full.lists || []);
    setLabels(full.labels || []);
  }, [board.id]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  const socket = useSocket(board.id);
  useEffect(() => {
    const unsub1 = socket.on('task:created', loadBoard);
    const unsub2 = socket.on('task:updated', loadBoard);
    const unsub3 = socket.on('task:moved', loadBoard);
    const unsub4 = socket.on('list:created', loadBoard);
    const unsub5 = socket.on('list:updated', loadBoard);
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
  }, [socket, loadBoard]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;

    if (source.droppableId === destination.droppableId) {
      // Reorder within same list
      const list = lists.find((l) => l.id === source.droppableId);
      if (!list?.tasks) return;
      const reordered = [...list.tasks];
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      const items = reordered.map((t, i) => ({ id: t.id, position: i }));
      await api.tasks.reorder(items);
    } else {
      // Move to different list
      const targetList = lists.find((l) => l.id === destination.droppableId);
      const targetTasks = targetList?.tasks || [];
      const position = destination.index < targetTasks.length
        ? targetTasks[destination.index].position
        : (targetTasks.length > 0 ? targetTasks[targetTasks.length - 1].position + 1 : 0);
      await api.tasks.move(draggableId, { listId: destination.droppableId, position });
    }
  };

  const handleCreateTask = async (listId: string, title: string) => {
    await api.tasks.create({ listId, title });
    setCreatingInList(null);
  };

  async function handleDeleteList(listId: string) {
    await api.lists.delete(listId);
    loadBoard();
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#6366f1';
      default: return '#94a3b8';
    }
  };

  if (viewMode === 'list') {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700 }}>{board.name}</h2>
          <button onClick={() => setViewMode('kanban')} style={toggleBtnStyle}>Kanban</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8f9fc' }}>
              <th style={thStyle}>Task</th>
              <th style={thStyle}>List</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Assignee</th>
              <th style={thStyle}>Due</th>
            </tr>
          </thead>
          <tbody>
            {lists.flatMap((l) =>
              (l.tasks || []).map((t) => (
                <tr key={t.id} onClick={() => setSelectedTask(t)} style={{ cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>{t.title}</td>
                  <td style={tdStyle}>{l.name}</td>
                  <td style={tdStyle}>
                    <span style={{ color: priorityColor(t.priority), fontWeight: 600, fontSize: '12px' }}>
                      {t.priority}
                    </span>
                  </td>
                  <td style={tdStyle}>{t.assignee || '—'}</td>
                  <td style={tdStyle}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={loadBoard} />}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700 }}>{board.name}</h2>
          {labels.map((l) => (
            <span key={l.id} style={{ background: l.color, color: '#fff', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
              {l.name}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setViewMode('list')} style={toggleBtnStyle}>List</button>
          <button onClick={() => setViewMode('kanban')} style={{ ...toggleBtnStyle, background: '#6366f1', color: '#fff' }}>Kanban</button>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: '16px', flex: 1, overflowX: 'auto' }}>
          {lists.map((list) => (
            <Droppable key={list.id} droppableId={list.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    minWidth: '280px',
                    maxWidth: '320px',
                    flex: 1,
                    background: snapshot.isDraggingOver ? '#eef2ff' : '#f8f9fc',
                    borderRadius: '12px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '100%',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: list.color || '#6366f1' }} />
                      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a2e' }}>{list.name}</h3>
                      <span style={{ fontSize: '12px', color: '#999', background: '#e8e8f0', padding: '0 8px', borderRadius: '8px' }}>
                        {list.tasks?.length || 0}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => setCreatingInList(list.id)}
                        style={addBtnStyle}
                        title="Add task"
                      >
                        +
                      </button>
                      <button
                        onClick={() => handleDeleteList(list.id)}
                        style={{ ...addBtnStyle, color: '#ef4444', fontSize: '14px' }}
                        title="Delete list"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', minHeight: '60px' }}>
                    {(list.tasks || []).map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => setSelectedTask(task)}
                            style={{
                              ...provided.draggableProps.style,
                              background: snapshot.isDragging ? '#fff' : '#fff',
                              borderRadius: '8px',
                              padding: '12px',
                              marginBottom: '8px',
                              border: '1px solid #e8e8f0',
                              boxShadow: snapshot.isDragging ? '0 4px 16px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                              {task.labels?.map((tl) => (
                                <span key={tl.labelId} style={{ background: tl.label.color, color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
                                  {tl.label.name}
                                </span>
                              ))}
                            </div>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a2e', marginBottom: '8px', lineHeight: 1.4 }}>
                              {task.title}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#999' }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {task.priority !== 'medium' && (
                                  <span style={{ color: priorityColor(task.priority), fontWeight: 600 }}>
                                    {task.priority}
                                  </span>
                                )}
                                {task._count && task._count.comments > 0 && (
                                  <span>💬 {task._count.comments}</span>
                                )}
                              </div>
                              {task.assignee && (
                                <div style={{
                                  width: '24px', height: '24px', borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '10px', fontWeight: 700,
                                }}>
                                  {task.assignee.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>

                  {creatingInList === list.id && (
                    <CreateTaskModal
                      listId={list.id}
                      onSubmit={(title) => handleCreateTask(list.id, title)}
                      onClose={() => setCreatingInList(null)}
                    />
                  )}
                </div>
              )}
            </Droppable>
          ))}

          {/* Add list button */}
          <div style={{ minWidth: '280px' }}>
            <AddListForm boardId={board.id} onCreated={loadBoard} />
          </div>
        </div>
      </DragDropContext>

      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={loadBoard} />
      )}
    </div>
  );
}

function AddListForm({ boardId, onCreated }: { boardId: string; onCreated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await api.lists.create({ boardId, name: name.trim() });
    setName('');
    setEditing(false);
    onCreated();
  };

  return editing ? (
    <div style={{ background: '#f8f9fc', borderRadius: '12px', padding: '12px' }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="List name..."
        style={{
          width: '100%', padding: '8px 10px', border: '2px solid #6366f1',
          borderRadius: '6px', fontSize: '13px', outline: 'none', marginBottom: '8px',
        }}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleSubmit} style={{ ...toggleBtnStyle, background: '#6366f1', color: '#fff' }}>Add</button>
        <button onClick={() => setEditing(false)} style={toggleBtnStyle}>Cancel</button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setEditing(true)}
      style={{
        width: '100%', padding: '12px', border: '2px dashed #d0d0e0',
        borderRadius: '12px', background: 'transparent', cursor: 'pointer',
        color: '#999', fontSize: '13px', fontWeight: 500, textAlign: 'center',
      }}
    >
      + Add List
    </button>
  );
}

const toggleBtnStyle: React.CSSProperties = {
  padding: '6px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid #d0d0e0',
  borderRadius: '6px', background: '#fff', cursor: 'pointer', color: '#666',
};

const addBtnStyle: React.CSSProperties = {
  width: '24px', height: '24px', border: 'none', borderRadius: '4px',
  background: 'transparent', cursor: 'pointer', fontSize: '16px', fontWeight: 600,
  color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1,
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: '13px',
};
