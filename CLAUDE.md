# KelimeEdin — Claude Code Proje Rehberi

## Proje Özeti

KelimeEdin, Türk kullanıcılar için İngilizce kelime öğreten bir PWA (Progressive Web App) uygulamasıdır. Tek HTML dosyası olarak çalışır — sıfır bağımlılık, sıfır build step. GitHub Pages üzerinde yayınlanır.

**GitHub:** https://github.com/oknkeles/KelimeEdin  
**Canlı Site:** https://oknkeles.github.io/KelimeEdin/  
**Teknoloji:** Vanilla HTML + CSS + JavaScript (tek dosya: `index.html`)

---

## Dosya Yapısı

```
/
├── index.html          ← Uygulamanın tamamı (tek dosya, ~215KB)
└── CLAUDE.md           ← Bu dosya
```

Tüm kelimeler, stiller ve JavaScript `index.html` içine gömülüdür. Ayrı bir CSS veya JS dosyası yoktur.

---

## Uygulama Mimarisi

### Kelime Verisi

Her kelime şu yapıda bir JavaScript objesidir:

```javascript
{
  en: "gift",           // İngilizce kelime
  tr: "hediye",         // Türkçe karşılık (/ ile birden fazla: "kapı/geçit")
  cat: "abstract",      // Kategori (bkz. CAT_LABELS)
  img: "gift present",  // Unsplash arama terimi (ARTIK KULLANILMIYOR - görsel kaldırıldı)
  ex: [                 // 2-3 örnek cümle
    { en: "This is a gift for you.", tr: "Bu senin için bir hediye." },
    { en: "She gave me a beautiful gift.", tr: "Bana güzel bir hediye verdi." },
    { en: "Open your gift!", tr: "Hediyeni aç!" }
  ]
}
```

679 kelime `const WORDS = [...]` dizisinde tanımlı. İleride 1000'e çıkarılacak.

### Kategoriler (CAT_LABELS)

```javascript
const CAT_LABELS = {
  people: "👥 İnsanlar",   // 31 kelime
  body:   "🦴 Vücut",      // 25 kelime
  home:   "🏠 Ev & Eşya",  // 54 kelime
  food:   "🍽️ Yiyecek",   // 35 kelime
  nature: "🌿 Doğa",       // 40 kelime
  animal: "🐾 Hayvanlar",  // 20 kelime
  color:  "🎨 Renkler",    // 12 kelime
  time:   "⏰ Zaman",      // 20 kelime
  place:  "📍 Yerler",     // 35 kelime
  verb:   "⚡ Fiiller",    // 122 kelime
  adj:    "✨ Sıfatlar",   // 70 kelime
  abstract:"💭 Soyut",     // 78 kelime
  prof:   "👨‍⚕️ Meslekler", // 18 kelime
  clothes:"👕 Giyim",      // 24 kelime
  transport:"🚗 Ulaşım",  // 10 kelime
  society:"🏛️ Toplum",    // 37 kelime
  misc:   "📦 Diğer",      // 18 kelime
  extra:  "🔮 Ek"          // 30 kelime
  // TOPLAM: 679 kelime
};
```

### Eş Anlamlı Kelimeler (ALT_MEANINGS)

Aynı Türkçeye sahip birden fazla İngilizce kelime veya aynı kelimenin birden fazla Türkçe karşılığı için `ALT_MEANINGS` objesi tanımlı:

```javascript
const ALT_MEANINGS = {
  "market": [{"tr": "pazar (ekonomi)"}, {"tr": "pazar"}],
  "home":   [{"en": "house", "tr": "ev"}],
  "house":  [{"en": "home", "tr": "ev"}],
  "get":    [{"en": "take", "tr": "almak"}],
  "take":   [{"en": "get", "tr": "almak"}],
  "do":     [{"en": "make", "tr": "yapmak"}],
  "make":   [{"en": "do", "tr": "yapmak"}],
  "work":   [{"tr": "iş"}, {"tr": "çalışmak"}],
  "iron":   [{"tr": "ütülemek"}, {"tr": "demir"}],
  // ... toplam 36 kelime grubu
};
```

Cevap kontrolünde hem ana anlam hem alternatifler kabul edilir. Doğru cevap verilince "Diğer anlamları:" bölümü gösterilir.

### Cevap Kontrol Mantığı (`checkAnswer`)

1. Kullanıcının cevabı normalize edilir (küçük harf, noktalama kaldırılır)
2. Beklenen cevap `/` ile bölünür (örn. "kapı/geçit" → ["kapı", "geçit"])
3. `ALT_MEANINGS` içinde alternatifler kontrol edilir
4. `TR_TO_EN` reverse lookup ile TR→EN yönünde eş anlamlılar kontrol edilir

```javascript
function normalize(s) {
  return s.toLowerCase().trim()
    .replace(/[.,!?;:'"]/g, '')
    .replace(/\s+/g, ' ');
}
```

### Spaced Repetition Algoritması

Her kelime için `scores` objesinde şu veriler tutulur:

```javascript
scores["gift"] = {
  correct: 5,          // Toplam doğru sayısı
  wrong: 2,            // Toplam yanlış sayısı
  lastSeen: 1710000000000, // Timestamp
  bucket: 3,           // 0-5 arası (5 = tam öğrenildi)
  wasWrong: true,      // Daha önce yanlış yapıldı mı
  struggleConquered: false // Öğrenildi mi (bucket >= 4)
}
```

**Ağırlık hesaplama:**
```javascript
wrongWeight = (wrong + 1) * 4        // Yanlış → daha sık çıkar
correctPenalty = correct * 1.5       // Doğru → daha az çıkar
recencyPenalty = son 5 dakikada görülüyorsa azalt
bucketWeight = max(1, 6 - bucket)    // Düşük bucket → daha sık
```

**Öğrenildi koşulu:**
- `bucket >= 4` ve `correct >= 3` (direkt öğrenilen)
- `wasWrong = true` iken doğru yapılırsa `bucket += 2` (zorla öğrenilen → "Zoru Başardın!")

**LocalStorage anahtarları:**
```
ke-scores-v3   → { "gift": {correct, wrong, lastSeen, bucket, wasWrong, struggleConquered}, ... }
ke-global-v3   → { correct: 42, wrong: 18, learned: 7 }
```

---

## UI Yapısı

### 3 Sayfa (Tab)

1. **Öğren** (`page-play`) — Ana öğrenme ekranı
2. **Öğrenilen** (`page-learned`) — Tamamlanan kelimeler listesi
3. **İstatistik** (`page-stats`) — Genel istatistikler + kategori ilerleme

### Öğren Sayfası Akışı

```
[Yön etiketi: 🇬🇧 İngilizce → 🇹🇷 Türkçe]
[Kelime: "gift"] [🔊 Hoparlör butonu]
[Input: "cevabını yaz..."]
[Kontrol Et butonu]

↓ Cevap verilince:

[✓ Doğru / ✗ Yanlış / ⭐ ÖĞRENİLDİ! kutusu]
  gift 🔊
  Diğer anlamları: hediye = hediye vermek
[Sonraki Kelime → butonu]
[📖 Örnek Cümleler bölümü]
  🔊 This is a gift for you.
     Bu senin için bir hediye.
  ...

[Doğru | Yanlış | Öğrenilen kartları] ← mini istatistikler
```

### Öğrenilen Sayfası

İki bölüm:
- **💪 Zoru Başardın** — `wasWrong=true` olan ama sonradan öğrenilen kelimeler (altın kartlar)
- **✨ Hızlıca Öğrendin** — `wasWrong=false` olan ve öğrenilen kelimeler

---

## Tasarım Sistemi

### Renkler (CSS Variables)

```css
--bg: #0a0818          /* Arka plan (koyu mor-siyah) */
--card: rgba(255,255,255,0.04)  /* Kart arka planı */
--card-border: rgba(255,255,255,0.08)
--text: #e8e4f0        /* Ana metin */
--text-dim: #8a8295    /* İkincil metin */
--text-muted: #5a5468  /* Soluk metin */
--accent: #f5576c      /* Kırmızı-pembe */
--accent2: #4facfe     /* Mavi */
--success: #43e97b     /* Yeşil */
--gradient1: linear-gradient(135deg, #f093fb 0%, #f5576c 100%)  /* Pembe-kırmızı */
--gradient2: linear-gradient(135deg, #667eea 0%, #764ba2 100%)  /* Mavi-mor */
--gradient3: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)  /* Yeşil */
--gradient-gold: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)  /* Altın */
--gradient-success: linear-gradient(135deg, #11998e 0%, #38ef7d 100%)
--gradient-fail: linear-gradient(135deg, #eb3349 0%, #f45c43 100%)
```

### Fontlar

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Fraunces:wght@700;900&display=swap">
```
- **DM Sans** → Genel UI, butonlar, metinler
- **Fraunces** → Başlıklar, kelimeler, sayılar (serif, "KelimeEdin" logosu dahil)

### Animasyonlar

```css
@keyframes fadeUp   /* Sayfa geçişleri, sonuç kutuları */
@keyframes fadePop  /* Sonuç kutularının belirmesi (scale bounce) */
@keyframes shake    /* Yanlış cevap animasyonu */
@keyframes shimmer  /* Altın "Öğrenildi" ve banner üzerinde ışık efekti */
```

### Sonuç Kutuları (result-box)

```css
.result-box.correct  /* Yeşil gradyan, yeşil glow */
.result-box.wrong    /* Kırmızı gradyan, kırmızı glow */
.result-box.learned  /* Altın gradyan + shimmer animasyonu */
```

---

## iPhone / PWA Uyumu

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="KelimeEdin">
<meta name="theme-color" content="#0a0818">
```

**Safe Area desteği:**
```css
--safe-top: env(safe-area-inset-top, 0px);
--safe-bottom: env(safe-area-inset-bottom, 0px);
```

**Apple Touch Icon:** Base64 SVG (180x180, koyu mor arka plan + "K" harfi)  
**Manifest:** Base64 JSON (standalone mode, dark theme)

**Kurulum:**  
Safari → Paylaş → "Ana Ekrana Ekle" → Fullscreen uygulama gibi açılır

---

## Text-to-Speech (TTS)

```javascript
function speak(text, lang) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || 'en-US';
  u.rate = 0.85;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}
```

**Ne zaman çalışır:**
- Ana kelime gösterilirken → 🔊 butonuna basınca (EN→TR yönünde)
- Cevap verilince → otomatik İngilizce seslendirir (her iki yönde, 250ms gecikme)
- Sonuç kutusundaki 🔊 butonuyla tekrar dinlenebilir
- Örnek cümlelerin yanındaki küçük 🔊 butonlarıyla her cümle dinlenebilir
- TR→EN yönünde kelime gösterilirken hoparlör gizlenir (cevabı vermesin diye)

---

## Gelecek Yapılacaklar (TODOs)

### Öncelikli
- [ ] **1000 kelimeye ulaş** — Şu an 679 kelime var, ~321 tane daha eklenmeli
  - Önerilen yeni kategoriler: duygular (genişletme), teknoloji, spor, okul/eğitim, yemek pişirme, tıp, hukuk, iş dünyası, edatlar/bağlaçlar
- [ ] **GitHub Actions ile otomatik deploy** — Her push'ta Pages otomatik güncellensin

### Orta Vadeli
- [ ] **Ses tanıma** — Yazma yerine konuşarak cevap verme (Web Speech API)
- [ ] **Kelime ekleme** — Kullanıcı kendi kelimelerini ekleyebilsin
- [ ] **Çoktan seçmeli mod** — Yazma yerine 4 seçenek sunulsun
- [ ] **Streak sistemi** — Günlük çalışma serisi takibi
- [ ] **Karanlık/aydınlık tema toggle**

### Uzun Vadeli
- [ ] **Capacitor ile App Store** — Mevcut HTML'i iOS/Android uygulamasına paketle
- [ ] **Kullanıcı hesapları** — İlerlemeni farklı cihazlarda senkronize et
- [ ] **Arkadaşlarla yarış** — Multiplayer mod
- [ ] **Kelime kategorisi seçimi** — Sadece fiilleri veya sadece yiyecekleri çalış

---

## Yeni Kelime Ekleme Formatı

Python tuple formatı (kelime listelerini oluştururken kullanılan):

```python
("gift", "hediye", "abstract", "gift present wrapped", [
    ("This is a gift for you.", "Bu senin için bir hediye."),
    ("She gave me a beautiful gift.", "Bana güzel bir hediye verdi."),
    ("Open your gift!", "Hediyeni aç!")
])
# Format: (en, tr, cat, img_query_UNUSED, [(en_sentence, tr_sentence), ...])
```

JSON formatı (index.html içine gömülen):
```json
{
  "en": "gift",
  "tr": "hediye",
  "cat": "abstract",
  "img": "gift present wrapped",
  "ex": [
    {"en": "This is a gift for you.", "tr": "Bu senin için bir hediye."},
    {"en": "She gave me a beautiful gift.", "tr": "Bana güzel bir hediye verdi."},
    {"en": "Open your gift!", "tr": "Hediyeni aç!"}
  ]
}
```

**Kural:** Her kelime için mutlaka **2-3 örnek cümle** olmalı. İngilizce cümleler günlük konuşma diline yakın olmalı, çok karmaşık gramer yapıları içermemeli.

---

## Mevcut Bilinen Sorunlar

1. **iOS Safari TTS** — İlk açılışta ses çalışmayabilir (kullanıcı etkileşimi gerekli). Genellikle ilk "Kontrol Et" butonuna bastıktan sonra düzelir.
2. **Unsplash görselleri kaldırıldı** — `img` alanı hala veride var ama kullanılmıyor. Gelecekte farklı bir görsel API denenebilir.
3. **Büyük/küçük harf** — "Gift" yazılırsa yanlış sayılır, normalize ile çözülmüş ama Türkçe karakterlerde edge case olabilir.
4. **Çok uzun TR cevaplar** — "sahip olmak", "ihtiyaç duymak" gibi uzun karşılıklar mobilde yazmak zor. Çoktan seçmeli mod bu sorunu çözer.

---

## Geliştirici Notları

### Kod Değiştirirken Dikkat

- `ke-scores-v3` ve `ke-global-v3` localStorage anahtarları. Veri yapısı değişirse versiyon numarasını artır (v4, v5...) aksi halde eski veri bozulur.
- WORDS dizisi çok büyük (679 kelime × ortalama 3 cümle). HTML dosyası büyümeye devam edecek ama single-file yaklaşımı korunmalı.
- Tüm animasyonlar CSS @keyframes ile yapılmış, JS animation yok — performans için iyi.
- `overscroll-behavior-y: none` ile iOS'ta sayfa bounce'u engellendi.

### Test Checklist

- [ ] İngilizce → Türkçe yönü çalışıyor mu?
- [ ] Türkçe → İngilizce yönü çalışıyor mu?
- [ ] Eş anlamlı cevaplar kabul ediliyor mu? (market → pazar/pazar ekonomi)
- [ ] Yanlış cevap shake animasyonu çalışıyor mu?
- [ ] TTS sesi çıkıyor mu?
- [ ] Örnek cümlelerin sesi çalışıyor mu?
- [ ] "Öğrenildi" sistemi doğru çalışıyor mu?
- [ ] "Öğrenilen" sayfası "Zoru Başardın" bölümünü gösteriyor mu?
- [ ] iPhone'da PWA olarak kurulabiliyor mu?
- [ ] Klavye açıkken kelime ve input görünüyor mu (scroll gerekmemeli)?
