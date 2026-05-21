import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from './db.js';
import authRouter from './routes/auth.js';
import activitiesRouter from './routes/activities.js';
import contractorsRouter from './routes/contractors.js';
import customersRouter from './routes/customers.js';
import entriesRouter from './routes/entries.js';
import usersRouter from './routes/users.js';
import reportsRouter from './routes/reports.js';
import whatsappRouter from './routes/whatsapp.js';
import auditRouter from './routes/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Railway / Cloudflare proxy arkasında — gerçek client IP'yi alabilmek için
// (rate-limit ve audit log doğru IP loglasın diye).
app.set('trust proxy', 1);

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
app.use('/api/audit', auditRouter);

// In production: serve the built React client from server/dist
if (isProd) {
  const clientDist = path.resolve(__dirname, '../../client/dist');

  // Hash'li bundle dosyaları (index-XXXX.js, .css) — 1 yıl agresif cache.
  // Vite filename'lere content-hash gömüyor, içerik değişirse isim değişiyor.
  app.use(
    '/assets',
    express.static(path.join(clientDist, 'assets'), {
      maxAge: '1y',
      immutable: true,
    })
  );
  // Diğer statik dosyalar (favicon vs.) — normal cache.
  app.use(express.static(clientDist, { maxAge: '1h' }));

  // SPA fallback — /api/ olmayan her şey index.html'i serve eder.
  // index.html'i cache'leme, hep son sürüm.
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
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

// Neon free tier 5 dk idle sonra DB compute'unu uyutuyor → ilk istek 2-5 sn
// gecikme yaşıyor. Her 3 dk'da bir hafif bir SELECT atarak DB'yi sıcak tutuyoruz.
// Production'da yararlı; development'ta gereksiz log oluşturmasın diye yok.
if (isProd) {
  const KEEP_WARM_INTERVAL = 3 * 60 * 1000; // 3 dakika
  setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      console.warn('Keep-warm ping failed:', err.message);
    }
  }, KEEP_WARM_INTERVAL);
  console.log('🔥 DB keep-warm pinger aktif (3 dk aralık)');
}
