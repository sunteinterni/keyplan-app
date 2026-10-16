import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import { SESSION_SECRET } from './auth';
import { registerRoutes } from './routes';

export async function build() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 10 * 1024 * 1024 });
  await app.register(cookie, { secret: SESSION_SECRET });
  await app.register(multipart, { limits: { fileSize: 40 * 1024 * 1024, files: 1 } });
  app.get('/healthz', async () => ({ ok: true }));
  await registerRoutes(app);

  const dist = path.resolve('web/dist');
  if (fs.existsSync(dist)) {
    await app.register(fstatic, { root: dist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/files/')) return reply.code(404).send({ error: 'ไม่พบ' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}

if (process.env.NODE_ENV !== 'test' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await build();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
}
