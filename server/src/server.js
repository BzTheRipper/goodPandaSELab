import http from 'node:http';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { resumeFlights } from './services/delivery.service.js';
import { initSocket } from './socket/index.js';

export async function startServer({ mongoUri = env.mongoUri, port = env.port } = {}) {
  await connectDb(mongoUri);
  const server = http.createServer(createApp());
  initSocket(server);
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`GoodPanda API listening on http://localhost:${port}`);
  await resumeFlights();
  return server;
}
