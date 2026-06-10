import http from 'http';
import { config } from './config.js';
import { bootstrapDb } from './db/bootstrapDb.js';
import { createApp } from './app.js';
import { attachNotificationsWebSocket } from './realtime/notificationsHub.js';

const app = createApp();

async function start() {
  try {
    await bootstrapDb();
    console.log('📁 Base de datos local en JSON inicializada correctamente.');
  } catch (err) {
    console.error('No se pudo inicializar la base de datos JSON.', err);
    process.exit(1);
  }

  const server = http.createServer(app);
  attachNotificationsWebSocket(server);

  const listenHost = process.env.HOST ?? '127.0.0.1';

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Puerto ${config.port} en uso. Libera el proceso (npm run check-ports) o cambia PORT en .env.`,
      );
    } else {
      console.error('Error al iniciar el servidor:', err.message);
    }
    process.exit(1);
  });

  server.listen(config.port, listenHost, () => {
    console.log(`API en http://${listenHost}:${config.port}`);
  });
}

start();
