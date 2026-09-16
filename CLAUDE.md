# KelimeEdin — Proje Rehberi

Türk kullanıcılar için İngilizce kelime öğreten PWA. Build step yok, bağımlılık yok, framework yok — düz HTML + CSS + vanilla JS. GitHub Pages üzerinde yayınlanır.

| | |
|---|---|
| **GitHub** | https://github.com/oknkeles/KelimeEdin |
| **Canlı** | https://oknkeles.github.io/KelimeEdin/ |
| **Kelime** | 1100 (her biri 3 örnek cümleli → 3300 cümle) |
| **Teknoloji** | Vanilla JS, tek `<script>` bloğu, sıfır bağımlılık |

> Bu dosya `802c74f` commit'indeki koda göre yazıldı. Kodu değiştirdiğinde burayı da güncelle — bu rehberin bir önceki sürümü koddan aylarca geride kalmıştı ve yanlış yönlendiriyordu.

---

## 1. Dosya Yapısı

```
index.html                    148 KB  ← Uygulamanın tamamı (HTML + CSS + JS)
sw.js                           1 KB  ← Service worker (önbellek)
data/words.json               316 KB  ← Kelime KAYNAĞI — düzenlenecek dosya bu
data/words.dat                116 KB  ← Üretilen dosya — tarayıcının yüklediği bu
.github/workflows/deploy.yml          ← main'e push → GitHub Pages deploy
CLAUDE.md                             ← Bu dosya
```

`index.html` tek başına çalışmaz; kelimeleri çalışma anında `data/words.dat`'tan çeker.

---

## 2. Kelime Verisi

### Şema

```json
{
  "en": "man",
  "tr": "adam",
  "cat": "people",
  "cefr": "A1",
  "ex": [
    { "en": "The man is reading a book.", "tr": "Adam kitap okuyor." },
    { "en": "That man is my teacher.",    "tr": "O adam benim öğretmenim." },
    { "en": "A young man helped me.",     "tr": "Genç bir adam bana yardım etti." }
  ]
}
```

- **`tr`** — birden fazla karşılık `/` ile: `"kapı/geçit"`. Her parça ayrı ayrı kabul edilir.
- **`tr`** — parantezli açıklama ayırt etmek içindir, cevabın parçası **değildir**: `"ay (takvim)"` kelimesine `ay` yazmak doğru sayılır (`moon` da `ay` olduğu için parantez konmuş).
- **`cefr`** — kelime başına açıkça atanmış (Cambridge EVP / Oxford 3000-5000 referans alındı). Kategoriden tahmin **edilmez**.
- **`ex`** — her kelimede tam 3 cümle. İlk cümle quiz ekranında ipucu olarak gösterilir.
- `img` alanı eskiden vardı, tamamen kaldırıldı.

### CEFR Dağılımı

| A1 | A2 | B1 | B2 | C1 | C2 |
|---|---|---|---|---|---|
| 237 | 307 | 146 | 129 | 139 | 142 |

### Kategoriler (20)

`verb` 171 · `formal` 142 · `academic` 139 · `abstract` 120 · `adj` 103 · `home` 54 · `society` 51 · `nature` 42 · `food` 35 · `place` 35 · `people` 31 · `extra` 30 · `body` 25 · `clothes` 24 · `animal` 20 · `time` 20 · `prof` 18 · `misc` 18 · `color` 12 · `transport` 10

Üçü tek bir seviyede toplanmış: `academic` tamamen C1, `formal` tamamen C2, `extra` A2–B2 arası. Bu yüzden A1'deki bir kullanıcı için kategori çipleri kilitli görünür.

### ⚠️ words.dat Yeniden Üretme

`words.json`'ı **her değiştirdiğinde** `words.dat`'ı yeniden üret, yoksa değişiklik uygulamaya yansımaz.

Kodlama: `JSON → gzip → base64 → ters çevir`

```python
import json, gzip, base64
src = json.load(open('data/words.json', encoding='utf-8'))
raw  = json.dumps(src, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
b64  = base64.b64encode(gzip.compress(raw, 9)).decode('ascii')
open('data/words.dat', 'w').write(b64[::-1])

# Gidiş-dönüş doğrulaması — atlama
back = json.loads(gzip.decompress(base64.b64decode(open('data/words.dat').read()[::-1])))
assert back == src, "roundtrip bozuk!"
print("ok:", len(back), "kelime")
```

Tarayıcı tarafı `DecompressionStream('gzip')` kullanır; desteklenmezse `words.json`'a düşer.

---

## 3. Çekirdek Algoritmalar

### 3.1 Cevap Kontrolü

Zincir: `normalize()` → `answerVariants()` → `fuzzyEqual()` → `ALT_MEANINGS` / `TR_TO_EN`

```js
normalize(s)  // küçük harf, baş/son boşluk, noktalama sil, çoklu boşluk tekle
```

**`answerVariants(expected)`** — kabul edilen tüm yazımlar: cevabın tamamı, `/` veya `,` ile ayrılmış her parça, ve bunların parantezsiz halleri. `"ay (takvim)"` → `{"ay (takvim)", "ay"}`.

**`fuzzyEqual(user, expected, lang)`** — sırayla:

1. Birebir eşitse → **doğru**
2. Türkçe mastar kuralı: `"gel"` ↔ `"gelmek"` (`-mek`/`-mak` kökü) → **doğru**
3. **Sözlük kontrolü**: yazılan şey sözlükte başka bir kelimenin cevabıysa → **yanlış**
4. Sonek toleransı: ortak önek ≥ 4 karakter **ve** fark sadece kelime **sonunda** (≤1 karakter, uzun kelimelerde ≤2) → doğru

3. adım kritik: `hear`/`heart`, `bread`/`break`, `tarif`/`tarih`, `asla`/`aslan` gibi gerçekten farklı kelimeler birbirinin yazım hatası sayılmamalı. Bu kontrol `EN_ANSWERS` / `TR_ANSWERS` set'lerini kullanır, ikisi de kelimeler yüklenince kurulur.

Kabul edilir: `tereyağ` → `tereyağı`, `gel` → `gelmek`, `ay` → `ay (takvim)`
Reddedilir: `merhabba` → `merhaba` (ortada hata), `takvim` → `ay (takvim)` (sadece açıklama), `hear` → `heart`

**`ALT_MEANINGS`** (36 grup) — aynı kelimenin farklı anlamları / eş anlamlılar:
```js
"market": [{"tr": "pazar (ekonomi)"}, {"tr": "pazar"}]
"home":   [{"en": "house", "tr": "ev"}]
```
**`TR_TO_EN`** — TR→EN yönünde ters arama, kelimeler yüklenirken kurulur. `"ev"` için hem `home` hem `house` kabul edilir.

### 3.2 Kelime Seçimi (`pickNext`)

Önce retry kuyruğu kontrol edilir (yanlış yapılan kelime 3-5 kart sonra tekrar gelir). Sonra **rulet çarkı** (ağırlıkla orantılı rastgele) seçim yapılır.

```js
wrongWeight     = (wrong + 1) * 4          // yanlış → daha sık
bucketWeight    = max(1, 6 - bucket) * 2   // düşük bucket → daha sık
correctPenalty  = correct * 1.5            // doğru → daha seyrek
recencyPenalty  = son 5 dakikada görüldüyse azalt

weight = wrongWeight + bucketWeight - correctPenalty - recencyPenalty
if (öğrenilmiş && vadesi gelmemiş) weight *= 0.15   // dinlenmede
if (weight < 0.5) weight = 0.5
if (vadesi gelmiş)                weight *= 4       // tekrar zamanı
weight *= CEFR_LEVEL_WEIGHTS[seviye farkı]
weight *= 0.7 + rastgele * 0.6
```

`CEFR_LEVEL_WEIGHTS = [10, 2.5, 0.5, 0.08, 0.015, 0.003]` — indeks, kelimenin kullanıcının açtığı seviyenin **kaç kademe altında** olduğudur. Mevcut seviye 10×, bir alt 2.5× …

> **Rulet seçimi şart.** Önceki sürüm "ağırlığa göre sırala → en üst %15'i al → aralarından eşit seç" yapıyordu; bu, kesme noktasının altındaki her ağırlığı *küçük şans* değil **sıfır şans** haline getiriyordu. Sonuç: B2 kullanıcısına %100 B2 geliyordu ve öğrenilmiş bir kelime vadesi gelse bile 3000 seçimde 0 kez dönüyordu. Buraya tekrar "top-N" mantığı koyma.

Ölçülen dağılım (B2 kullanıcısı, 2000 seçim): **B2 %69 · B1 %21 · A2 %9 · A1 %1**

### 3.3 Spaced Repetition

```js
SR_INTERVALS_DAYS = [0, 1, 2, 4, 7, 14, 30]   // bucket → gün
```

Kelime başına tutulan kayıt:
```js
scores["gift"] = {
  correct, wrong, lastSeen, bucket,
  wasWrong,           // hiç yanlış yapıldı mı
  struggleConquered,  // "öğrenildi" bayrağı
  dueAt               // bir sonraki tekrar zamanı (timestamp)
}
```

- **Doğru** → `bucket += 1` (daha önce yanlış yapıldıysa `+= 2`), `dueAt` ileri atılır
- **Yanlış** → `bucket -= 1`, `dueAt = +1 gün`, `wasWrong = true`, retry kuyruğuna eklenir
- **Öğrenildi** → `bucket >= 4` **ve** (`wasWrong` veya `correct >= 3`)
- **İpuçlu doğru** → bucket ilerlemez ama `dueAt` yine de tazelenir *(tazelenmezse kelime sonsuza dek "vadesi geçmiş" kalıp 4× ağırlıkla tekrar eder)*
- **Öğrenilmiş kelime yanlış yapılırsa geri alınır** — `struggleConquered = false`, `global.learned--`. Aksi halde unutulan kelime "Öğrenilenler"de takılı kalır ve hiçbir listede görünmez.

### 3.4 CEFR Seviye İlerleme

```js
CEFR_ORDER = ['A1','A2','B1','B2','C1','C2']
LEVEL_UP_THRESHOLD   = 0.80   // seans doğruluğu ≥ %80 → bir üst seviye açılır
LEVEL_DOWN_THRESHOLD = 0.50   // < %50 → bir alt seviyeye düşülür
```

Seans **sonunda** `checkLevelChange()` ile bir kez değerlendirilir. Yeni kullanıcı daima A1'den başlar.

> `showSessionSummary()` `session.summaryShown` ile korunuyor. Bu koruma olmadan özet ekranında Space/Enter'a her basış `checkLevelChange()`'i yeniden çalıştırıp seviye atlatıyordu (5 basış = A2'den C2'ye).

---

## 4. Durum ve localStorage

| Anahtar | İçerik |
|---|---|
| `ke-scores-v4` | Kelime başına skorlar (yukarıdaki şema) |
| `ke-global-v3` | `{ correct, wrong, learned }` |
| `ke-streak-v1` | `{ current, lastDay }` |
| `ke-settings-v1` | `{ sessionLen, hintEnabled, voiceEnabled, notifEnabled, catFilter }` |
| `ke-recent-v1` | Son öğrenilen 30 kelime |
| `ke-activity-v1` | Gün bazlı `{ correct, wrong, learned }` |
| `ke-achievements-v1` | `{ başarımId: timestamp }` — **nesne, dizi değil** |
| `ke-notes-v1` | Kullanıcının kelime notları |
| `ke-cefr-v2` | `{ unlockedLevel: 0-5 }` |

**Kurallar:**

- Her anahtar `loadJSON()` ile **ayrı ayrı** yüklenir. Tek bir `try/catch` kullanma — bozuk bir kayıt sonraki tüm anahtarları sessizce sıfırlıyordu.
- Yükleme sonrası şekil doğrulaması yapılır. `achievements`, `scores`, `notes`, `activity` **düz nesnedir**; `Array.isArray` ile kontrol etme, hepsini siler.
- `global.learned` her açılışta `struggleConquered` bayraklarından yeniden sayılır (ayrı sayaç olduğu için kayabiliyor).
- Veri şekli değişirse anahtar versiyonunu artır (`v4` → `v5`), yoksa eski veri bozulur.
- Gün anahtarı `"2026-9-4"` biçiminde (sıfır doldurmasız). **`new Date(key)` ile ayrıştırma** — ISO-8601 değil, Safari `Invalid Date` döndürebilir. `dayKeyToTime()` kullan.

---

## 5. Arayüz

### Sekmeler
- **Öğren** (`page-play`) — quiz akışı
- **Öğrenilen** (`page-learned`) — 3 alt sekme:
  - ⭐ **Öğrenilenler** — `struggleConquered`
  - 💪 **Güçlü Kelimelerim** — hiç yanlış yok **ve** `correct >= 2`
  - 🎯 **Zorlanıyorum** — en az 1 yanlış, henüz öğrenilmemiş (yanlış sayısına göre sıralı)
- **İstatistik** (`page-stats`) — genel sayılar, haftalık grafik, günlük hedef, CEFR yol haritası, başarımlar, en zor kelimeler

### Quiz Akışı
```
[🇬🇧 İngilizce → 🇹🇷 Türkçe]  [A1 rozeti]
month                          [🔊]
/ Next month is my birthday. / ← ipucu cümlesi (ilk örnek)
●●○●  3✓ 1✗                    ← kelime geçmişi noktaları
[cevabını yaz...]
[Kontrol Et]  [💡 İpucu]  [⏭ Pas]
↓
[✓ Doğru / ✗ Yanlış / ⭐ ÖĞRENİLDİ!]
[😎 Kolay | 🙂 Normal | 😤 Zor]   ← manuel SR ayarı
[📖 Örnek Cümleler]
[Sonraki Kelime →]
```

İpucu cümlesi TR→EN yönünde hedef kelimeyi `____` ile gizler (çekimli halleri de). Cevap verilince gizlenir — aşağıdaki örnek cümleler kutusunda birebir tekrar ediyor.

### Etkileşim
- **Enter** → kontrol et; cevap verilmişse sonraki kelime
- **Space** → sonraki kelime · **H** → ipucu · **Esc** → ayarları kapat
- **Sola kaydır** → Pas · **Sağa kaydır** → İpucu (dikey ağırlıklı hareketler yok sayılır)

> Input'un Enter handler'ı `e.stopPropagation()` çağırır. Çağırmazsa olay `document`'a ulaşır; `checkAnswer()` input'u blur ettiği için oradaki "input'ta mıyız?" koruması devre dışı kalır ve aynı tuşla sonraki kelimeye atlanır.

---

## 6. Tasarım

```css
--bg: #0a0818            --text: #e8e4f0         --accent: #f5576c
--card: rgba(255,255,255,0.04)                   --accent2: #4facfe
--text-dim: #8a8295      --success: #43e97b
--gradient1: #f093fb → #f5576c    (pembe-kırmızı)
--gradient2: #667eea → #764ba2    (mavi-mor)
--gradient3: #43e97b → #38f9d7    (yeşil)
--gradient-gold: #ffd700 → #ff8c00
```

Fontlar: **DM Sans** (arayüz), **Fraunces** (başlıklar, kelimeler, sayılar).
Animasyonların tamamı CSS `@keyframes` — JS animasyon yok.

---

## 7. PWA ve Service Worker

`sw.js` cache-first: `./`, `./index.html`, `./data/words.dat`.

> ### 🚨 Her deploy'da cache versiyonunu artır
> ```js
> const CACHE = 'kelimeedin-v20';   // → v21
> ```
> Artırmazsan kullanıcılar eski sürümü görmeye devam eder. Yeni SW devreye girince sayfa otomatik yenilenir (`controllerchange`).

Service worker `init()` içinde **`showWord()`'den önce** kaydedilir. Sonda olduğu zaman, başarısız bir `words.dat` yüklemesi onu da devre dışı bırakıyor ve uygulama kalıcı olarak çevrimdışı çalışamaz hale geliyordu.

iOS: `viewport-fit=cover`, `apple-mobile-web-app-capable`, `env(safe-area-inset-*)`. Kurulum: Safari → Paylaş → Ana Ekrana Ekle.

---

## 8. Deploy

`main`'e push → GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages. Build adımı yok, repo kökü olduğu gibi yayınlanır.

```bash
# words.json değiştiyse önce words.dat'ı üret (Bölüm 2)
# sw.js'te cache versiyonunu artır
git add -A && git commit -m "..." && git push origin main
```

---

## 9. Geliştirme ve Test

Build yok — `index.html`'i doğrudan tarayıcıda aç. Service worker için `localhost` üzerinden servis etmek gerekir:

```bash
python3 -m http.server 8000
```

Değişiklikten sonra faydalı kontroller:

```bash
# JS sözdizimi (script bloğunu çıkarıp kontrol et)
python3 -c "
import re; s=open('index.html').read()
open('/tmp/app.js','w').write('\n'.join(re.findall(r'<script[^>]*>(.*?)</script>', s, re.S)))"
node --check /tmp/app.js

# Statik analiz — tanımsız değişken / fonksiyon avı
npx eslint /tmp/app.js
```

### Test Listesi

- [ ] EN→TR ve TR→EN yönleri
- [ ] Enter: kontrol ediyor, kelimeyi atlamıyor
- [ ] `ay` → `ay (takvim)` kabul, `hear` → `heart` **ret**, `merhabba` → `merhaba` **ret**
- [ ] `gel` → `gelmek` kabul
- [ ] Eş anlamlılar (`ev` → home/house)
- [ ] Seviye atlama: seans sonunda **bir kez** (özet ekranında Space'e basınca tekrar etmemeli)
- [ ] Öğrenilen sayfasındaki 3 sekme doluyor
- [ ] Zorluk butonları her karttan sonra tekrar tıklanabilir
- [ ] Yedekle → Geri Yükle: CEFR seviyesi, başarımlar, notlar, grafik korunuyor
- [ ] Sıfırla: gerçekten her şeyi siliyor
- [ ] iPhone'da örnek cümlelere kaydırmak "Pas" tetiklemiyor
- [ ] PWA kurulumu, TTS, çevrimdışı açılış

---

## 10. Bilinen Sorunlar

1. **13 kelime sözlükte iki kez geçiyor** — `brush`, `work`, `clean`, `dirty`, `answer`, `trust`, `smile`, `iron`, `water`, `garden`, `market`, `dry` (3 kez) farklı anlamlarla. Skorlar sadece `en` ile anahtarlandığı için bir anlamı öğrenmek diğerini de öğrenilmiş sayıyor, kelime detayında hep ilk anlam açılıyor, kategori çubukları fazla sayıyor. **Düzgün çözüm** ya veriyi birleştirmek (`"fırça/fırçalamak"`) ya da skor anahtarını `en|tr` yapmak — ikincisi mevcut kullanıcı verisi için taşıma gerektirir.
2. **`onclick` içine gömülen kelimeler** — `openWordDetailByEn('...')` HTML-escape'i JS string bağlamında kullanıyor. Şu an veride kesme işaretli kelime olmadığı için sorun çıkmıyor; `o'clock` veya `Türkiye'de` eklendiği gün kırılır.
3. **iOS Safari TTS** — ilk kullanıcı etkileşiminden önce ses çalmayabilir (`unlockTTS()` bunu hafifletiyor).
4. **Uzun TR cevaplar** — `"sahip olmak"` gibi karşılıkları mobilde yazmak zor. Çoktan seçmeli mod bunu çözer.

---

## 11. Kod Değiştirirken Dikkat

- **Tek dosya yaklaşımı korunmalı.** `index.html` içinde tek bir `<script>` var; bağımlılık veya build step ekleme.
- **`esc()` fonksiyonunu silme veya `escape()` diye adlandırma.** Yerleşik `escape()` yüzde kodlaması yapar ve Türkçeyi bozar (`doğum günü` → `do%u011Fum%20g%FCn%FC`).
- **`pickNext()`'te rulet seçimini koru** (Bölüm 3.2'deki uyarı).
- **Fonksiyon içinde `addEventListener` çağırma** — `bindUI()` ve `initSwipe()` bir kez çalışır; tekrar çağrılan bir fonksiyona listener koyarsan birikir.
- **localStorage şekil kontrollerinde `Array.isArray` kullanma** (Bölüm 4).
- `retryQueue` yeni seansta temizlenir; seans sonuna yakın verilen yanlışların retry'ı atlanır (kelime zaten `dueAt` üzerinden geri gelir).

---

## 12. Yol Haritası

**Öncelikli**
- [ ] Yinelenen 13 kelimeyi çöz (Bölüm 10.1)
- [ ] Çoktan seçmeli mod — uzun TR cevapları mobilde yazma sorununu çözer

**Orta vadeli**
- [ ] Kullanıcının kendi kelimesini ekleyebilmesi
- [ ] Kelime sayısını artırma (B1 ve B2 en ince seviyeler: 146 / 129)
- [ ] Aydınlık tema

**Uzun vadeli**
- [ ] Hesap + cihazlar arası senkronizasyon (şu an her şey localStorage'da — cihaz değişince yedek dosyası şart)
- [ ] Capacitor ile App Store / Play Store paketleme
