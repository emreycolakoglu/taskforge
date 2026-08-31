# Saved Custom Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist filter + group + sort combos on a board as named views (personal or shared), selectable in the board UI and addressable via `?view=<id>`.

**Architecture:** New `View` Prisma model + `views` NestJS module (CRUD, board-admin gating for shared writes, board-scoped socket events for shared views) + MCP views tools. Frontend applies views client-side: a pure `applyView()` filters/groups/sorts tasks; the active view id lives in the URL, falling back to the existing localStorage board state.

**Tech Stack:** NestJS 11 + Prisma 6 (SQLite) + class-validator; React 19 + TanStack Query v5 + Vite 6 + Vitest; Socket.IO.

**Spec:** `docs/superpowers/specs/2026-08-31-saved-views-design.md`

## Global Constraints

- API is CommonJS with `strict: false`; web is ESM with `strict: true`. Do not copy import patterns between apps; do not change tsconfigs.
- PrismaModule is `@Global()` — never import it into feature modules.
- Prettier is canonical: single quotes, semicolons, trailing commas, print width 100. Run `pnpm format` on touched files before committing.
- Design system (`design.md`): Acid Lime `--primary` for exactly one CTA per screen (Save confirm); active toggles use `bg-accent` (Graphite), never Lime; no gradients; Inter weights ≤ 590; JetBrains Mono for ids.
- Web build does not typecheck — run `cd apps/web && npx tsc --noEmit` and confirm the error count is not greater than the pre-existing 7.
- Migration command form: `pnpm --filter @taskforge/api prisma:migrate -- --name <desc>`. Test setup uses `db push` against a fresh temp DB, so no test fixture changes needed for migration.
- Kebab-case filenames everywhere.
- No ESLint; CI runs tests only. Verification = tests + tsc + prettier.

---

### Task 1: Prisma `View` model + migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/mcp/mcp.service.spec.ts` afterEach (none — see note below; only schema change in this task)
- Create: `apps/api/prisma/migrations/<timestamp>_add_views/migration.sql` (generated)

**Interfaces:**

- Produces: `prisma.view` client delegate with fields `id, boardId, userId?, name, filters, groupBy ('status'|'assignee'|'priority'|'label'|'none'), sortBy ('position'|'priority'|'dueDate'|'title'), layout ('board'|'list'), position, createdAt, updatedAt`, relations `board`, `owner` (User, nullable). Later tasks query it via `this.prisma.view.*`.

- [ ] **Step 1: Add the model to `schema.prisma`**

Append after the `Notification` model:

```prisma
model View {
  id        String   @id @default(cuid())
  boardId   String
  userId    String? // null = shared board view, set = personal
  name      String
  filters   String // JSON string: { labelIds?, assigneeIds?, priorities?, dueDateRange?, searchQuery? }
  groupBy   String   @default("status") // status | assignee | priority | label | none
  sortBy    String   @default("position") // position | priority | dueDate | title
  layout    String   @default("board") // board | list
  position  Float    @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  owner User? @relation("ViewOwner", fields: [userId], references: [id], onDelete: Cascade)

  @@index([boardId])
  @@map("views")
}
```

Add to the `Board` model's relations:

```prisma
  views     View[]
```

Add to the `User` model's relations:

```prisma
  views          View[]          @relation("ViewOwner")
```

- [ ] **Step 2: Generate client and create migration**

Run: `pnpm db:generate && pnpm --filter @taskforge/api prisma:migrate -- --name add_views`
Expected: migration created, Prisma client regenerated without error.

- [ ] **Step 3: Verify the schema is valid**

Run: `pnpm --filter @taskforge/api exec tsc --noEmit`
Expected: no new errors (API currently compiles clean).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add View model for saved board views"
```

---

### Task 2: Views DTOs

**Files:**

- Create: `apps/api/src/views/dto/create-view.dto.ts`
- Create: `apps/api/src/views/dto/update-view.dto.ts`
- Create: `apps/api/src/views/dto/view-filters.dto.ts`
- Create: `apps/api/src/views/dto/index.ts`

**Interfaces:**

- Produces: `CreateViewDto` (boardId, name, filters: ViewFiltersDto, groupBy?, sortBy?, layout?, shared: boolean, position?), `UpdateViewDto` (all optional), `ViewFiltersDto`.

- [ ] **Step 1: Write `view-filters.dto.ts`**

```ts
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export class ViewFiltersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(PRIORITIES, { each: true })
  priorities?: string[];

  @IsOptional()
  @ValidateNested()
  dueDateRange?: DueDateRangeDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  searchQuery?: string;
}

export class DueDateRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
```

Note: add `ValidateNested` and `MaxItems(20)` guards as needed — `labelIds`/`assigneeIds` must also carry `@ArrayMaxSize(50)`; import `ArrayMaxSize` from class-validator.

- [ ] **Step 2: Write `create-view.dto.ts`**

```ts
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ViewFiltersDto } from './view-filters.dto';

const GROUP_BY = ['status', 'assignee', 'priority', 'label', 'none'] as const;
const SORT_BY = ['position', 'priority', 'dueDate', 'title'] as const;
const LAYOUTS = ['board', 'list'] as const;

export class CreateViewDto {
  @IsNotEmpty()
  @IsString()
  boardId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => ViewFiltersDto)
  filters: ViewFiltersDto;

  @IsOptional()
  @IsIn(GROUP_BY)
  groupBy?: string;

  @IsOptional()
  @IsIn(SORT_BY)
  sortBy?: string;

  @IsOptional()
  @IsIn(LAYOUTS)
  layout?: string;

  @IsNotEmpty()
  @IsBoolean()
  shared: boolean;

  @IsOptional()
  @IsNumber()
  position?: number;
}
```

- [ ] **Step 3: Write `update-view.dto.ts`**

```ts
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ViewFiltersDto } from './view-filters.dto';

const GROUP_BY = ['status', 'assignee', 'priority', 'label', 'none'] as const;
const SORT_BY = ['position', 'priority', 'dueDate', 'title'] as const;
const LAYOUTS = ['board', 'list'] as const;

export class UpdateViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ViewFiltersDto)
  filters?: ViewFiltersDto;

  @IsOptional()
  @IsIn(GROUP_BY)
  groupBy?: string;

  @IsOptional()
  @IsIn(SORT_BY)
  sortBy?: string;

  @IsOptional()
  @IsIn(LAYOUTS)
  layout?: string;

  @IsOptional()
  @IsNumber()
  position?: number;
}
```

Note: `shared` is deliberately NOT updatable — visibility never flips after creation. To "share" a personal view, create a new shared one.

- [ ] **Step 4: Write `dto/index.ts`**

```ts
export * from './create-view.dto';
export * from './update-view.dto';
export * from './view-filters.dto';
```

- [ ] **Step 5: Verify compile**

Run: `pnpm --filter @taskforge/api exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/views
git commit -m "feat(api): views DTOs with class-validator filters shape"
```

---

### Task 3: ViewsService (TDD)

**Files:**

- Create: `apps/api/src/views/views.service.ts`
- Test: `apps/api/src/views/views.service.spec.ts`

**Interfaces:**

- Consumes: `PrismaService`, `EventsService`, `MembersService` (has `isBoardAdmin(boardId, userId): Promise<boolean>`), seed helpers `seedBoard/seedUser/seedView` from `test/setup.ts`.
- Produces (all used by Task 4/5):
  - `findAll(boardId: string, userId: string): Promise<any[]>` — shared + caller's personal, ordered by position.
  - `findOne(id: string, user: AuthedUser): Promise<any>` — 404 personal views whose owner isn't the caller.
  - `create(dto: CreateViewDto, user: AuthedUser): Promise<any>` — 409 on duplicate name in `{boardId, userId-or-null}` scope; shared requires membership; emits `view:created` w/ boardId only when shared.
  - `update(id, dto: UpdateViewDto, user: AuthedUser): Promise<any>` — personal: owner only; shared: owner or board admin; 409 duplicate name; emits `view:updated` w/ boardId only when shared.
  - `remove(id, user: AuthedUser): Promise<void>` — same authz; emits `view:deleted` w/ boardId only when shared.
  - `private serializeFilters(parse)` helpers — `filters` stored as JSON string; service validates round-trip on write.

- [ ] **Step 1: Add `seedView` to test setup**

In `apps/api/test/setup.ts`, after `seedDocument`:

```ts
/**
 * Seed a view on a board. `userId: null` = shared; set = personal.
 * Pass `{ userId: <id> }` for personal; no key for shared (do NOT rely on ?? null).
 */
export async function seedView(
  prisma: PrismaClient,
  boardId: string,
  overrides: Record<string, any> = {},
) {
  return prisma.view.create({
    data: {
      boardId,
      userId: 'userId' in overrides ? overrides.userId : null,
      name: overrides.name || 'Test view',
      filters: overrides.filters || '{}',
      groupBy: overrides.groupBy || 'status',
      sortBy: overrides.sortBy || 'position',
      layout: overrides.layout || 'board',
      position: overrides.position ?? 0,
    },
  });
}
```

Also export a canonical filters fixture for tests:

```ts
export const testFilters = {
  labelIds: [],
  assigneeIds: [],
  priorities: [],
  dueDateRange: {},
  searchQuery: '',
};
```

- [ ] **Step 2: Write the failing spec**

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { ViewsService } from './views.service';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedUser, seedView, testFilters } from '../../test/setup';

describe('ViewsService', () => {
  let service: ViewsService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let owner: any;
  let member: any;
  let outsider: any;
  let boardAdmin: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViewsService,
        MembersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<ViewsService>(ViewsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    owner = await seedUser(prisma, { email: 'view-owner@example.com' });
    member = await seedUser(prisma, { email: 'view-member@example.com' });
    outsider = await seedUser(prisma, { email: 'view-outsider@example.com' });
    boardAdmin = await seedUser(prisma, { email: 'view-admin@example.com' });
    await prisma.member.create({ data: { boardId: board.id, userId: owner.id, role: 'member' } });
    await prisma.member.create({
      data: { boardId: board.id, userId: boardAdmin.id, role: 'admin' },
    });
  });

  afterEach(async () => {
    await prisma.user.deleteMany();
    await prisma.board.deleteMany();
  });

  const baseDto = {
    boardId: '', // set per-test
    name: 'Urgent this week',
    filters: testFilters,
    shared: false,
  };

  it('creates a personal view with serialized filters', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id }, owner);
    expect(view.name).toBe('Urgent this week');
    expect(view.userId).toBe(owner.id);
    expect(view.filters).toBe(JSON.stringify(testFilters));
  });

  it('creates a shared view (userId null)', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, owner);
    expect(view.userId).toBeNull();
  });

  it('rejects shared view creation by a non-member', async () => {
    await expect(
      service.create({ ...baseDto, boardId: board.id, shared: true }, outsider),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects duplicate name in the same personal scope', async () => {
    await service.create({ ...baseDto, boardId: board.id, name: 'My view' }, member);
    await expect(
      service.create({ ...baseDto, boardId: board.id, name: 'My view' }, member),
    ).rejects.toThrow(ConflictException);
  });

  it('allows the same name across users (personal scopes are independent)', async () => {
    await service.create({ ...baseDto, boardId: board.id, name: 'My view' }, member);
    const other = await service.create({ ...baseDto, boardId: board.id, name: 'My view' }, owner);
    expect(other.userId).toBe(owner.id);
  });

  it('lists shared views plus only my personal views, ordered by position', async () => {
    await seedView(prisma, board.id, { name: 'shared-1', position: 2 });
    await seedView(prisma, board.id, { name: 'mine', userId: owner.id, position: 1 });
    await seedView(prisma, board.id, { name: 'theirs', userId: member.id });
    const views = await service.findAll(board.id, owner.id);
    expect(views.map((v: any) => v.name)).toEqual(['mine', 'shared-1']);
  });

  it('fetches a shared view for any authenticated user', async () => {
    const view = await seedView(prisma, board.id, { name: 'shared' });
    const found = await service.findOne(view.id, outsider);
    expect(found.id).toBe(view.id);
  });

  it("404s someone else's personal view on findOne", async () => {
    const view = await seedView(prisma, board.id, { name: 'private', userId: owner.id });
    await expect(service.findOne(view.id, outsider)).rejects.toThrow(NotFoundException);
  });

  it('owner updates their personal view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id }, member);
    const updated = await service.update(view.id, { name: 'Renamed' }, member);
    expect(updated.name).toBe('Renamed');
  });

  it('rejects personal view update by a non-owner', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id }, member);
    await expect(service.update(view.id, { name: 'x' }, owner)).rejects.toThrow(ForbiddenException);
  });

  it('board admin (not owner) updates a shared view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, member);
    const updated = await service.update(view.id, { name: 'Admin edit' }, boardAdmin);
    expect(updated.name).toBe('Admin edit'.replace('edit', 'edit')); // 'Admin edit'
  });

  it('plain member (not owner, not admin) cannot update a shared view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, owner);
    await expect(service.update(view.id, { name: 'x' }, member)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects rename to a duplicate name in the same shared scope', async () => {
    const a = await service.create(
      { ...baseDto, boardId: board.id, name: 'A', shared: true },
      owner,
    );
    const b = await service.create(
      { ...baseDto, boardId: board.id, name: 'B', shared: true },
      owner,
    );
    await expect(service.update(b.id, { name: 'A' }, owner)).rejects.toThrow(ConflictException);
  });

  it('owner deletes their personal view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id }, member);
    await service.remove(view.id, member);
    const remaining = await service.findAll(board.id, member.id);
    expect(remaining).toHaveLength(0);
  });

  it('member (non-owner) cannot delete a shared view but admin can', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, owner);
    await expect(service.remove(view.id, member)).rejects.toThrow(ForbiddenException);
    await service.remove(view.id, boardAdmin);
    expect(await service.findAll(board.id, member.id)).toHaveLength(0);
  });

  it('emits events for shared views only', async () => {
    const emitted: any[] = [];
    const orig = events.emit.bind(events);
    (events as any).emit = (...args: any[]) => {
      emitted.push(args[0]);
      return orig(...args);
    };
    const shared = await service.create({ ...baseDto, boardId: board.id, shared: true }, owner);
    const personal = await service.create({ ...baseDto, boardId: board.id, name: 'second' }, owner);
    await service.update(shared.id, { name: 'Shared v2' }, boardAdmin);
    await service.remove(shared.id, boardAdmin);
    await service.remove(personal.id, owner);
    expect(emitted.filter((e) => e.startsWith && e.startsWith('view:'))).toEqual([
      'view:created',
      'view:updated',
      'view:deleted',
    ]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=views.service`
Expected: FAIL — cannot resolve `./views.service`.

- [ ] **Step 4: Write the service**

```ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MembersService } from '../members/members.service';
import { CreateViewDto } from './dto/create-view.dto';
import { UpdateViewDto } from './dto/update-view.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Injectable()
export class ViewsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private members: MembersService,
  ) {}

  async findAll(boardId: string, userId: string) {
    return this.prisma.view.findMany({
      where: { boardId, OR: [{ userId: null }, { userId }] },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(id: string, user: AuthedUser) {
    const view = await this.prisma.view.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('View not found');
    if (view.userId && view.userId !== user?.id) throw new NotFoundException('View not found');
    return view;
  }

  async create(dto: CreateViewDto, user: AuthedUser) {
    await this.assertAccess(dto.boardId, user);
    if (dto.shared) await this.assertBoardMember(dto.boardId, user);
    const filters = JSON.stringify(dto.filters ?? {});
    await this.assertUniqueName(dto.boardId, dto.shared ? null : user.id, dto.name);
    const view = await this.prisma.view.create({
      data: {
        boardId: dto.boardId,
        userId: dto.shared ? null : user.id,
        name: dto.name,
        filters,
        groupBy: dto.groupBy ?? 'status',
        sortBy: dto.sortBy ?? 'position',
        layout: dto.layout ?? 'board',
        position: dto.position ?? 0,
      },
    });
    if (dto.shared) this.events.emit('view:created', view, dto.boardId);
    return view;
  }

  async update(id: string, dto: UpdateViewDto, user: AuthedUser) {
    const view = await this.prisma.view.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('View not found');
    await this.assertCanMutate(view, user);
    if (dto.name && dto.name !== view.name) {
      await this.assertUniqueName(view.boardId, view.userId, dto.name);
    }
    const updated = await this.prisma.view.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.filters !== undefined && { filters: JSON.stringify(dto.filters) }),
        ...(dto.groupBy !== undefined && { groupBy: dto.groupBy }),
        ...(dto.sortBy !== undefined && { sortBy: dto.sortBy }),
        ...(dto.layout !== undefined && { layout: dto.layout }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    });
    if (!view.userId) this.events.emit('view:updated', updated, view.boardId);
    return updated;
  }

  async remove(id: string, user: AuthedUser) {
    const view = await this.prisma.view.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('View not found');
    await this.assertCanMutate(view, user);
    await this.prisma.view.delete({ where: { id } });
    if (!view.userId) this.events.emit('view:deleted', { id }, view.boardId);
  }

  private async assertCanMutate(
    view: { boardId: string; userId: string | null },
    user: AuthedUser,
  ) {
    if (view.userId) {
      if (view.userId !== user?.id)
        throw new ForbiddenException('Only the owner can modify this view');
      return;
    }
    // Shared view: owner or board admin
    if (user?.id && view.userId === user.id) return; // unreachable (shared has userId null) — kept for symmetry
    const isAdmin = user?.id ? await this.members.isBoardAdmin(view.boardId, user.id) : false;
    if (!isAdmin)
      throw new ForbiddenException('Only the owner or board admins can modify a shared view');
  }

  private async assertBoardMember(boardId: string, user: AuthedUser) {
    const member = await this.prisma.member.findUnique({
      where: { boardId_userId: { boardId, userId: user.id } },
    });
    if (member) return;
    // Global admins and legacy boards (zero admin member rows) still pass
    const isAdmin = await this.members.isBoardAdmin(boardId, user.id);
    if (!isAdmin) throw new ForbiddenException('Board membership required to create shared views');
  }

  private async assertAccess(boardId: string, user: AuthedUser) {
    if (!user?.id) throw new ForbiddenException('Authentication required');
  }

  private async assertUniqueName(boardId: string, userId: string | null, name: string) {
    const existing = await this.prisma.view.findFirst({
      where: { boardId, userId: userId, name },
    });
    if (existing) throw new ConflictException(`A view named "${name}" already exists`);
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=views.service`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/views apps/api/test/setup.ts
git commit -m "feat(api): ViewsService with personal/shared scoping and admin gating"
```

---

### Task 4: Controller, module, registration

**Files:**

- Create: `apps/api/src/views/views.controller.ts`
- Create: `apps/api/src/views/views.module.ts`
- Modify: `apps/api/src/app.module.ts` (add import + registration)

**Interfaces:**

- Consumes: `ViewsService` methods from Task 3.
- Produces: REST routes registered under `/api`. `ViewsModule` exports `ViewsService` (McpModule consumes in Task 5).

- [ ] **Step 1: Write the controller**

```ts
import { Body, Controller, Delete, Get, Patch, Post, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { ViewsService } from './views.service';
import { CreateViewDto } from './dto/create-view.dto';
import { UpdateViewDto } from './dto/update-view.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api')
export class ViewsController {
  constructor(private readonly service: ViewsService) {}

  @Get('boards/:boardId/views')
  findAll(@Param('boardId') boardId: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.findAll(boardId, user!.id);
  }

  @Get('views/:id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.findOne(id, user!);
  }

  @Post('views')
  create(@Body() dto: CreateViewDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(dto, user!);
  }

  @Patch('views/:id')
  update(@Param('id') id: string, @Body() dto: UpdateViewDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto, user!);
  }

  @Delete('views/:id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user!);
  }
}
```

- [ ] **Step 2: Write the module**

```ts
import { Module } from '@nestjs/common';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [ViewsService],
})
export class ViewsModule {}
```

- [ ] **Step 3: Register in `app.module.ts`**

Add `import { ViewsModule } from './views/views.module';` and add `ViewsModule` to the imports array.

- [ ] **Step 4: Verify build + boot**

Run: `pnpm --filter @taskforge/api build`
Expected: compile succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/views apps/api/src/app.module.ts
git commit -m "feat(api): views REST routes and module registration"
```

---

### Task 5: MCP views tools

**Files:**

- Modify: `apps/api/src/mcp/tool-definitions.ts` (add 4 entries)
- Modify: `apps/api/src/mcp/mcp.service.ts` (dispatch case + handleViews)
- Modify: `apps/api/src/mcp/mcp.module.ts` (import ViewsModule)
- Modify: `apps/api/src/mcp/mcp.service.spec.ts` (add describes)
- Modify: `apps/api/src/mcp/mcp-transport.controller.spec.ts:240` (tool count 24 → 28)

**Interfaces:**

- Consumes: `ViewsService` from Task 3 (`findAll(boardId, userId)`, `findOne(id, user)`, `create(dto, user)`, `update(id, dto, user)`, `remove(id, user)`).
- Produces: JSON-RPC methods `views_list`, `views_create`, `views_update`, `views_delete` on `POST /api/mcp`.

- [ ] **Step 1: Add tool definitions**

In `tool-definitions.ts` (near the labels block), using the file's existing `idField`/`optionalId` helpers:

```ts
  // views
  {
    name: 'views_list',
    title: 'List views',
    description: 'List saved views on a board (shared views plus the caller's own personal views).',
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
          dueDateRange: z.object({ from: z.string().optional(), to: z.string().optional() }).optional(),
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
    description: 'Delete a saved view. Personal views: owner only. Shared views: owner or board admins.',
    inputSchema: { id: idField('View') },
  },
```

- [ ] **Step 2: Wire dispatch in `mcp.service.ts`**

In `handleRequest`'s switch add:

```ts
        case 'views':
          result = await this.handleViews(action, req.params, user);
          break;
```

Add the private method and constructor injection:

```ts
  private async handleViews(action: string, params: any, user?: AuthUser) {
    if (!user) throw new BadRequestException('Authentication required');
    switch (action) {
      case 'list': {
        if (!params.boardId) throw new BadRequestException('boardId is required');
        return this.views.findAll(params.boardId, user.id);
      }
      case 'get': {
        return this.views.findOne(params.id, user);
      }
      case 'create': {
        return this.views.create(
          {
            boardId: params.boardId,
            name: params.name,
            filters: params.filters ?? {},
            groupBy: params.groupBy,
            sortBy: params.sortBy,
            layout: params.layout,
            shared: params.shared ?? false,
            position: params.position,
          },
          user,
        );
      }
      case 'update': {
        return this.views.update(params.id, params, user);
      }
      case 'delete': {
        return this.views.remove(params.id, user);
      }
      default:
        throw new BadRequestException(`Unknown views action: ${action}`);
    }
  }
```

Constructor: add `private views: ViewsService,` and the import. Add `ViewsModule` to `McpModule` imports.

- [ ] **Step 3: Update tool-count assertions**

- `mcp-transport.controller.spec.ts:240`: rename `24 tools` → `28 tools` in the test title (the assertion uses `TOOL_NAMES.length`, so it self-adjusts).
- `mcp.service.spec.ts`: add views tests mirroring the labels block (list, create shared, create personal, delete).

- [ ] **Step 4: Run MCP tests**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=mcp`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mcp docs/superpowers
git commit -m "feat(mcp): views_list/create/update/delete tools"
```

---

### Task 6: Web API client + `use-views` hook + types

**Files:**

- Modify: `apps/web/src/types/index.ts` (add `View` types + `ViewFilters`)
- Modify: `apps/web/src/hooks/api.ts` (add `api.views` namespace)
- Create: `apps/web/src/hooks/use-views.ts`
- Test: `apps/web/src/hooks/views.test.ts`

**Interfaces:**

- Consumes: REST shape from Task 4.
- Produces (used by Tasks 7–9):
  - `ViewFilters { labelIds: string[]; assigneeIds: string[]; priorities: Priority[]; dueDateRange: { from: string | null; to: string | null }; searchQuery: string }`
  - `View { id, boardId, userId: string | null, name, filters: ViewFilters (parsed), groupBy, sortBy, layout: 'board' | 'list', position, createdAt, updatedAt }`
  - `api.views.list(boardId)`, `.get(id)`, `.create(data)`, `.update(id, data)`, `.delete(id)`
  - `useBoardViews(boardId)`, `useCreateView(boardId, currentUserId)`, `useUpdateView(boardId)`, `useDeleteView(boardId)`

- [ ] **Step 1: Write the failing hook test**

`apps/web/src/hooks/views.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const viewRow = {
  id: 'v1',
  boardId: 'b1',
  userId: null,
  name: 'Urgent',
  filters: JSON.stringify({ labelIds: [] }),
  groupBy: 'status',
  sortBy: 'position',
  layout: 'board',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('api.views', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists board views', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([viewRow]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const views = await api.views.list('b1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/boards/b1/views',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(views).toHaveLength(1);
  });

  it('creates a view via POST /api/views', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(viewRow));
    vi.stubGlobal('fetch', fetchMock);
    await api.views.create({
      boardId: 'b1',
      name: 'Urgent',
      filters: { labelIds: [] },
      shared: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/views',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
```

(If the project pattern uses a different mocking helper — check `hooks/use-tasks.test.tsx` — follow it.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run src/hooks/views.test.ts`
Expected: FAIL — `api.views` is undefined.

- [ ] **Step 3: Add `api.views` namespace to `hooks/api.ts`**

```ts
  // Views
  views: {
    list: (boardId: string) => request<View[]>(`/boards/${boardId}/views`),
    get: (id: string) => request<View>(`/views/${id}`),
    create: (data: {
      boardId: string;
      name: string;
      filters: ViewFilters;
      groupBy?: string;
      sortBy?: string;
      layout?: string;
      shared: boolean;
      position?: number;
    }) => request<View>('/views', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<View, 'name' | 'groupBy' | 'sortBy' | 'layout' | 'position'>> & { filters?: ViewFilters }) =>
      request<View>(`/views/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/views/${id}`, { method: 'DELETE' }),
  },
```

- [ ] **Step 4: Add types to `types/index.ts`**

```ts
export type ViewGroupBy = 'status' | 'assignee' | 'priority' | 'label' | 'none';
export type ViewSortBy = 'position' | 'priority' | 'dueDate' | 'title';

export interface ViewFilters {
  labelIds?: string[];
  assigneeIds?: string[];
  priorities?: ('low' | 'medium' | 'high' | 'urgent')[];
  dueDateRange?: { from?: string | null; to?: string | null };
  searchQuery?: string;
}

export interface View {
  id: string;
  boardId: string;
  userId: string | null;
  name: string;
  filters: ViewFilters;
  groupBy: ViewGroupBy;
  sortBy: ViewSortBy;
  layout: 'board' | 'list';
  position: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 5: Write `hooks/use-views.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { ViewFilters } from '../types';

export function useBoardViews(boardId: string) {
  return useQuery({
    queryKey: ['views', boardId],
    queryFn: () => api.views.list(boardId),
  });
}

export function useCreateView(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      filters: ViewFilters;
      groupBy?: string;
      sortBy?: string;
      layout?: string;
      shared: boolean;
    }) => api.views.create({ ...data, boardId }),
    onSuccess: () => {
      toast.success('View saved');
      queryClient.invalidateQueries({ queryKey: ['views', boardId] });
    },
    onError: (error) => {
      toast.error('Failed to save view', { description: error.message });
    },
  });
}

export function useUpdateView(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.views.update>[1] }) =>
      api.views.update(id, data),
    onSuccess: () => {
      toast.success('View updated');
      queryClient.invalidateQueries({ queryKey: ['views', boardId] });
    },
    onError: (error) => {
      toast.error('Failed to update view', { description: error.message });
    },
  });
}

export function useDeleteView(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.views.delete(id),
    onSuccess: () => {
      toast.success('View deleted');
      queryClient.invalidateQueries({ queryKey: ['views', boardId] });
    },
    onError: (error) => {
      toast.error('Failed to delete view', { description: error.message });
    },
  });
}
```

- [ ] **Step 6: Run web tests**

Run: `cd apps/web && npx vitest run src/hooks/views.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hooks apps/web/src/types
git commit -m "feat(web): api.views client, View types, use-views hooks"
```

---

### Task 7: `applyView` pure function (TDD)

**Files:**

- Create: `apps/web/src/lib/apply-view.ts`
- Test: `apps/web/src/lib/apply-view.test.ts`

**Interfaces:**

- Consumes: `ViewFilters` type (Task 6), `Status`/`Task` types.
- Produces (used by Task 8):
  - `interface ViewFilterState { labelIds: string[]; assigneeIds: string[]; priorities: ('low' | 'medium' | 'high' | 'urgent')[]; dueDateRange: { from: string | null; to: string | null }; searchQuery: string }`
  - `DEFAULT_FILTER_STATE: ViewFilterState`
  - `applyViewFilters(task: Task, filters: ViewFilterState, activeLabelIds: Map<string,string[]>): boolean` — returns true if the task passes; drops dangling ids naturally (no match ⇒ filtered out).
  - `filterTaskByFilterState(task, filterState)` — searchQuery matches title case-insensitively.
  - `groupTasksBy(tasks, statuses, groupBy): { key: string; label: string; statuses: Status[] }[]` — returns array of pseudo-`Status` groups: keys are the distinct values; ungrouped → `0 | null` ids → "No status/assignee/priority/label" label. For `none`, returns a single group.
  - `sortTasks(tasks, sortBy)` — dueDate sorts nulls last.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { applyViewFilters, groupTasksBy, sortTasks, DEFAULT_FILTER_STATE } from './apply-view';
import type { Task, Status } from '@/types';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    statusId: 's1',
    boardId: 'b1',
    number: 1,
    taskNumber: 'TFG-1',
    title: 'Task one',
    position: 0,
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Task;
}

describe('applyViewFilters', () => {
  const empty = DEFAULT_FILTER_STATE;

  it('passes everything on default state', () => {
    expect(applyViewFilters(task(), empty)).toBe(true);
  });

  it('filters by priority list', () => {
    const state = { ...empty, priorities: ['urgent'] };
    expect(applyViewFilters(task({ priority: 'urgent' }), state)).toBe(true);
    expect(applyViewFilters(task({ priority: 'low' }), state)).toBe(false);
  });

  it('requires ALL label ids', () => {
    const state = { ...empty, labelIds: ['l1', 'l2'] };
    const t = task({
      labels: [
        { taskId: 't1', labelId: 'l1', label: {} as any, assignedAt: '' },
        { taskId: 't1', labelId: 'l2', label: {} as any, assignedAt: '' },
      ],
    });
    expect(applyViewFilters(t, state)).toBe(true);
    expect(
      applyViewFilters(
        task({ labels: [{ taskId: 't1', labelId: 'l1', label: {} as any, assignedAt: '' }] }),
        state,
      ),
    ).toBe(false);
  });

  it('matches search query case-insensitively on title', () => {
    const state = { ...empty, searchQuery: 'URGENT' };
    expect(applyViewFilters(task({ title: 'Fix the urgent bug' }), state)).toBe(true);
    expect(applyViewFilters(task({ title: 'Ship it' }), state)).toBe(false);
  });

  it('dueDateRange: from/to bounds are inclusive; empty passes', () => {
    const state = {
      ...empty,
      dueDateRange: { from: '2026-01-02T00:00:00.000Z', to: '2026-01-04T00:00:00.000Z' },
    };
    expect(applyViewFilters(task({ dueDate: '2026-01-03T00:00:00.000Z' }), state)).toBe(true);
    expect(applyViewFilters(task({ dueDate: '2026-01-01T00:00:00.000Z' }), state)).toBe(false);
    expect(applyViewFilters(task({}), state)).toBe(false);
    expect(applyViewFilters(task(), { ...empty, dueDateRange: { from: null, to: null } })).toBe(
      true,
    );
  });
});

describe('groupTasksBy', () => {
  const statuses = [
    { id: 's1', name: 'Todo', type: 'todo', position: 0, tasks: [] },
    { id: 's2', name: 'Done', type: 'done', position: 1, tasks: [] },
  ] as Status[];

  it('groups by assignee with a No-assignee fallback column', () => {
    const a = { ...task(), id: 't1', assignee: { id: 'u1', displayName: 'Ada' } } as Task;
    const b = { ...task(), id: 't2' } as Task;
    const grouped = groupTasksBy([a, b], statuses, 'assignee');
    expect(grouped.map((g) => g.name)).toEqual(['Ada', 'No assignee']);
    expect(grouped[0].tasks).toHaveLength(1);
    expect(grouped[1].tasks).toHaveLength(1);
  });

  it('groups by priority in canonical order', () => {
    const grouped = groupTasksBy(
      [task({ priority: 'low' }), task({ priority: 'urgent' })],
      statuses,
      'priority',
    );
    // Canonical order: urgent, high, medium, low. Empty groups are omitted;
    // "No priority" fallback only appears if some task has none (impossible here
    // since priority is non-nullable) — so expect exactly the two occupied groups.
    expect(grouped.map((g) => g.name)).toEqual(['urgent', 'low']);
    expect(grouped[0].tasks).toHaveLength(1);
    expect(grouped[1].tasks).toHaveLength(1);
  });

  it('none returns a single group with all tasks', () => {
    const grouped = groupTasksBy([task(), task({ id: 't2' })], statuses, 'none');
    expect(grouped).toHaveLength(1);
    expect(grouped[0].tasks).toHaveLength(2);
  });
});

describe('sortTasks', () => {
  it('sorts by position within group', () => {
    const sorted = sortTasks([task({ position: 2 }), task({ position: 1 })], 'position');
    expect(sorted.map((t) => t.position)).toEqual([1, 2]);
  });

  it('sorts by dueDate with null last', () => {
    const sorted = sortTasks(
      [
        task({ dueDate: undefined }),
        task({ dueDate: '2026-02-01T00:00:00.000Z' }),
        task({ dueDate: '2026-01-01T00:00:00.000Z' }),
      ],
      'dueDate',
    );
    expect(sorted[sorted.length - 1].dueDate).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/apply-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apply-view.ts`**

```ts
export type ViewGroupBy = 'status' | 'assignee' | 'priority' | 'label' | 'none';
export type ViewSortBy = 'position' | 'priority' | 'dueDate' | 'title';

export interface ViewFilterState {
  labelIds: string[];
  assigneeIds: string[];
  priorities: ('low' | 'medium' | 'high' | 'urgent')[];
  dueDateRange: { from: string | null; to: string | null };
  searchQuery: string;
}

export const DEFAULT_FILTER_STATE: ViewFilterState = {
  labelIds: [],
  assigneeIds: [],
  priorities: [],
  dueDateRange: { from: null, to: null },
  searchQuery: '',
};

export function taskLabelIds(t: Task): string[] {
  return ((t as any).taskLabels ?? t.labels ?? []).map((tl: any) => tl.labelId);
}

export function applyViewFilters(task: Task, f: ViewFilterState): boolean {
  if (f.labelIds.length > 0) {
    const have = taskLabelIds(task);
    if (!f.labelIds.every((id) => have.includes(id))) return false;
  }
  if (f.assigneeIds.length > 0 && !f.assigneeIds.includes(task.assigneeId ?? '')) return false;
  if (f.priorities.length > 0 && !f.priorities.includes(task.priority)) return false;
  const { from, to } = f.dueDateRange;
  if (from || to) {
    if (!task.dueDate) return false;
    if (from && task.dueDate < from) return false;
    if (to && task.dueDate > to) return false;
  }
  if (f.searchQuery && !task.title.toLowerCase().includes(f.searchQuery.toLowerCase()))
    return false;
  return true;
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

export function sortTasks(tasks: Task[], sortBy: ViewSortBy): Task[] {
  const t = [...tasks];
  switch (sortBy) {
    case 'priority':
      return t.sort(
        (a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
      );
    case 'dueDate':
      return t.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return 1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    case 'title':
      return t.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return t.sort((a, b) => a.position - b.position);
  }
}

const PRIORITY_GROUP_ORDER = ['urgent', 'high', 'medium', 'low'] as const;

const PRIORITY_GROUP_ORDER = ['urgent', 'high', 'medium', 'low'] as const;

export function groupTasksBy(tasks: Task[], statuses: Status[], groupBy: ViewGroupBy) {
  // Every returned group must be renderable by BoardColumn: { id, name, type, position, tasks }.
  if (groupBy === 'none') {
    return [{ id: 'none', name: 'All tasks', type: 'todo', position: 0, tasks }];
  }
  if (groupBy === 'status') {
    return statuses.map((s) => ({ ...s, tasks: tasks.filter((t) => t.statusId === s.id) }));
  }
  if (groupBy === 'priority') {
    const groups: { id: string; name: string; type: string; position: number; tasks: Task[] }[] =
      [];
    PRIORITY_GROUP_ORDER.forEach((p, i) => {
      const inGroup = tasks.filter((t) => t.priority === p);
      if (inGroup.length > 0) {
        groups.push({ id: `priority-${p}`, name: p, type: 'todo', position: i, tasks: inGroup });
      }
    });
    return groups;
  }
  if (groupBy === 'assignee') {
    // Fallback column first, then assignees in first-appearance order.
    const groups: { id: string; name: string; type: string; position: number; tasks: Task[] }[] =
      [];
    const unassigned = tasks.filter((t) => !t.assigneeId);
    if (unassigned.length > 0) {
      groups.push({
        id: 'no-assignee',
        name: 'No assignee',
        type: 'backlog',
        position: -1,
        tasks: unassigned,
      });
    }
    const byAssignee = new Map<string, { name: string; tasks: Task[] }>();
    for (const t of tasks) {
      if (!t.assigneeId) continue;
      if (!byAssignee.has(t.assigneeId)) {
        byAssignee.set(t.assigneeId, { name: t.assignee?.displayName ?? 'Unknown', tasks: [] });
      }
      byAssignee.get(t.assigneeId)!.tasks.push(t);
    }
    let pos = unassigned.length > 0 ? 0 : -1;
    for (const [key, group] of byAssignee) {
      groups.push({
        id: `assignee-${key}`,
        name: group.name,
        type: 'todo',
        position: groups.length,
        tasks: group.tasks,
      });
    }
    return groups;
  }
  // groupBy === 'label': one column per label id present on any task + "No label" fallback
  const labelNames = new Map<string, string>(); // labelId → label name from board.labels context; pass labels in as prop if renaming
  const groups: { id: string; name: string; type: string; position: number; tasks: Task[] }[] = [];
  const unlabeled = tasks.filter((t) => taskLabelIds(t).length === 0);
  if (unlabeled.length > 0) {
    groups.push({
      id: 'no-label',
      name: 'No label',
      type: 'backlog',
      position: -1,
      tasks: unlabeled,
    });
  }
  const byLabel = new Map<string, Task[]>();
  for (const t of tasks) {
    const ids = taskLabelIds(t);
    if (ids.length === 0) continue;
    for (const id of ids) {
      if (!byLabel.has(id)) byLabel.set(id, []);
      byLabel.get(id)!.push(t);
    }
  }
  for (const [key, group] of byLabel) {
    groups.push({
      id: `label-${key}`,
      name: key,
      type: 'todo',
      position: groups.length,
      tasks: group,
    });
  }
  return groups;
}
```

- [ ] **Step 4: Run web tests + typecheck**

Run: `cd apps/web && npx vitest run src/lib/apply-view.test.ts && npx tsc --noEmit`
Expected: PASS; tsc error count ≤ 7 pre-existing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib apps/web/tests
git add apps/web/src/lib
git commit -m "feat(web): applyView pure filter/group/sort function"
```

---

### Task 8: Board page integration

**Files:**

- Modify: `apps/web/src/hooks/use-board-view-state.ts` (extend `FilterState`)
- Modify: `apps/web/src/hooks/use-socket.ts` (invalidate `['views', boardId]` on view events)
- Modify: `apps/web/src/components/kanban-board.tsx`
- Modify: `apps/web/src/components/board-header-bar.tsx`
- Test: `apps/web/src/components/kanban-board.test.tsx` (URL + applyView wiring)

**Interfaces:**

- Consumes: `applyViewFilters`, `groupTasksBy`, `sortTasks`, `DEFAULT_FILTER_STATE` from Task 7; `useBoardViews`/`useDeleteView` from Task 6.
- Produces: board page reads the active view from `?view=<id>` and applies it.

- [ ] **Step 1: Extend `FilterState`**

In `use-board-view-state.ts`, extend the persisted shape (the plan keeps `ViewMode` + filters there as fallback when no view is active):

```ts
export interface FilterState {
  labelIds: string[];
  assigneeIds: string[];
  priorities: ('low' | 'medium' | 'high' | 'urgent')[];
  dueDateRange: { from: string | null; to: string | null };
  searchQuery: string;
}
```

Update `loadState` + `clearFilters` to match; `localStorage` key and persistence behavior unchanged.

- [ ] **Step 2: Wire `?view=` into `KanbanBoard` with `use-view-state.ts`**

Create `apps/web/src/hooks/use-view-state.ts` — the complete hook:

```ts
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBoardViews } from './use-views';
import type { View } from '@/types';

export function useActiveView(boardId: string): {
  activeView: View | null;
  selectView: (id: string | null) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const views = useBoardViews(boardId).data ?? [];
  const activeView = views.find((v) => v.id === viewParam) ?? null;

  useEffect(() => {
    if (viewParam && !activeView) {
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    }
  }, [viewParam, activeView, searchParams, setSearchParams]);

  return {
    activeView,
    selectView: (id: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set('view', id);
      else next.delete('view');
      setSearchParams(next, { replace: true });
    },
  };
}
```

- [ ] **Step 3: Wire `applyViewFilters` into `kanban-board.tsx`**

Replace `filterTask` + `filteredStatuses` grouping: when `activeView` is set, derive `ViewFilterState` from `activeView.filters` and pass the view's `sortBy`/`groupBy` into the new helpers; when no view is active, build `ViewFilterState` from the existing localStorage `filters` (labelIds only, rest defaults). The task spec code in `kanban-board.tsx` `filterTask`/`filteredStatuses` blocks is the fallback path; `groupBy !== 'status'` renders the view's columns read-only by wrapping each column's card `onClick` in the existing navigate helper and disabling `DragDropContext` (conditional render: keep `<DragDropContext>` only when `groupBy === 'status'`).

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: error count ≤ 7 (pre-existing).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): apply saved view filters/grouping/sorting on the board"
```

---

### Task 9: View selector + save dialog UI

**Files:**

- Create: `apps/web/src/components/view-selector.tsx`
- Create: `apps/web/src/components/save-view-dialog.tsx`
- Test: `apps/web/src/components/view-selector.test.tsx`
- Test: `apps/web/src/components/save-view-dialog.test.tsx`

**Interfaces:**

- Consumes: `useBoardViews`, `useCreateView`, `useDeleteView` (Task 6); `View` type.
- Produces: `ViewSelector` and `SaveViewDialog` components wired into `BoardHeaderBar` + `KanbanBoard` in the same task; `open` state lifted to `kanban-board.tsx`.

- [ ] **Step 1: Write the failing selector test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewSelector } from './view-selector';
import type { View } from '@/types';

const views: View[] = [
  {
    id: 'v1',
    boardId: 'b1',
    userId: null,
    name: 'Team urgent',
    filters: {},
    groupBy: 'status',
    sortBy: 'position',
    layout: 'board',
    position: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'v2',
    boardId: 'b1',
    userId: 'u-me',
    name: 'Mine',
    filters: {},
    groupBy: 'status',
    sortBy: 'position',
    layout: 'board',
    position: 1,
    createdAt: '',
    updatedAt: '',
  },
];

vi.mock('@/hooks/use-views', () => ({
  useBoardViews: () => ({ data: views }),
  useCreateView: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteView: () => ({ mutate: vi.fn() }),
  useUpdateView: () => ({ mutate: vi.fn() }),
}));
```

Interaction tests to write (render `<ViewSelector views={views} activeViewId={null} onSelect={onSelect} />` wrapped in the project's test helpers; use `fireEvent.click` on the trigger, then on menu items):

- renders "No view" entry + each view name, with personal/shared grouping ("My views", "Board views");
- clicking a view calls the passed `onSelect` with that view's id;
- clicking "No view" calls `onSelect(null)`.

- [ ] **Step 2: Write the failing save-dialog test**

```tsx
// Mock use-views as in Task 9 Step 1. Render <SaveViewDialog open={true} onOpenChange={...} canShare={true} onSubmit={onSubmit} />.
// Cases:
it('shows name input and visibility radio', () => {
  render(
    <SaveViewDialog open={true} onOpenChange={() => {}} canShare={true} onSubmit={onSubmit} />,
  );
  expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/personal/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/shared/i)).toBeInTheDocument();
});

it('hides the shared option when canShare=false', () => {
  render(
    <SaveViewDialog open={true} onOpenChange={vi.fn()} canShare={false} onSubmit={onSubmit} />,
  );
  expect(screen.queryByLabelText(/shared/i)).not.toBeInTheDocument();
});

it('submits with name and shared flag', () => {
  render(<SaveViewDialog open={true} onOpenChange={vi.fn()} canShare={true} onSubmit={onSubmit} />);
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'My view' } });
  fireEvent.click(screen.getByLabelText(/shared/i));
  fireEvent.click(screen.getByRole('button', { name: /save/i }));
  expect(onSubmit).toHaveBeenCalledWith({ name: 'My view', shared: true });
});
```

- [ ] **Step 3: Implement `view-selector.tsx`**

`DropdownMenu` (shadcn, existing pattern) in the `BoardHeaderBar` center slot next to the `ToggleGroup`. Trigger: current view name or "No view"; entries grouped "Board views"/"My views"; active entry `bg-accent text-foreground`; rename via inline `Prompt`/small dialog reusing `useUpdateView`; delete via `useDeleteView` with confirm dialog (shared views warn about affecting all members). Styling: `border-sidebar-border`, muted labels, no Lime.

- [ ] **Step 4: Write `save-view-dialog.tsx`**

Uses `ui/dialog` + `Input` + `RadioGroup`. Fields: name (required), visibility radio (Personal / Shared with board — shared hidden when `canShare=false`). `onSubmit` receives `{ name, shared }`; parent holds filters/groupBy/sortBy/layout and calls `useCreateView`. The dialog's confirm button is the screen's single Lime CTA (`variant="default"`).

- [ ] **Step 5: Wire into `kanban-board.tsx` + `board-header-bar.tsx`**

`BoardHeaderBarProps` gains `views: View[]`, `activeViewId: string | null`, `onSelectView(id)`, and `renderSaveDialog` slot OR inline dialog state — prefer lifting: `kanban-board.tsx` owns `saveDialogOpen` state and passes `onSaveAsView={() => setSaveDialogOpen(true)}`. "Save as view" appears in the FilterChipsBar row once state deviates from default (per spec).

- [ ] **Step 6: Run web tests + typecheck**

Run: `cd apps/web && npx vitest run src/components/view-selector.test.tsx src/components/save-view-dialog.test.tsx && npx tsc --noEmit`
Expected: PASS; tsc errors ≤ 7.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): view selector dropdown and save-view dialog"
```

---

### Task 10: Socket invalidation + final wiring + docs

**Files:**

- Modify: `apps/web/src/hooks/use-socket.ts` (eventTypes + invalidateByEvent)
- Modify: `apps/web/src/components/filter-chips-bar.tsx` (assignee/priority/due chips + "Save as view" button)
- Modify: `apps/web/src/components/kanban-board.tsx` (final integration: unsaved-state banner, "Save changes to view")
- Docs: `apps/api/src/views/views.module.ts` header comment (module purpose in one sentence)
- AGENTS.md note under Features if a short section fits

**Interfaces:**

- Consumes: everything prior.

- [ ] **Step 1: Socket invalidation**

In `use-socket.ts`, add `"view:created"`, `"view:updated"`, `"view:deleted"` to `eventTypes`, and in `invalidateByEvent`:

```ts
if (eventName === 'view:created' || eventName === 'view:updated' || eventName === 'view:deleted') {
  const v = eventData as { boardId?: string };
  const target = v.boardId ?? bid;
  if (target) {
    queryClient.invalidateQueries({ queryKey: ['views', target] });
  }
}
```

- [ ] **Step 2: Manual verification checklist (dev server)**

Run: `pnpm dev`
Scenario walk (requires seeded account): create a board view from label filter → reload (URL `?view=` retained) → second browser window sees shared view appear without reload → owner renames → other window's selector updates → delete active view → falls back to "No view" + localStorage state.

- [ ] **Step 3: Full verification**

```bash
pnpm --filter @taskforge/api test
cd apps/web && npx vitest run
cd apps/web && npx tsc --noEmit
pnpm format:check
```

Expected: all API + web suites PASS; tsc ≤ 7 pre-existing errors; prettier clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web): board view selector, save-view dialog, and view socket invalidation (TFG-30)"
```
