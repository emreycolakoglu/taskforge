import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create a board with lists and tasks
  const board = await prisma.board.create({
    data: {
      name: 'Sprint 24',
      slug: 'sprint-24',
    },
  })

  const lists = await Promise.all([
    prisma.list.create({ data: { boardId: board.id, name: 'Backlog', position: 0, color: '#6b7280' } }),
    prisma.list.create({ data: { boardId: board.id, name: 'To Do', position: 1, color: '#3b82f6' } }),
    prisma.list.create({ data: { boardId: board.id, name: 'In Progress', position: 2, color: '#f59e0b' } }),
    prisma.list.create({ data: { boardId: board.id, name: 'Review', position: 3, color: '#8b5cf6' } }),
    prisma.list.create({ data: { boardId: board.id, name: 'Done', position: 4, color: '#10b981' } }),
  ])

  const labels = await Promise.all([
    prisma.label.create({ data: { boardId: board.id, name: 'bug', color: '#ef4444' } }),
    prisma.label.create({ data: { boardId: board.id, name: 'feature', color: '#22c55e' } }),
    prisma.label.create({ data: { boardId: board.id, name: 'docs', color: '#3b82f6' } }),
  ])

  const tasks = await Promise.all([
    prisma.task.create({ data: { listId: lists[1].id, title: 'Set up CI/CD pipeline', position: 0, priority: 'high', assignee: 'alice' } }),
    prisma.task.create({ data: { listId: lists[1].id, title: 'Design landing page', position: 1, priority: 'medium', assignee: 'bob' } }),
    prisma.task.create({ data: { listId: lists[2].id, title: 'Implement user auth', position: 0, priority: 'urgent', assignee: 'alice' } }),
    prisma.task.create({ data: { listId: lists[2].id, title: 'Add dark mode support', position: 1, priority: 'medium', assignee: 'charlie' } }),
    prisma.task.create({ data: { listId: lists[3].id, title: 'Review PR #142', position: 0, priority: 'high' } }),
    prisma.task.create({ data: { listId: lists[4].id, title: 'Write API docs', position: 0, priority: 'low', assignee: 'bob' } }),
  ])

  // Link labels to tasks
  await prisma.taskLabel.createMany({
    data: [
      { taskId: tasks[2].id, labelId: labels[1].id },
      { taskId: tasks[0].id, labelId: labels[0].id },
      { taskId: tasks[4].id, labelId: labels[0].id },
    ],
  })

  // Add comments
  await prisma.comment.createMany({
    data: [
      { taskId: tasks[2].id, author: 'alice', body: 'Need OAuth2 providers configured first.' },
      { taskId: tasks[2].id, author: 'bob', body: 'I can help with the Google provider setup.' },
      { taskId: tasks[3].id, author: 'charlie', body: 'Testing on Safari now — looks good.' },
    ],
  })

  console.log('Seeded: board with 5 lists, 6 tasks, 3 labels, 3 comments')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
