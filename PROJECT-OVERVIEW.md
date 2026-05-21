# 📋 Aktivite Giriş Sistemi — Proje Özeti

**Domain:** [activity.tdevco.com](https://activity.tdevco.com)
**Versiyon:** v5.1
**Son güncelleme:** Mayıs 2026

---

## 🎯 Proje Nedir?

SAP danışmanlık şirketi için **aktivite/zaman takip + raporlama** sistemi.

- Çalışanlar saatlerini günlük olarak kaydeder (takvim arayüzü veya WhatsApp bot)
- Yönetici tüm verileri görür, müşteri/yüklenici bazında **brüt/net fatura raporu** çıkartır
- Tüm veriler bulutta, mobil + masaüstü uyumlu

---

## 🧱 Mimari

```
                ┌─────────────┐
                │  Kullanıcı  │
                └──────┬──────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   Tarayıcı       WhatsApp        Mobil tarayıcı
        │              │              │
        │      ┌───────▼────────┐    │
        │      │ Twilio Sandbox │    │
        │      │ (+1 415 523    │    │
        │      │  8886)         │    │
        │      └───────┬────────┘    │
        │              │              │
        └──────────────┼──────────────┘
                       ▼
            ╔══════════════════════════╗
            ║ activity.tdevco.com      ║  ← Cloudflare DNS only
            ║ (Let's Encrypt SSL)      ║
            ╚════════════╤═════════════╝
                         ▼
                ┌────────────────┐
                │ Railway        │
                │ (Express +     │
                │  React static) │
                └────────┬───────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │ Neon   │ │ Gemini │ │ Twilio │
         │Postgres│ │  API   │ │  API   │
         └────────┘ └────────┘ └────────┘
```

---

## 🔧 Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| **Frontend** | React 18 + Vite + TypeScript |
| **Styling** | Tailwind CSS (mavi/teal kurumsal palet) |
| **State** | Zustand + TanStack Query |
| **Router** | React Router v7 |
| **Backend** | Node.js 22 + Express + TypeScript |
| **ORM** | Prisma 6 |
| **Database** | PostgreSQL (Neon) |
| **Auth** | JWT (30 gün) + bcrypt |
| **AI** | Google Gemini (1.5-flash öncelikli, çoklu fallback) |
| **WhatsApp** | Twilio Sandbox API |
| **Deploy** | Railway (Nixpacks builder) |
| **CDN/DNS** | Cloudflare (DNS-only mode) |
| **SSL** | Let's Encrypt (Railway otomatik) |

---

## 🔐 Hesaplar ve Üyelikler

| Servis | Hesap | Plan | Aylık Maliyet | Amaç |
|---|---|---|---|---|
| **GitHub** | `oknkeles` | Free | $0 | Birincil kaynak repo (Railway buradan deploy) |
| **Bitbucket** | `okan.keles@tdevco.com` (workspace: `tdevconsulting`) | Free | $0 | Partner review için ayna |
| **Railway** | `okan.keles@tdevco.com` | Trial | $0 (şu an) → $5-10 prod | Hosting + auto-deploy |
| **Neon Postgres** | (Railway entegre) | Free | $0 | Production DB |
| **Cloudflare** | `tdevco2023@gmail.com` | Free | $0 | DNS yönetimi |
| **GoDaddy** | (varolan) | Yıllık | ~$15/yıl | Domain registrar (tdevco.com) |
| **Google AI Studio** | `okan.keles@tdevco.com` | Free | $0 | Gemini API key |
| **Twilio** | `okan.keles@tdevco.com` | Trial | $0 (şu an, $15.50 credit) | WhatsApp Sandbox |
| **Atlassian** | `okan.keles@tdevco.com` | Free | $0 | API token (Bitbucket erişimi için) |

**Toplam aylık şu an:** **~$0** (tüm servisler free tier veya trial'da)
**Toplam aylık prod sonrası tahmin:** **~$5-15** (Railway + Twilio production geçişi)

---

## 📏 Limitler ve Aşma Riskleri

### 🟢 Düşük risk (rahatça yıllarca yetecek)

| Servis | Limit | Mevcut kullanım | Risk |
|---|---|---|---|
| **Cloudflare DNS** | Sınırsız | minimal | yok |
| **Neon Postgres** | 500 MB storage, 100 saat compute/ay | <1 MB, <1 saat | yok |
| **GitHub** | Sınırsız public/private repo | 1 repo | yok |
| **Bitbucket** | 5 kullanıcı, sınırsız private repo | 1-3 kullanıcı | yok |
| **Let's Encrypt SSL** | Sınırsız sertifika | 1 sertifika | yok |

### 🟡 Orta risk (büyürken kontrol altında tutulmalı)

| Servis | Limit | Mevcut | Aşma sonucu | Çözüm |
|---|---|---|---|---|
| **Gemini API** | 1500 req/gün (free, model başına) | ~30-100 req/gün (3 kullanıcı) | 429 hatası | Google Cloud'a billing kart ekle → milyonlara çıkar (ücretsiz tier devam) |
| **Railway Trial** | $5 free credit/ay | hafif yük | uygulama durur | Hobby plan'a geç ($5/ay) — yeterli |
| **Railway Compute** | Trial'da 500 saat/ay | ~720 saat (24/7) | trial bitti uyarısı | Hobby plan'da unlimited |

### 🔴 Yüksek risk (yakın takip)

| Servis | Limit | Mevcut | Aşma sonucu | Çözüm |
|---|---|---|---|---|
| **Twilio Trial** | $15.50 başlangıç kredi | her WhatsApp mesajı ~$0.005 | trial bitti → sandbox kullanılamaz | $20 minimum recharge veya Twilio production'a geç |
| **Twilio Sandbox** | Kullanıcı **72 saat sessiz kalırsa** yeniden join atması gerek | 3 kullanıcı | bot cevap vermez | Aktif kullanım veya Production WhatsApp Business API'a geç |
| **Twilio Sandbox** | Sadece **opt-in** kullanıcılarla konuşur | 3 kullanıcı joined | yeni kullanıcı eklemek için join code yollatmak gerek | Production API'da bu sorun yok |

---

## 💰 Maliyet Senaryoları

### Şu an (ilk 30 gün)
| Kalem | Maliyet |
|---|---|
| Tüm servisler trial/free | **$0** |

### 3 ay sonra (trial'lar dolduğunda)
| Kalem | Maliyet |
|---|---|
| Railway Hobby plan | $5/ay |
| Twilio (3 user × 30 mesaj/gün) | ~$5/ay |
| Gemini (free tier yeterli) | $0 |
| Neon (free tier yeterli) | $0 |
| Domain (yıllık) | ~$1.25/ay |
| **Toplam** | **~$11/ay** |

### Büyüme senaryosu (50 kullanıcı)
| Kalem | Maliyet |
|---|---|
| Railway Pro | $20/ay |
| Twilio Production (verified) | ~$30-50/ay |
| Gemini (billing açık) | ~$5/ay |
| Neon (Pro plan) | $19/ay |
| **Toplam** | **~$75-95/ay** |

---

## 🌐 URL'ler ve Erişim

| Amaç | URL |
|---|---|
| **Production** | https://activity.tdevco.com |
| **Production (yedek)** | https://aktivite-girisserver-production.up.railway.app |
| **API health** | https://activity.tdevco.com/api/health |
| **GitHub repo** | https://github.com/oknkeles/aktivite-giris |
| **Bitbucket repo** | https://bitbucket.org/tdevconsulting/tdevactivity |
| **Railway dashboard** | https://railway.com (project: `fantastic-grace`) |
| **Cloudflare DNS** | https://dash.cloudflare.com → tdevco.com → DNS |
| **Neon DB console** | (Railway → server → variables → DATABASE_URL ile bağlanılır) |
| **Twilio Sandbox** | https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn |
| **Gemini API key yönetim** | https://aistudio.google.com/apikey |
| **WhatsApp bot numarası** | +1 415 523 8886 (Sandbox) |

---

## 🔑 Environment Variables (Railway)

Server'ın çalışması için gereken env'ler:

| Variable | Açıklama | Kaynak |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | Neon → connection details |
| `JWT_SECRET` | JWT imza anahtarı (32+ karakter) | Manuel oluştur (`openssl rand -base64 48`) |
| `NODE_ENV` | `production` | sabit |
| `CLIENT_URL` | CORS whitelist | `https://activity.tdevco.com,https://...railway.app` |
| `GEMINI_API_KEY` | Google AI key | https://aistudio.google.com/apikey |
| `TWILIO_ACCOUNT_SID` | Twilio account ID | Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Twilio API gizli token | Twilio Console → Account Info → Show |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` | Sabit (Sandbox numarası) |
| `PORT` | Railway otomatik atar | otomatik |

**Hiçbir env değeri repo'da YOK** — `.env` gitignore'da, sadece Railway Variables'ta tutulur.

---

## 🚀 Deploy Akışı

```
1. Developer: git push origin main
              ↓
2. GitHub: webhook → Railway tetiklenir
              ↓
3. Railway: Nixpacks build
   - npm install:all (--include=dev)
   - rm -rf client/dist server/dist (cache bust)
   - npm run build (Vite + tsc)
              ↓
4. Railway: Docker image push
              ↓
5. Railway: New deployment + healthcheck (/api/health, 300s timeout)
              ↓
6. Railway: Traffic switch → eski deployment removed
              ↓
7. activity.tdevco.com → yeni versiyon canlıda
```

**Otomatik DB migration:** `npm start` öncesinde `prisma migrate deploy || prisma db push --accept-data-loss` çalışır.

**Bitbucket'a yansıtma:** `git push bitbucket main` ile manuel push (partner review için).

---

## 🛡️ Güvenlik Notları

### ✅ Mevcut korumalar

- **bcrypt** ile şifre hash (rounds=10)
- **JWT** auth (30 gün geçerli)
- **Zod** schema validation tüm input'larda
- **Prisma** parametrik query → SQL injection imkansız
- **Self-register kapalı** — sadece admin kullanıcı oluşturabilir
- **Row-level security** — Timesheet/Tüm Aktiviteler sayfalarında kullanıcı sadece kendi kayıtlarını görür
- **Reports sayfası** admin-only
- **CORS whitelist** — sadece kendi domain'imiz API'ye erişebilir
- **HTTPS** — Let's Encrypt sertifika, Railway otomatik yenileme
- **WhatsApp identity** — telefon numarası eşleşmesi, başka biri bot ile konuşamaz

### ⚠️ İyileştirilmesi gerekenler (öncelik sırası)

1. **Rate limit yok** — `/api/auth/login` brute-force'a açık → `express-rate-limit` ekle
2. **JWT secret fallback `'dev'`** — env yoksa varsayılan kullanıyor → fail-fast yap
3. **Token localStorage'da** → XSS riski → ileride HttpOnly cookie + CSRF
4. **JWT 30 gün** — uzun → 1-2 gün + refresh token
5. **Şifre karmaşıklığı zorunlu değil** → min 8 karakter, harf+rakam kuralı
6. **2FA yok** — admin için önerilir
7. **Audit log yok** — kim ne zaman ne yaptı tutulmuyor

---

## 🔄 Yedekleme ve Felaket Senaryoları

| Felaket | Etki | Kurtarma |
|---|---|---|
| **Railway hesap askıya alınır** | Site düşer | Domain'i başka host'a yönlendir, son git commit'ten yeniden deploy (~30 dk) |
| **Neon DB silinir** | Veri kaybı | Neon free tier 7 gün point-in-time recovery sağlıyor — restore yap |
| **Cloudflare hesap kapanır** | Tüm site offline | Domain DNS'ini başka sağlayıcıya taşı (~2 saat propagation) |
| **GitHub repo silinir** | Source kayıp | **Bitbucket mirror'dan restore** ← güvenlik ağı |
| **Gemini API kotası dolar** | WhatsApp bot çalışmaz, web sürümü etkilenmez | Diğer modellere fallback otomatik, en kötüsü OpenAI'a geç |
| **Twilio kredisi biter** | WhatsApp bot susar | Web sürümünden devam, $20 recharge / production'a geç |

---

## 📦 Kayıtlı Kullanıcılar (üyelikler özet)

> Bu liste güncel tutulmalı. Yeni ekleme/silme yapıldığında not düş.

| Sistem | Hesap | Erişim seviyesi |
|---|---|---|
| GitHub | `oknkeles` | Owner |
| Bitbucket | `okan.keles@tdevco.com` | Admin |
| Railway | `okan.keles@tdevco.com` | Owner |
| Cloudflare | `tdevco2023@gmail.com` | Account owner |
| Twilio | `okan.keles@tdevco.com` | Owner |
| Google AI Studio | `okan.keles@tdevco.com` | Project owner |
| Aktivite Giriş (kendi sistemimiz) | Admin: `Okan Keleş` + diğer kullanıcılar | Admin paneli üzerinden yönetilir |

---

## 🤖 WhatsApp Bot Komutları

```
yardım          — Menüyü göster
bugün           — Bugünkü kayıtlarımı listele
son             — Son 5 kaydımı listele
bu hafta        — Bu haftaki kayıtlar
geçen ay Aktek  — Geçen ay Aktek için yapılanlar

# Doğal dil:
bugün 8 saat Aktek FIORI dashboard tasarımı
dünkü Beymen'i 4 saate çevir
son kaydımı sil
geçen cuma 4 saat Akkök JIRA-100
```

---

## 📞 Acil Durum İletişim

- **Railway destek:** support@railway.com (Pro plan'da SLA daha hızlı)
- **Twilio destek:** Console → ? ikonu (24h destek)
- **Cloudflare destek:** community.cloudflare.com (Free plan'da topluluk üzerinden)
- **Domain (GoDaddy):** support.godaddy.com
- **Neon destek:** discord.gg/neon

---

*Doküman güncelleme zamanı geldiğinde bu dosyayı düzenle ve push et.*
