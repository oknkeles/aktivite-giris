# Aktivite Giriş Sistemi v5

> SAP danışmanlık firması için **modern, eğlenceli ve tam responsive** aktivite takip & raporlama uygulaması.
> React frontend · Express backend · SQLite database

![stack](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![stack](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![stack](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![stack](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![stack](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![stack](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)

## 🏗 Mimari

```
┌─────────────────────────┐         ┌────────────────────────────┐         ┌──────────────────┐
│  Client (React + Vite)  │  REST   │   Server (Express + JWT)   │  Prisma │   SQLite (.db)   │
│  Tailwind · TanStack Q  │ ──────► │   Zod validation · CORS    │ ──────► │   File-based     │
│  Zustand · React Router │         │   Auth middleware          │         │                  │
└─────────────────────────┘         └────────────────────────────┘         └──────────────────┘
        :5173                                    :4000
```

**Frontend (`client/`)** — Vite + React 18 + TypeScript + Tailwind CSS + TanStack Query + Zustand + React Router 7 + Lucide icons + SheetJS (Excel export).

**Backend (`server/`)** — Express 4 + Prisma ORM + SQLite + JWT auth + Zod validation + bcrypt password hashing.

**Database** — SQLite file at `server/prisma/dev.db`. Schema: User · Activity · Contractor · Customer · CustomerRate · Entry.

## 🚀 Kurulum & Çalıştırma

**Gereksinim:** Node.js 20+

```bash
# 1. Tüm bağımlılıkları kur
npm run install:all

# 2. Database'i oluştur (SQLite schema push)
npm run db:push

# 3. Test verisi (28 müşteri, 3 yüklenici, admin/1234 kullanıcı)
npm run db:seed

# 4. Frontend + backend birlikte çalıştır
npm run dev
```

- **Frontend:** http://localhost:5173
- **API:** http://localhost:4000
- **Varsayılan giriş:** `admin` / `1234`

## ✨ Özellikler

### 🎨 Tasarım
- Vibrant gradient palet (indigo → mor → pembe)
- **Tam responsive** — mobil, tablet, masaüstü, ultra-wide ekranlarda yarısı boş kalmıyor
- Timesheet'te geniş ekranda sağ panelde: en çok çalışılan müşteriler + son kayıtlar
- Sidebar mobilde drawer, masaüstünde fixed
- Animasyonlu arka plan blob'ları, konfeti, toast bildirimler
- ESC ile modal kapatma

### 📅 Akıllı Takvim
- Etkinlik chip'leri: **Müşteri · Saat** birlikte (`OYPA · 8s`)
- Gün başına doluluk barı (8 saat = tam gün)
- Bugün için pulse animasyonu
- Hafta sonu farklı renkte

### 🎯 Çoklu Seçim
- Sürükleyerek aralık seç
- "Çoklu Seçim" modu ile tek tek toggle
- Shift/Cmd+Click range select
- **Toplu kayıt**: tek formla N güne aynı aktiviteyi ekle (🎉 konfeti)

### 🔐 Rol Sistemi
- **Yönetici**: tüm yetkiler — tutarlar, raporlar, kullanıcı yönetimi
- **Kullanıcı**: aktivite girişi (tutarları göremez)

### 💰 Esnek Fiyatlandırma
- Yüklenici bazında iskonto (SALDO/FIKS %10, TDEV iskonto yok)
- Müşteri × Aktivite matrisi günlük rate
- Otomatik gün/saat dönüşümü (1 gün = 8 saat)

### 📊 Raporlama
- Müşteri/yüklenici/dönem filtresi
- Yüklenici → müşteri → aktivite hiyerarşik özet
- Excel export (Detay + Özet sayfaları)

## 🗂 Önceden Tanımlı Veri

**Yükleniciler:** SALDO (%10), TDEV (iskonto yok), FIKS (%10)
**Aktivite seviyeleri:** Junior, Mid, Senior, Expert
**Müşteriler:** 26 SALDO müşterisi + THY (TDEV) + Kosifler (FIKS)
**Test rate:** Tüm rate'ler 20.000 ₺ (kolay kontrol için)

## 📁 Yapı

```
aktivite-giris/
├── client/                  # React frontend
│   ├── src/
│   │   ├── api/             # Backend API client + types
│   │   ├── components/      # Sidebar, Layout, Modal, Toast
│   │   ├── pages/           # Login, Timesheet, Entries, ...
│   │   ├── store/           # Zustand auth store
│   │   ├── lib/             # Helpers (formatting, dates)
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── tailwind.config.js
│   └── vite.config.ts
├── server/                  # Express backend
│   ├── src/
│   │   ├── routes/          # auth, activities, customers, ...
│   │   ├── middleware/      # JWT auth
│   │   ├── db.ts            # Prisma client
│   │   └── index.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── .env
├── legacy/                  # Eski single-file HTML sürümü (referans)
└── package.json             # Root workspace
```

## 🛠 Scripts

| Komut | Açıklama |
|-------|----------|
| `npm run install:all` | Workspace bağımlılıklarını kur |
| `npm run db:push` | Prisma schema → SQLite |
| `npm run db:seed` | Seed data |
| `npm run dev` | Frontend + backend paralel |
| `npm run dev:server` | Sadece API |
| `npm run dev:client` | Sadece UI |
| `npm run build` | Production build |

## 📄 Lisans

MIT — keyfini çıkar 🚀
