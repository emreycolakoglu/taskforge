import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  // Clean slate
  await prisma.notification.deleteMany()
  await prisma.taskSubscription.deleteMany()
  await prisma.taskRelation.deleteMany()
  await prisma.taskLabel.deleteMany()
  await prisma.activity.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.task.deleteMany()
  await prisma.label.deleteMany()
  await prisma.status.deleteMany()
  await prisma.member.deleteMany()
  await prisma.inviteToken.deleteMany()
  await prisma.session.deleteMany()
  await prisma.board.deleteMany()
  await prisma.user.deleteMany()
  await prisma.settings.deleteMany()

  // Settings
  await prisma.settings.create({
    data: { id: 'singleton', title: 'TaskForge', onboarded: true },
  })

  // Users
  const passwordHash = await bcrypt.hash('password123', 12)
  const alice = await prisma.user.create({
    data: { email: 'alice@example.com', passwordHash, displayName: 'Alice', role: 'admin' },
  })
  const bob = await prisma.user.create({
    data: { email: 'bob@example.com', passwordHash, displayName: 'Bob', role: 'member' },
  })
  const charlie = await prisma.user.create({
    data: { email: 'charlie@example.com', passwordHash, displayName: 'Charlie', role: 'member' },
  })

  // Session for Alice (so we can login)
  await prisma.session.create({
    data: {
      token: crypto.randomUUID(),
      userId: alice.id,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  })

  // Board
  const board = await prisma.board.create({
    data: {
      name: 'Sprint 24',
      slug: 'sprint-24',
      identifier: 'SPR',
      icon: '🚀',
      nextTaskNum: 7,
    },
  })

  // Statuses
  const backlog = await prisma.status.create({ data: { boardId: board.id, name: 'Backlog', position: 0, color: '#94a3b8', progress: 0 } })
  const todo = await prisma.status.create({ data: { boardId: board.id, name: 'To Do', position: 1, color: '#6366f1', progress: 25 } })
  const inProgress = await prisma.status.create({ data: { boardId: board.id, name: 'In Progress', position: 2, color: '#f59e0b', progress: 50 } })
  const review = await prisma.status.create({ data: { boardId: board.id, name: 'Review', position: 3, color: '#8b5cf6', progress: 75 } })
  const done = await prisma.status.create({ data: { boardId: board.id, name: 'Done', position: 4, color: '#22c55e', isDone: true, progress: 100 } })

  // Labels
  const bug = await prisma.label.create({ data: { boardId: board.id, name: 'Bug', color: '#EF4444' } })
  const feature = await prisma.label.create({ data: { boardId: board.id, name: 'Feature', color: '#22C55E' } })
  const docs = await prisma.label.create({ data: { boardId: board.id, name: 'Documentation', color: '#3B82F6' } })
  const urgent = await prisma.label.create({ data: { boardId: board.id, name: 'Urgent', color: '#F97316' } })

  // Tasks
  const t1 = await prisma.task.create({
    data: { statusId: todo.id, boardId: board.id, number: 1, title: 'Set up CI/CD pipeline', position: 0, priority: 'high', assigneeId: alice.id },
  })
  const t2 = await prisma.task.create({
    data: { statusId: todo.id, boardId: board.id, number: 2, title: 'Design landing page', position: 1, priority: 'medium', assigneeId: bob.id },
  })
  const t3 = await prisma.task.create({
    data: { statusId: inProgress.id, boardId: board.id, number: 3, title: 'Implement user authentication', position: 0, priority: 'urgent', assigneeId: alice.id, description: 'Add email/password login, session management, and invite-based signup flow.' },
  })
  const t4 = await prisma.task.create({
    data: { statusId: inProgress.id, boardId: board.id, number: 4, title: 'Add dark mode support', position: 1, priority: 'medium', assigneeId: charlie.id },
  })
  const t5 = await prisma.task.create({
    data: { statusId: review.id, boardId: board.id, number: 5, title: 'Review PR #142 — API refactor', position: 0, priority: 'high', description: 'Major refactor of the task service layer. Needs careful review of the new optimistic update logic.' },
  })
  const t6 = await prisma.task.create({
    data: { statusId: done.id, boardId: board.id, number: 6, title: 'Write API documentation', position: 0, priority: 'low', assigneeId: bob.id },
  })

  // Link labels to tasks
  await prisma.taskLabel.createMany({
    data: [
      { taskId: t3.id, labelId: feature.id },
      { taskId: t3.id, labelId: urgent.id },
      { taskId: t1.id, labelId: bug.id },
      { taskId: t5.id, labelId: bug.id },
      { taskId: t6.id, labelId: docs.id },
    ],
  })

  // Comments
  await prisma.comment.createMany({
    data: [
      { taskId: t3.id, authorId: alice.id, author: 'Alice', body: 'Need OAuth2 providers configured first.' },
      { taskId: t3.id, authorId: bob.id, author: 'Bob', body: 'I can help with the Google provider setup. I have experience with Passport.js.' },
      { taskId: t4.id, authorId: charlie.id, author: 'Charlie', body: 'Testing on Safari now — looks good. The CSS variables approach works well.' },
      { taskId: t5.id, authorId: alice.id, author: 'Alice', body: 'Left some comments on the optimistic update logic. The rollback path looks solid.' },
    ],
  })

  // Activity log
  await prisma.activity.createMany({
    data: [
      { taskId: t3.id, actorId: alice.id, actor: 'Alice', action: 'created', detail: JSON.stringify({ title: t3.title }) },
      { taskId: t3.id, actorId: bob.id, actor: 'Bob', action: 'commented', detail: JSON.stringify({ commentId: 'seed' }) },
      { taskId: t4.id, actorId: charlie.id, actor: 'Charlie', action: 'created', detail: JSON.stringify({ title: t4.title }) },
      { taskId: t5.id, actorId: alice.id, actor: 'Alice', action: 'moved', detail: JSON.stringify({ to: 'Review' }) },
    ],
  })

  console.log('✅ Seeded:')
  console.log(`   Board: ${board.name} (${board.identifier})`)
  console.log(`   5 statuses, 4 labels, 6 tasks, 4 comments`)
  console.log(`   3 users: alice@example.com / bob@example.com / charlie@example.com`)
  console.log(`   Password: password123`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
