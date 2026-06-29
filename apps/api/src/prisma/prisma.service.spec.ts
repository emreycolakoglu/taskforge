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

    process.env.DATABASE_URL = dbUrl;
    execSync(
      `npx prisma migrate deploy`,
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

});
