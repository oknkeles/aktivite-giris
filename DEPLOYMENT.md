# 🚀 Üretim Dağıtım Kılavuzu

Bu uygulamayı şirket geneline yaymak için adım-adım kılavuz.
Tahmini süre: **30-45 dakika**. Maliyet: **₺0 – ₺250/ay** (kullanım yoğunluğuna göre).

---

## 📋 Genel Bakış

Yapacağımız 3 şey:

```
1. POSTGRESQL DATABASE         2. UYGULAMA HOSTING        3. DOMAİN & SSL
   (Neon)                          (Railway)                  (otomatik)

   Tüm verileri tutar             API + React'i çalıştırır   sirketim.up.railway.app
   Otomatik yedeklenir            GitHub'dan otomatik deploy  veya kendi domain'in
   Ücretsiz başlar                $5/ay (saatlik faturalanır) HTTPS otomatik
```

---

## 1️⃣ Database — Neon Postgres (Önerilen)

### Neden Neon?

- **Ücretsiz başlar** (3 GB storage, sınırsız compute)
- Saniyeler içinde kurulur
- Otomatik **point-in-time backup** (7 gün — ücretsizde)
- Türkiye'den hızlı erişim (Frankfurt bölgesi)
- Kredi kartı istemez (free tier için)
- Büyürsen $19/ay'a yükselt (10 GB + 30 gün backup)

**Alternatifler:** Supabase (benzer), Railway Postgres (aynı platformda olur ama ayrı kalsın daha güvenli), AWS RDS (kurumsal seviye, karmaşık).

### Kurulum

**1.** https://neon.tech adresine git → **Sign up** (GitHub ile gir)

**2.** Yeni proje oluştur:
- **Project name:** `tdev-aktivite`
- **Database name:** `aktivite` (default kalabilir)
- **Region:** `Europe (Frankfurt)` ← Türkiye'ye en yakın
- **Postgres version:** 16 (default)
- **Create project**'e tıkla

**3.** Karşına çıkan ekranda **Connection string**'i kopyala:
```
postgresql://neondb_owner:abc123xyz@ep-snowy-firefly-xxx.eu-central-1.aws.neon.tech/aktivite?sslmode=require
```
> ⚠️ Bu URL'yi güvenli yere kaydet — production'da kullanacağız.

**4.** Production için ayrı bir branch oluştur (önerilen):
- Neon dashboard → **Branches** → **Create branch**
- İsim: `production`
- Bu sayede development ve production verileri ayrılır

---

## 2️⃣ Kod Hazırlığı — Postgres'e Geçiş

Uygulama şu an SQLite kullanıyor (local development için). Üretim için **tek bir satır** değiştireceğiz.

### Yerel makinede:

**1.** `server/prisma/schema.prisma` dosyasında:

```diff
 datasource db {
-  provider = "sqlite"
+  provider = "postgresql"
   url      = env("DATABASE_URL")
 }
```

**2.** `server/.env` dosyasını güncelle (yerel test için):
```bash
DATABASE_URL="postgresql://neondb_owner:abc123xyz@ep-xxx.eu-central-1.aws.neon.tech/aktivite?sslmode=require"
JWT_SECRET="long-random-string-here-min-32-chars"
PORT=4000
CLIENT_URL="http://localhost:5173"
NODE_ENV="development"
```

> 🔐 **JWT_SECRET** için güçlü rastgele bir string üret:
> ```bash
> openssl rand -base64 48
> ```

**3.** Yeni schema'yı database'e push et:
```bash
cd server
npx prisma db push   # Tabloları oluşturur
npm run db:seed      # admin/1234 + müşteriler/yükleniciler
```

**4.** Yerel olarak test et:
```bash
cd ..
npm run dev
```
http://localhost:5173 — login admin/1234 ile gir. Müşteri listesi gelmeli.

**5.** Eğer her şey çalışıyorsa commit + push:
```bash
git add server/prisma/schema.prisma
git commit -m "Switch to PostgreSQL for production"
git push
```

---

## 3️⃣ Hosting — Railway

### Neden Railway?

- **GitHub'dan otomatik deploy** (her push'ta yeni versiyon yayına çıkar)
- React + Node API tek serviste çalışır
- **HTTPS otomatik** (Let's Encrypt)
- Custom domain ücretsiz
- $5/ay başlangıç kredisi → ~50 saatlik trafik
- Ölçeklendirme otomatik

**Alternatifler:** Render ($7/ay, free tier var ama uyuyor), Fly.io (daha güçlü ama karmaşık), Vercel + ayrı API (frontend Vercel'de, API ayrıda).

### Kurulum

**1.** https://railway.com → **Login with GitHub**

**2.** Sağ üstte **+ New Project** → **Deploy from GitHub repo**

**3.** GitHub'ı yetkilendir, `oknkeles/aktivite-giris` repo'sunu seç

**4.** Railway otomatik build başlar. **Settings** → **Variables** sekmesine git, şunları ekle:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Neon'dan kopyaladığın connection string |
| `JWT_SECRET` | Yerel `.env`'deki ile aynı uzun string |
| `NODE_ENV` | `production` |
| `PORT` | `4000` (Railway otomatik ayarlayabilir ama ekle) |

> 🔐 Hiçbir secret'ı asla GitHub'a commit etme. Sadece Railway Variables'a ekle.

**5.** **Settings** → **Networking** → **Generate Domain** tıkla
- `tdev-aktivite.up.railway.app` gibi bir URL alacaksın
- Bu URL'de uygulama erişilebilir olacak

**6.** Build tamamlanınca **Deployments** sekmesinden log'u izle. Şunu görmelisin:
```
🚀 API running on port 4000 (production)
```

**7.** Tarayıcıdan `https://<senin-url>.up.railway.app` aç → login `admin` / `1234`

---

## 4️⃣ İlk İş: Admin Şifresini Değiştir

**ÇOK ÖNEMLİ:** Default `1234` şifresi açık duruyor. Hemen değiştir.

Şu an için en kolay yöntem:
1. **Kullanıcılar** sayfasına git
2. Kendine yeni bir admin kullanıcısı oluştur (örn. `okan` / güçlü şifre)
3. Yeni admin ile login ol
4. Default `admin` kullanıcısını sil

> 💡 Bir sonraki versiyonda **Profil → Şifre Değiştir** ekleyeceğim. Şimdilik bu çalışıyor.

---

## 5️⃣ Custom Domain (İsteğe Bağlı)

Eğer kendi domain'in varsa (örn. `aktivite.tdevco.com`):

**1.** Railway → **Settings** → **Networking** → **Custom Domain** → ekle: `aktivite.tdevco.com`

**2.** Railway sana bir **CNAME** verir, örn: `tdev-aktivite.up.railway.app`

**3.** Domain sağlayıcında (Cloudflare/Namecheap/GoDaddy) DNS ayarı:
```
Type: CNAME
Name: aktivite
Value: tdev-aktivite.up.railway.app
TTL: Auto / 3600
```

**4.** 5-15 dakika bekle. SSL otomatik kurulur.

---

## 6️⃣ Şirkete Yayma

### Tek adımlık paylaşım

Tüm çalışanlara gönder:

```
🎉 Yeni aktivite takip sistemimiz yayında!

🔗 https://aktivite.tdevco.com
👤 Kullanıcı: <senin verdiğin>
🔐 Şifre: <ilk şifre>

İlk girişte şifrenizi değiştirin.
```

### Çalışan hesaplarını oluştur

Admin olarak:
1. **Kullanıcılar** sayfasına git
2. Her çalışan için kullanıcı oluştur (rol: **Kullanıcı**)
3. İlk şifre belirle, çalışana ilet
4. Çalışan kendi şifresini değiştirsin

---

## 7️⃣ Yedekleme

### Otomatik (Neon)
- Free tier: 7 günlük point-in-time recovery
- $19/ay tier: 30 gün

### Manuel yedek (opsiyonel — haftalık)
```bash
# Yerel makinede çalıştır:
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

Bu komut Postgres dump dosyası oluşturur. iCloud/Drive'a yükle.

### Restore (felaket senaryosu)
```bash
psql "$NEW_DATABASE_URL" < backup-20260520.sql
```

---

## 💰 Maliyet Özeti

| Kullanım | Aylık Maliyet |
|----------|---------------|
| **0-5 kullanıcı, az veri** | ₺0 (Neon free + Railway $5 kredi) |
| **5-30 kullanıcı, normal** | ~$5 (Railway sadece) |
| **30-100 kullanıcı, yoğun** | ~$24 ($5 Railway + $19 Neon Scale) |
| **Custom domain** | ₺0 (zaten varsa) |

**İlk 3 ay tamamen ücretsiz** çıkarsın — Neon free + Railway $5 hediye kredisi.

---

## 🔒 Güvenlik Kontrolü

Yayına almadan önce:

- [ ] `JWT_SECRET` minimum 32 karakter, rastgele
- [ ] Default `admin/1234` şifresi değiştirildi
- [ ] `.env` dosyası `.gitignore`'da (kontrol et!)
- [ ] HTTPS aktif (Railway otomatik)
- [ ] DATABASE_URL kimseyle paylaşılmadı
- [ ] Neon'da production branch ayrı (development'tan)

---

## 🐛 Sorun Giderme

### "Database connection failed" hatası
- Railway Variables'da `DATABASE_URL` doğru mu kontrol et
- Neon'da database "Active" durumunda mı?
- Connection string sonunda `?sslmode=require` var mı?

### Build başarısız
- Railway Deployments → log'a bak
- Genelde `prisma generate` problemi olur — `postinstall` script'i hallediyor
- Hâlâ olmuyorsa: Variables'a `NIXPACKS_NODE_VERSION=22` ekle

### "Cannot find module" hatası
- `npm run install:all` build aşamasında çalışmamış olabilir
- Railway → Settings → **Restart Deployment**

### Site açılmıyor ama API çalışıyor
- `https://<url>/api/health` → `{"ok":true}` dönüyorsa API tamam
- Build log'larında `vite build` başarılı oldu mu kontrol et

---

## 🔄 Güncelleme Akışı

İleride bir değişiklik yaptığında:

```bash
# 1. Yerel olarak değiştir
# 2. Test et
npm run dev

# 3. Commit + push
git add .
git commit -m "Yeni özellik"
git push

# 4. Railway otomatik yeni versiyonu deploy eder (~3 dakika)
# 5. Dashboard'da Deployments sekmesinden takip edebilirsin
```

---

## 📞 Yardım

- **Railway dokümanı:** https://docs.railway.com
- **Neon dokümanı:** https://neon.tech/docs
- **Prisma dokümanı:** https://www.prisma.io/docs

İyi yayınlar! 🚀
