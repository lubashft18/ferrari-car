import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep, relative } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const lan = process.argv.includes('--lan');
const port = Number(process.env.PORT || (lan ? 3001 : 3000));
const host = lan ? '0.0.0.0' : '127.0.0.1';
const publicFiles = new Set(['index.html', 'styles.css', 'app.js', 'game-controller.js', 'driving-game.js']);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replaceAll('\\', '/');
    if (pathname.split('/').some(part => part.startsWith('.'))) throw new Error('Forbidden');
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Forbidden');
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    // Share the game and its assets, rather than the workspace's other files.
    const publicPath = relative(root, file).split(sep).join('/');
    if (!publicFiles.has(publicPath) && !publicPath.startsWith('assets/') && !publicPath.startsWith('vendor/')) throw new Error('Forbidden');
    const info = await stat(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the previous server or set PORT to another port.` : error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`OmniDrive is ready at http://localhost:${port}`);
  if (lan) {
    for (const entries of Object.values(networkInterfaces())) {
      for (const address of entries || []) {
        if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) {
          console.log(`Phone / Wi-Fi: http://${address.address}:${port}`);
        }
      }
    }
    console.log('Connect your phone to the same Wi-Fi. Keep this server running.');
  }
});
