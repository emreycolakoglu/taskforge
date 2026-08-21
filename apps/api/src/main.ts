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
  app.useStaticAssets(webDistPath, {
    index: false,
    setHeaders: (res, filePath) => {
      // Hashed /assets files are content-addressed: once the browser has one it can keep it
      // forever, but it must never be served from cache in place of a different hash. The
      // app shell and the service worker are the opposite — they must be revalidated on
      // every load so a redeploy is picked up instead of a cached copy surviving for hours
      // (which is exactly what turned the last redeploy into a white, unstyled UI: a stale
      // worker + stale index.html kept referencing chunks the new server had already
      // deleted).
      const name = filePath.slice(filePath.lastIndexOf('/') + 1);
      if (
        name === 'index.html' ||
        name === 'sw.js' ||
        name === 'registerSW.js' ||
        name === 'manifest.webmanifest'
      ) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });

  // SPA fallback — serve index.html for non-API routes
  const fs = await import('fs');
  const indexPath = join(webDistPath, 'index.html');

  app.use((req: any, res: any, next: () => void) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    if (!fs.existsSync(indexPath)) {
      // During development, let the Vite proxy handle it
      return next();
    }
    // Missing hashed assets (e.g. a chunk a stale browser tab still asks for) must 404,
    // never be answered with the HTML shell: a 200 + text/html is what makes the module
    // loader fail with "Expected a JavaScript module script". Legit SPA deep links have no
    // file extension, so this check cannot hit them.
    if (
      /\.(js|mjs|css|png|jpg|jpeg|gif|svg|ico|webmanifest|woff2?|ttf|eot|map|txt|json)(\?.*)?$/.test(
        req.path,
      )
    ) {
      return res.status(404).type('text/plain').send('Not Found');
    }
    res.sendFile(indexPath);
  });

  const port = process.env.PORT || 3000;
  const host = '0.0.0.0';
  await app.listen(port, host);
  const spaAvailable = fs.existsSync(indexPath);
  console.log(`TaskForge running on http://${host}:${port}`);
  console.log(`  REST + MCP API: http://localhost:${port}/api`);
  console.log(`  WebSocket: ws://localhost:${port}/ws`);
  if (spaAvailable) {
    console.log(`  SPA: http://localhost:${port}/`);
  } else {
    console.log(`  SPA: http://localhost:5173/ (Vite dev server)`);
  }
}
bootstrap();
