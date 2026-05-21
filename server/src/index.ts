import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRouter from './routes/auth.js';
import activitiesRouter from './routes/activities.js';
import contractorsRouter from './routes/contractors.js';
import customersRouter from './routes/customers.js';
import entriesRouter from './routes/entries.js';
import usersRouter from './routes/users.js';
import reportsRouter from './routes/reports.js';
import whatsappRouter from './routes/whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: process.env.CLIENT_URL?.split(',') || true,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

// API routes
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, version: '5.0.0', env: isProd ? 'production' : 'development' })
);
app.use('/api/auth', authRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/contractors', contractorsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/whatsapp', whatsappRouter);

// In production: serve the built React client from server/dist
if (isProd) {
  // After build, structure is server/dist/index.js → client built to client/dist
  // We expect both directories to exist in the same project layout on the host
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  // SPA fallback — anything not /api/* serves index.html
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API running on 0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
});
