import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma, seedUser } from '../../test/setup';

describe('AuthService.findUserDirectory', () => {
  it('returns id + displayName only, sorted by displayName, without sensitive fields', async () => {
    const prisma = createTestPrisma() as unknown as PrismaService;
    const service = new AuthService(prisma as any);
    try {
      await seedUser(prisma, { displayName: 'Zoe' });
      await seedUser(prisma, { displayName: 'Alice' });

      const directory = await service.findUserDirectory();

      expect(directory).toHaveLength(2);
      expect(directory.map((u) => u.displayName)).toEqual(['Alice', 'Zoe']);
      for (const u of directory) {
        expect(Object.keys(u).sort()).toEqual(['displayName', 'id']);
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});
