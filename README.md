# Aktivite Giriş Sistemi

SAP danışmanlık firması için geliştirilmiş, modern ve eğlenceli bir **aktivite takip & faturalama** uygulaması. Tek HTML dosyası — kurulum yok, açıp kullan.

## ✨ Özellikler

### 📅 Akıllı Takvim
- macOS Calendar tarzı temiz, modern arayüz
- Etkinlik chip'lerinde **müşteri + saat** bilgisi (`OYPA · 4s`)
- Her gün için **doluluk göstergesi** (8 saat = tam gün)
- Bugün için animasyonlu pulse efekti
- Hafta sonu farklı renklerle ayrılıyor

### 🎯 Çoklu Gün Seçimi
- Tek tıkla gün modalını aç
- **Sürükleyerek** birden fazla gün seç → otomatik aralık
- **Çoklu Seçim modu** ile tek tek günleri toggle et
- Shift/Cmd+Click ile range select
- Toplu kayıt: bir kerede 10+ güne aynı aktiviteyi ekle 🎉

### 👥 Rol Sistemi
- **Yönetici**: tüm yetkiler — tutarlar, faturalama, raporlar, kullanıcı yönetimi
- **Kullanıcı**: sadece aktivite giriş — tutarları göremez

### 💰 Esnek Fiyatlandırma
- Yüklenici bazında **iskonto** (örn. SALDO %10)
- Aktivite/seviye bazında **günlük rate** (Junior, Mid, Senior, Expert)
- 1 gün = 8 saat → saat girişlerinde otomatik hesap

### 📊 Raporlama & Excel
- Müşteri/yüklenici/dönem bazında raporlar
- **Excel'e aktarım**: hem detay hem özet sayfaları (fatura tutarları + iskonto bilgisi dahil)
- Faturalama dış sistemde yapılır — bu uygulama aktivite & rapor odaklı

### 🎨 Modern UX
- Vibrant gradient palette (indigo → mor → pembe)
- Floating Action Button (FAB)
- Animasyonlu sayaçlar
- 🎉 Konfeti efekti (toplu kayıt & 8 saat milestone'ları)
- Animasyonlu arkaplan blob'ları
- Toast bildirimleri
- ESC ile modal kapatma, Cmd+Enter ile kayıt

## 🚀 Kullanım

1. `index.html`'i tarayıcıda aç (veya GitHub Pages üzerinden online aç)
2. Varsayılan giriş: `admin` / `1234`
3. Yönetici panelinden ek kullanıcı oluştur

## 📦 Önceden Tanımlı Veri

Uygulama ilk açıldığında şunlar hazır gelir:

**Yükleniciler:**
- SALDO (%10 iskonto)
- TDEV (iskonto yok)
- FIKS (%10 iskonto)

**Aktivite seviyeleri:**
- Junior, Mid, Senior, Expert (saat birimli)

**Müşteriler:**
SALDO altında Eti, Şenpiliç, Eminevim, Beyçelik, Gesbey, Neutec, Coşkunöz, Multinet, Oedaş, Oepsaş, Oypa ve daha fazlası. TDEV altında THY (16.017,75 ₺). FIKS altında Kosifler.

## 🛠 Teknik

- Saf HTML + CSS + JS (framework yok)
- Veri tarayıcının **localStorage**'ında saklanır
- Excel export için [SheetJS](https://sheetjs.com/) CDN
- Font: Plus Jakarta Sans + JetBrains Mono

## 📄 Lisans

MIT — keyfini çıkar 🚀
