import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import activitiesRouter from './routes/activities.js';
import contractorsRouter from './routes/contractors.js';
import customersRouter from './routes/customers.js';
import entriesRouter from './routes/entries.js';
import usersRouter from './routes/users.js';
import reportsRouter from './routes/reports.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: process.env.CLIENT_URL?.split(',') || true,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '5.0.0' }));

app.use('/api/auth', authRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/contractors', contractorsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/reports', reportsRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 API running at http://localhost:${PORT}`);
});
