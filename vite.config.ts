import type { IncomingMessage } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function localApiPlugin(): Plugin {
  return {
    name: 'local-vercel-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        try {
          const env = loadEnv(server.config.mode, process.cwd(), '');
          if (env.OPENAI_API_KEY !== undefined) {
            process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
          }

          const method = (req.method ?? 'GET').toUpperCase();
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') {
              headers.set(key, value);
            } else if (Array.isArray(value)) {
              for (const item of value) {
                headers.append(key, item);
              }
            }
          }

          const hasBody = method !== 'GET' && method !== 'HEAD';
          const bodyBuffer = hasBody ? await readRequestBody(req) : undefined;
          const url = new URL(req.originalUrl ?? '/api/chat', 'http://localhost');

          const webRequest = new Request(url, {
            method,
            headers,
            body:
              bodyBuffer && bodyBuffer.length > 0
                ? new Uint8Array(bodyBuffer)
                : undefined,
          });

          const mod = (await server.ssrLoadModule('/api/chat.ts')) as Record<
            string,
            unknown
          >;
          const handler = mod[method];

          if (typeof handler !== 'function') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({ error: `Method ${method} Not Allowed.` }),
            );
            return;
          }

          const webResponse = await (
            handler as (request: Request) => Promise<Response>
          )(webRequest);

          res.statusCode = webResponse.status;
          webResponse.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });

          if (webResponse.body) {
            const reader = webResponse.body.getReader();
            req.on('close', () => {
              void reader.cancel();
            });

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  break;
                }
                res.write(Buffer.from(value));
              }
            } catch (streamErr) {
              console.error('[vite local-vercel-api] Stream error:', streamErr);
            } finally {
              if (!res.writableEnded) {
                res.end();
              }
            }
          } else {
            res.end();
          }
        } catch (error) {
          console.error('[vite local-vercel-api] Error:', error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
          }
          if (!res.writableEnded) {
            res.end(
              JSON.stringify({ error: '로컬 API 서버 실행 중 오류가 발생했습니다.' }),
            );
          }
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApiPlugin()],
});
