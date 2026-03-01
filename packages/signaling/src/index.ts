import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { SignalingServer } from './server.js';
import { logger } from './logger.js';

const PORT = parseInt(process.env.PORT ?? '8080', 10);

const httpServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      connections: signaling.connectionCount,
      activeCalls: signaling.activeCallCount,
      uptime: process.uptime(),
    }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });
const signaling = new SignalingServer(wss);

httpServer.listen(PORT, () => {
  logger.info(`Listening on port ${PORT}`);
});

function shutdown() {
  logger.info('Shutting down...');
  signaling.dispose();
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 5s if graceful shutdown hangs
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
