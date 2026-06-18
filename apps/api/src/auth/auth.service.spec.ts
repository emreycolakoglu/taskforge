import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma, seedBoard } from '../../test/setup';
import { ConflictException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.inviteToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.member.deleteMany();
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.list.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
    await prisma.settings.deleteMany();
  });

  describe('isInitialized', () => {
    it('should return false when no settings exist', async () => {
      const result = await service.isInitialized();
      expect(result).toBe(false);
    });

    it('should return true when settings exist with onboarded=true', async () => {
      await prisma.settings.create({
        data: { id: 'singleton', title: 'Test', onboarded: true },
      });
      const result = await service.isInitialized();
      expect(result).toBe(true);
    });
  });

  describe('onboard', () => {
    it('should create first admin user, settings, and session', async () => {
      const board = await seedBoard(prisma);
      const list = board.lists[0];

      // Create a task to verify it remains unassigned (no auto-claim)
      await prisma.task.create({
        data: { listId: list.id, title: 'Unassigned task', position: 0 },
      });

      const result = await service.onboard({
        email: 'admin@example.com',
        password: 'secret123',
        displayName: 'Admin',
        title: 'My Board',
      });

      expect(result.user.email).toBe('admin@example.com');
      expect(result.user.displayName).toBe('Admin');
      expect(result.user.role).toBe('admin');
      expect(result.session.token).toBeDefined();
      expect(result.user).not.toHaveProperty('passwordHash');

      // Check settings were created
      const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
      expect(settings?.onboarded).toBe(true);
      expect(settings?.title).toBe('My Board');

      // Check user was created with hashed password
      const user = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
      expect(user).toBeDefined();
      expect(user!.passwordHash).not.toBe('secret123');

      // Check session was created
      const session = await prisma.session.findUnique({ where: { token: result.session.token } });
      expect(session).toBeDefined();
      expect(session!.userId).toBe(user!.id);
      expect(session!.bot).toBe(false);

      // Check user was added as admin member to board
      const member = await prisma.member.findFirst({
        where: { boardId: board.id, userId: user!.id },
      });
      expect(member).toBeDefined();
      expect(member!.role).toBe('admin');

      // Check that tasks were NOT auto-claimed (claimName removed)
      const unassignedTasks = await prisma.task.findMany({ where: { assigneeId: null } });
      expect(unassignedTasks.length).toBeGreaterThan(0);
    });

    it('should throw ConflictException if already initialized', async () => {
      await prisma.settings.create({
        data: { id: 'singleton', title: 'Existing', onboarded: true },
      });

      await expect(
        service.onboard({
          email: 'new@example.com',
          password: 'secret123',
          displayName: 'New Admin',
          title: 'New Title',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if email already exists', async () => {
      // Create a user directly
      await prisma.user.create({
        data: {
          email: 'taken@example.com',
          passwordHash: 'hash',
          displayName: 'Existing',
          role: 'member',
        },
      });

      await expect(
        service.onboard({
          email: 'taken@example.com',
          password: 'secret123',
          displayName: 'New Admin',
          title: 'New Board',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      // Create a user manually
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('secret123', 12);
      await prisma.user.create({
        data: {
          email: 'user@example.com',
          passwordHash: hash,
          displayName: 'Test User',
          role: 'member',
        },
      });

      const result = await service.login('user@example.com', 'secret123');
      expect(result.user.email).toBe('user@example.com');
      expect(result.session.token).toBeDefined();
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('secret123', 12);
      await prisma.user.create({
        data: {
          email: 'user2@example.com',
          passwordHash: hash,
          displayName: 'Test User 2',
          role: 'member',
        },
      });

      await expect(service.login('user2@example.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      await expect(service.login('nobody@example.com', 'password')).rejects.toThrow(UnauthorizedException);
    });

    it('should normalize email to lowercase', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('secret123', 12);
      await prisma.user.create({
        data: {
          email: 'lowercase@example.com',
          passwordHash: hash,
          displayName: 'Lowercase User',
          role: 'member',
        },
      });

      const result = await service.login('LOWERCASE@example.com', 'secret123');
      expect(result.user.email).toBe('lowercase@example.com');
    });
  });

  describe('logout', () => {
    it('should revoke session', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'logout@example.com',
          passwordHash: 'hash',
          displayName: 'Logout User',
          role: 'member',
        },
      });

      const session = await prisma.session.create({
        data: {
          token: 'test-logout-token',
          userId: user.id,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });

      await service.logout('test-logout-token');

      const updated = await prisma.session.findUnique({ where: { token: 'test-logout-token' } });
      expect(updated!.revokedAt).not.toBeNull();
    });

    it('should not throw for non-existent token', async () => {
      await expect(service.logout('nonexistent-token')).resolves.toBeUndefined();
    });
  });

  describe('validateSession', () => {
    it('should return user for valid session', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'valid@example.com',
          passwordHash: 'hash',
          displayName: 'Valid User',
          role: 'member',
        },
      });

      await prisma.session.create({
        data: {
          token: 'valid-token',
          userId: user.id,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });

      const result = await service.validateSession('valid-token');
      expect(result).not.toBeNull();
      expect(result!.id).toBe(user.id);
      expect(result!.email).toBe('valid@example.com');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should return null for expired session', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'expired@example.com',
          passwordHash: 'hash',
          displayName: 'Expired User',
          role: 'member',
        },
      });

      await prisma.session.create({
        data: {
          token: 'expired-token',
          userId: user.id,
          expiresAt: new Date(Date.now() - 1000), // expired
        },
      });

      const result = await service.validateSession('expired-token');
      expect(result).toBeNull();
    });

    it('should return null for revoked session', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'revoked@example.com',
          passwordHash: 'hash',
          displayName: 'Revoked User',
          role: 'member',
        },
      });

      await prisma.session.create({
        data: {
          token: 'revoked-token',
          userId: user.id,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          revokedAt: new Date(),
        },
      });

      const result = await service.validateSession('revoked-token');
      expect(result).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      const result = await service.validateSession('nonexistent-token');
      expect(result).toBeNull();
    });
  });

  describe('createInvite & signup', () => {
    let adminUser: any;

    beforeEach(async () => {
      adminUser = await prisma.user.create({
        data: {
          email: 'admin-inv@example.com',
          passwordHash: 'hash',
          displayName: 'Admin Invite',
          role: 'admin',
        },
      });
    });

    it('should create an invite token', async () => {
      const invite = await service.createInvite(adminUser.id);
      expect(invite.token).toBeDefined();
      expect(invite.createdBy).toBe(adminUser.id);
      expect(invite.expiresAt).toBeDefined();
    });

    it('should signup with valid invite token', async () => {
      const invite = await service.createInvite(adminUser.id);

      const result = await service.signup(invite.token, {
        email: 'newmember@example.com',
        password: 'secret123',
        displayName: 'New Member',
      });

      expect(result.user.email).toBe('newmember@example.com');
      expect(result.user.role).toBe('member');
      expect(result.session.token).toBeDefined();

      // Check invite was marked as used
      const usedInvite = await prisma.inviteToken.findUnique({ where: { id: invite.id } });
      expect(usedInvite!.usedBy).toBeDefined();
      expect(usedInvite!.usedAt).toBeDefined();
    });

    it('should throw NotFoundException for invalid invite token', async () => {
      await expect(
        service.signup('invalid-token', {
          email: 'test@example.com',
          password: 'secret123',
          displayName: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for used invite token', async () => {
      const invite = await service.createInvite(adminUser.id);

      // Mark invite as used
      await prisma.inviteToken.update({
        where: { id: invite.id },
        data: { usedBy: adminUser.id, usedAt: new Date() },
      });

      await expect(
        service.signup(invite.token, {
          email: 'test@example.com',
          password: 'secret123',
          displayName: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired invite token', async () => {
      const invite = await prisma.inviteToken.create({
        data: {
          token: 'expired-invite-token',
          createdBy: adminUser.id,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      await expect(
        service.signup(invite.token, {
          email: 'test@example.com',
          password: 'secret123',
          displayName: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException for duplicate email on signup', async () => {
      // Create an existing user
      await prisma.user.create({
        data: {
          email: 'duplicate@example.com',
          passwordHash: 'hash',
          displayName: 'Existing',
          role: 'member',
        },
      });

      const invite = await service.createInvite(adminUser.id);

      await expect(
        service.signup(invite.token, {
          email: 'duplicate@example.com',
          password: 'secret123',
          displayName: 'New User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createBotToken', () => {
    it('should create a bot session with 365-day expiry', async () => {
      const admin = await prisma.user.create({
        data: {
          email: 'bot-admin@example.com',
          passwordHash: 'hash',
          displayName: 'Bot Admin',
          role: 'admin',
        },
      });

      const result = await service.createBotToken(admin.id);
      expect(result.token).toBeDefined();
      expect(result.id).toBeDefined();

      const session = await prisma.session.findUnique({ where: { token: result.token } });
      expect(session!.bot).toBe(true);
      // 365 days should be roughly a year from now
      const daysUntilExpiry = (new Date(session!.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(daysUntilExpiry).toBeGreaterThan(360);
      expect(daysUntilExpiry).toBeLessThan(370);
    });
  });

  describe('updateUser', () => {
    it('should update display name', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'update@example.com',
          passwordHash: 'hash',
          displayName: 'Old Name',
          role: 'member',
        },
      });

      const updated = await service.updateUser(user.id, { displayName: 'New Name' });
      expect(updated.displayName).toBe('New Name');
      expect(updated).not.toHaveProperty('passwordHash');
    });

    it('should update password with valid current password', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('oldpassword', 12);
      const user = await prisma.user.create({
        data: {
          email: 'pwchange@example.com',
          passwordHash: hash,
          displayName: 'PW Change',
          role: 'member',
        },
      });

      const updated = await service.updateUser(user.id, {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword',
      });

      // Verify the password was actually changed
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      const isValid = await bcrypt.compare('newpassword', dbUser!.passwordHash);
      expect(isValid).toBe(true);
    });

    it('should throw UnauthorizedException for wrong current password', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('oldpassword', 12);
      const user = await prisma.user.create({
        data: {
          email: 'wrongpw@example.com',
          passwordHash: hash,
          displayName: 'Wrong PW',
          role: 'member',
        },
      });

      await expect(
        service.updateUser(user.id, { currentPassword: 'wrong', newPassword: 'new' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException when newPassword without currentPassword', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'nopw@example.com',
          passwordHash: 'hash',
          displayName: 'No PW',
          role: 'member',
        },
      });

      await expect(
        service.updateUser(user.id, { newPassword: 'newpassword' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllUsers', () => {
    it('should return all users without passwordHash', async () => {
      await prisma.user.create({
        data: {
          email: 'alice@example.com',
          passwordHash: 'hash-a',
          displayName: 'Alice',
          role: 'admin',
        },
      });
      await prisma.user.create({
        data: {
          email: 'bob@example.com',
          passwordHash: 'hash-b',
          displayName: 'Bob',
          role: 'member',
        },
      });

      const users = await service.findAllUsers();
      expect(users).toHaveLength(2);
      expect(users.every(u => !(u as any).passwordHash)).toBe(true);
      expect(users.map(u => u.email).sort()).toEqual(['alice@example.com', 'bob@example.com']);
      expect(users.map(u => u.displayName).sort()).toEqual(['Alice', 'Bob']);
    });
  });

  describe('findAllInvites', () => {
    it('should return all invites with creator info', async () => {
      const admin = await prisma.user.create({
        data: {
          email: 'inv-admin@example.com',
          passwordHash: 'hash',
          displayName: 'Invite Admin',
          role: 'admin',
        },
      });

      const invite = await service.createInvite(admin.id);

      const invites = await service.findAllInvites();
      expect(invites).toHaveLength(1);
      expect(invites[0].id).toBe(invite.id);
      expect(invites[0].token).toBe(invite.token);
      expect(invites[0].createdBy).toBe(admin.id);
      expect(invites[0].creatorName).toBe('Invite Admin');
      expect(invites[0].usedBy).toBeNull();
      expect(invites[0].usedAt).toBeNull();
      expect(invites[0].isUsed).toBe(false);
      expect(invites[0].isExpired).toBe(false);
    });
  });

  describe('revokeInvite', () => {
    let adminUser: any;

    beforeEach(async () => {
      adminUser = await prisma.user.create({
        data: {
          email: 'revoke-admin@example.com',
          passwordHash: 'hash',
          displayName: 'Revoke Admin',
          role: 'admin',
        },
      });
    });

    it('should delete an unused invite', async () => {
      const invite = await service.createInvite(adminUser.id);

      await service.revokeInvite(invite.id);

      const deleted = await prisma.inviteToken.findUnique({ where: { id: invite.id } });
      expect(deleted).toBeNull();
    });

    it('should throw NotFoundException for nonexistent invite', async () => {
      await expect(service.revokeInvite('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for already-used invite', async () => {
      const invite = await service.createInvite(adminUser.id);

      await prisma.inviteToken.update({
        where: { id: invite.id },
        data: { usedBy: adminUser.id, usedAt: new Date() },
      });

      await expect(service.revokeInvite(invite.id)).rejects.toThrow(BadRequestException);
    });
  });
});