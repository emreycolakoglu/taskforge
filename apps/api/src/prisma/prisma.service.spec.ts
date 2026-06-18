import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('PrismaService', () => {
  let service: PrismaService;
  let dbUrl: string;

  beforeEach(async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'taskforge-test-'));
    const dbPath = join(tmpDir, 'test.db');
    dbUrl = `file:${dbPath}`;
    const schemaPath = join(__dirname, '..', '..', 'prisma', 'schema.prisma');

    process.env.DATABASE_URL = dbUrl;
    execSync(
      `npx prisma db push --skip-generate --accept-data-loss --schema="${schemaPath}"`,
      { env: { ...process.env, DATABASE_URL: dbUrl }, stdio: 'pipe', cwd: join(__dirname, '..', '..') },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    await service?.$disconnect();
    delete process.env.DATABASE_URL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect on module init', async () => {
    const connectSpy = jest.spyOn(service, '$connect');
    await service.onModuleInit();
    expect(connectSpy).toHaveBeenCalled();
  });

  it('should disconnect on module destroy', async () => {
    const disconnectSpy = jest.spyOn(service, '$disconnect');
    await service.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('should not push schema when tables already exist', async () => {
    const execSyncSpy = jest.spyOn(require('child_process'), 'execSync');
    await service.onModuleInit();
    // Schema already applied in beforeEach, so ensureSchema should be a no-op
    expect(execSyncSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('prisma db push'),
      expect.anything(),
    );
    execSyncSpy.mockRestore();
  });
});
