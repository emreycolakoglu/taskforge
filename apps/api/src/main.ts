import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Serve the SPA in production
  const webDistPath = join(__dirname, '..', '..', 'web', 'dist');
  app.useStaticAssets(webDistPath, { index: false });

  // SPA fallback — serve index.html for non-API routes
  const fs = await import('fs');
  const indexPath = join(webDistPath, 'index.html');

  app.use((req: any, res: any, next: () => void) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      // During development, let the Vite proxy handle it
      next();
    }
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  const spaAvailable = fs.existsSync(indexPath);
  console.log(`TaskForge running on http://localhost:${port}`);
  console.log(`  REST + MCP API: http://localhost:${port}/api`);
  console.log(`  WebSocket: ws://localhost:${port}/ws`);
  if (spaAvailable) {
    console.log(`  SPA: http://localhost:${port}/`);
  } else {
    console.log(`  SPA: http://localhost:5173/ (Vite dev server)`);
  }
}
bootstrap();
