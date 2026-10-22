# MorseForge — PROJECT.md

> **Learn Morse. Build the Signal.**
>
> Eğlenceli, görsel, sesli ve oyunlaştırılmış bir Morse Code öğrenme/pratik platformu.

---

# 1. Proje Özeti

**MorseForge**, kullanıcıların Morse alfabesini sıfırdan öğrenmesini, ezberlemesini ve gerçek zamanlı olarak pratik yapmasını sağlayan modern bir web uygulamasıdır.

Uygulama:

* Morse alfabesini harf harf öğretir.
* Ağaç tabanlı ilerleme sistemi kullanır.
* Morse Tree üzerinden karakterlerin mantığını görselleştirir.
* Sesli Morse üretir.
* Kullanıcının Morse'u ses üzerinden çözmesini sağlar.
* Klavye ile Morse gönderilmesine izin verir.
* Short press / long press mantığını destekler.
* Space tuşunu gerçek Morse keyer gibi kullanabilir.
* Kullanıcının kendi tuşlarını atamasına izin verir.
* LocalStorage üzerinde kullanıcı ilerlemesini saklar.
* İnternet bağlantısı olmadan çalışabilecek şekilde PWA olarak tasarlanabilir.
* Mini oyunlar ve challenge sistemleri içerir.
* Kullanıcı ilerledikçe görsel bir elektrik devresi / sinyal ağı aktif hale gelir.

Ana hedef:

> Morse öğrenmeyi ezber çalışmasından çıkarıp küçük bir oyuna dönüştürmek.

---

# 2. Temel Ürün Fikri

Uygulamanın ana ekranında kullanıcı bir **Signal Tree** görür.

Ağaç klasik bir eğitim ağacı gibi değil, elektrik/sinyal devresi gibi görünür.

Örnek:

```text
                    SIGNAL CORE
                         │
                       [ T ]
                      /   \
                    [N]   [M]
                   /  \   /  \
                 [A] [K][G] [O]
                /  \          \
              [R]  [W]        [Q]
```

Ancak görsel olarak:

* Kablolar
* LED'ler
* Elektrik düğümleri
* Röleler
* Sinyal akışları
* Yanıp sönen lambalar
* Morse pulse animasyonları

kullanılır.

Bir karakter öğrenildiğinde o node aktif hale gelir.

Örneğin kullanıcı `E` öğrenince:

```text
●────── E
```

`T` öğrenince:

```text
●────── E
│
└────── T
```

`I` öğrenince:

```text
       ┌── E
       │
CORE ──┤
       │
       └── T

E ── I
```

İlerledikçe sistem tamamen aydınlanır.

---

# 3. Morse Tree

Morse Tree uygulamanın en önemli öğrenme sistemidir.

Morse kodunun binary tree mantığından yararlanılır.

Temel:

```text
              START
             /     \
           DOT     DASH
            E       T
           / \     / \
          I   A   N   M
         / \ / \ / \ / \
        S U R W D K G O
```

Kullanıcı ağacı görerek Morse karakterlerinin ilişkisini öğrenebilir.

Örneğin:

```text
A = .-
```

ağaç üzerinde:

```text
START
  ↓
DOT
  ↓
DASH
  ↓
A
```

olarak gösterilir.

---

# 4. Öğrenme Sistemi

Tek bir öğrenme yöntemi kullanılmamalıdır.

Birden fazla öğrenme yöntemi bulunmalıdır.

## 4.1 Guided Learning

Başlangıç modu.

Sistem karakterleri sırayla öğretir.

Örnek:

### Stage 1

```text
E = .
T = -
```

### Stage 2

```text
I = ..
A = .-
N = -.
M = --
```

### Stage 3

```text
S = ...
U = ..-
R = .-.
W = .--
D = -..
K = -.-
G = --.
O = ---
```

Bu sistem kullanıcının önce basit karakterleri öğrenmesini sağlar.

---

# 5. Character Mastery

Her karakterin mastery seviyesi olmalıdır.

Örneğin:

```text
E

Recognition: 94%
Sending:     82%
Listening:   76%

Mastery:     84%
```

Seviyeler:

```text
0 - Unknown
1 - Seen
2 - Learning
3 - Familiar
4 - Strong
5 - Mastered
```

Bir karakter ancak yeterli başarı elde edildiğinde "Mastered" olur.

---

# 6. Spaced Repetition

Uygulamada spaced repetition bulunmalıdır.

Kullanıcı bir karakteri sürekli doğru yapıyorsa daha seyrek gösterilir.

Yanlış yaptığı karakterler tekrar daha sık gelir.

Örneğin:

```text
A  → 2 gün
E  → 7 gün
T  → 5 gün
K  → 30 dakika
G  → şimdi
```

Bu sistem localStorage üzerinde tutulmalıdır.

---

# 7. Listening Mode

Kullanıcı Morse kodunu görmez.

Sadece sesi duyar.

Örneğin:

```text
🔊  • • •
```

kullanıcı:

```text
S
```

cevabını verir.

Zorluk seviyeleri:

### Beginner

Yavaş:

```text
8 WPM
```

### Normal

```text
15 WPM
```

### Advanced

```text
25 WPM
```

### Expert

```text
35+ WPM
```

Kullanıcı:

* WPM
* Farnsworth spacing
* Frequency
* Volume

ayarlarını değiştirebilmelidir.

---

# 8. Sound Engine

Web Audio API kullanılmalıdır.

Morse sesi gerçek bir CW tone gibi üretilmelidir.

Varsayılan:

```text
Frequency: 600 Hz
Volume: 0.15
```

Kullanıcı değiştirebilir.

Örneğin:

```text
400 Hz
500 Hz
600 Hz
700 Hz
800 Hz
```

Ses:

```text
DOT  = 1 unit
DASH = 3 units
gap  = 1 unit
character gap = 3 units
word gap = 7 units
```

WPM üzerinden timing hesaplanmalıdır.

---

# 9. Morse Key / Telegraph Mode

Uygulamanın en eğlenceli özelliklerinden biri.

Kullanıcı bilgisayar klavyesini Morse key olarak kullanabilir.

Varsayılan:

```text
SPACE = Morse Key
```

Basılı tutma süresine göre:

```text
short press → DOT
long press  → DASH
```

Örneğin:

```text
Space 120ms → .
Space 350ms → -
```

Threshold ayarlanabilir:

```text
DOT/DASH threshold:
250ms
```

---

# 10. Keyboard Mapping

Kullanıcı kendi tuşlarını seçebilmelidir.

Örneğin:

```text
Morse Key     SPACE
Alternative   ENTER
Cancel        ESC
Submit        CTRL
```

İleri seviye:

```text
Left Mouse Button → Morse Key
Right Mouse Button → Alternative
Gamepad Button → Morse Key
```

Mümkün olduğu platformlarda desteklenmelidir.

---

# 11. Manual Morse Input

Kullanıcı doğrudan:

```text
.-
```

yazabilir.

Sistem:

```text
.- → A
```

şeklinde çözmelidir.

Tersine:

```text
A → .-
```

de yapılabilmelidir.

---

# 12. Free Practice

Kullanıcı istediği karakterlerle özgürce çalışabilir.

Örnek:

```text
Practice

[ A E I M N O S T ]

WPM: 15

[ START ]
```

Sistem rastgele karakterler üretir.

---

# 13. Word Practice

Tek karakterden kelimelere geçilir.

Örneğin:

```text
SOS
TEST
MORSE
RADIO
SIGNAL
HELLO
CQ
```

Daha ileri seviyede:

```text
HELLO WORLD
CQ CQ CQ
DE TA
```

---

# 14. Real-Time Decoder

Kullanıcı Morse key'e basarken sistem gerçek zamanlı olarak karakteri göstermelidir.

Örneğin:

```text
Input:

• • •   - - -   • • •

Decoded:

S       O       S
```

Typing hissi mümkün olduğunca düşük latency ile çalışmalıdır.

---

# 15. Signal Visualization

Morse gönderilirken ekranda elektrik/sinyal animasyonu gösterilmelidir.

DOT:

```text
⚡━━━━⚡
```

DASH:

```text
⚡━━━━━━━━━━━━⚡
```

Gerçek UI'da:

* neon pulse
* elektrik akışı
* LED flash
* waveform
* glow
* signal particles

kullanılabilir.

Ama animasyonlar performanslı olmalıdır.

---

# 16. Signal Tree Gamification

Kullanıcı ilerledikçe ağacın bölümleri aktif olur.

Örneğin:

```text
LOCKED
   ↓
DISCOVERED
   ↓
ACTIVE
   ↓
MASTERED
```

Mastered node:

```text
●━━━●━━━●
     ✦
```

şeklinde ışıldayabilir.

Her mastered karakter ağacın enerji sistemine bağlanır.

---

# 17. Electrical Circuit Mode

Ağacın tamamlanması küçük bir elektrik devresinin tamamlanması gibi hissettirilmelidir.

Başlangıç:

```text
🔴 Power OFF
```

İlerleme:

```text
🟡 Power 37%
```

Tamamlanma:

```text
🟢 SIGNAL NETWORK ONLINE
```

Kullanıcı bütün Morse alfabesini tamamladığında:

```text
████████████████

SIGNAL NETWORK
ONLINE

26 / 26 CHARACTERS

⚡ 100% POWER
```

gibi bir final ekranı gösterilebilir.

---

# 18. Mini Games

## Game 1 — Decode Rush

30 saniye içerisinde mümkün olduğunca fazla Morse çöz.

```text
TIME: 00:27

•• -
```

Cevap:

```text
A
```

---

## Game 2 — Signal Defender

Ekrana Morse şeklinde gelen sinyalleri çöz.

Doğru cevap:

```text
+ SCORE
```

Yanlış:

```text
- LIFE
```

---

## Game 3 — Morse Runner

Karakterler ekrandan akar.

Kullanıcı doğru Morse'u göndererek karakterleri yok eder.

---

## Game 4 — Lightning Round

5 saniyede karakteri tanı.

---

## Game 5 — Listen & Type

Sadece ses verilir.

Kullanıcı cevabı yazar.

---

# 19. Daily Challenge

Her gün bir challenge.

Örneğin:

```text
🔥 DAILY SIGNAL

Decode 30 characters

Target:
90% accuracy

Reward:
+250 XP
```

Günlük streak:

```text
🔥 7 DAY STREAK
```

---

# 20. Statistics

Dashboard:

```text
MORSEFORGE

🔥 12 DAY STREAK

Characters
26 / 26

Mastery
74%

Best WPM
21

Accuracy
91%

Listening
83%

Sending
76%
```

Ek istatistikler:

* Total sessions
* Total characters
* Total dots
* Total dashes
* Total mistakes
* Best WPM
* Average WPM
* Accuracy
* Listening accuracy
* Sending accuracy
* Daily streak
* Session duration

---

# 21. LocalStorage

İlk versiyonda backend/database kullanılmayacaktır.

Tüm kullanıcı verileri:

```text
localStorage
```

üzerinde tutulacaktır.

Önerilen yapı:

```javascript
morseforge_user
morseforge_progress
morseforge_settings
morseforge_statistics
morseforge_sessions
morseforge_daily_challenge
```

Örnek:

```json
{
  "version": 1,
  "characters": {
    "E": {
      "mastery": 5,
      "accuracy": 0.96,
      "attempts": 120,
      "correct": 115
    }
  }
}
```

---

# 22. Export / Import

Kullanıcı ilerlemesini kaybetmemelidir.

Settings:

```text
Export Progress
Import Progress
Reset Progress
```

Export:

```text
morseforge-progress.json
```

şeklinde indirilebilir.

Import ile tekrar yüklenebilir.

Bu sayede backend olmadan kullanıcı verisi taşınabilir.

---

# 23. PWA

Uygulama mümkünse PWA olarak hazırlanmalıdır.

Requirements:

* manifest.json
* service worker
* offline cache
* installable
* mobile responsive

Kullanıcı:

```text
Add to Home Screen
```

yapabilmelidir.

---

# 24. Responsive Design

Desktop-first tasarım yapılabilir ancak mobile destek zorunludur.

Desktop:

```text
┌───────────────────────────────────────────────┐
│ MORSEFORGE                    🔥 12   ⚡ 74% │
├───────────────┬───────────────────────────────┤
│               │                               │
│ SIGNAL TREE   │       PRACTICE AREA           │
│               │                               │
│      ●        │            • -                │
│     / \       │                               │
│    ●   ●      │             A                 │
│               │                               │
└───────────────┴───────────────────────────────┘
```

Mobil:

```text
TREE

      ●
     / \
    ●   ●

────────────

PRACTICE

   • -

    A

[ HOLD SPACE ]
```

---

# 25. UI / UX

Tasarım sıradan bir eğitim uygulaması gibi olmamalıdır.

Estetik:

```text
Cyberpunk
+
Retro Telegraph
+
Electrical Engineering
+
Modern SaaS
```

Kullanılabilecek görsel öğeler:

* CRT glow
* grid background
* circuit traces
* LED indicators
* waveform
* terminal-like labels
* signal pulses
* subtle scanlines
* animated connections

Ancak aşırı cyberpunk kullanılmamalıdır.

Ana hedef:

> Premium + technical + playful.

---

# 26. Color System

Önerilen tema:

```text
Background:
#080B10

Panel:
#10151D

Primary:
Electric Green

Secondary:
Amber

Signal:
Cyan

Danger:
Red
```

Dark mode ana mod olmalıdır.

İleride light mode eklenebilir.

---

# 27. Sound UX

Ses uygulamanın opsiyonel değil, temel parçalarından biri olmalıdır.

Global:

```text
🔊 Sound ON/OFF
```

Ayrıca:

```text
CW Frequency
Volume
Key Sound
UI Sound
Success Sound
Error Sound
```

ayarlanabilmelidir.

---

# 28. Accessibility

Keyboard-only kullanım desteklenmelidir.

Özellikle Morse pratiğinde mouse kullanmak zorunlu olmamalıdır.

Destek:

* keyboard navigation
* focus states
* reduced motion
* sound controls
* screen reader friendly labels
* sufficient contrast

---

# 29. Architecture

İlk versiyon mümkün olduğunca basit tutulmalıdır.

Önerilen:

```text
Frontend
    ↓
React / TypeScript
    ↓
Vite
    ↓
Web Audio API
    ↓
LocalStorage
```

Backend:

```text
NONE
```

İlk versiyonda backend gereksizdir.

CloudPanel üzerinde static deployment yapılabilir.

Alternatif olarak:

```text
Node.js
```

ile serve edilebilir.

---

# 30. Core Modules

Kod yapısı:

```text
src/

├── components/
│   ├── SignalTree/
│   ├── MorseKey/
│   ├── Practice/
│   ├── Listening/
│   ├── Dashboard/
│   ├── Stats/
│   ├── DailyChallenge/
│   └── Settings/
│
├── engine/
│   ├── morseDecoder.ts
│   ├── morseEncoder.ts
│   ├── timingEngine.ts
│   ├── audioEngine.ts
│   └── keyEngine.ts
│
├── data/
│   ├── morseAlphabet.ts
│   ├── tree.ts
│   └── challenges.ts
│
├── storage/
│   ├── localStorage.ts
│   ├── progress.ts
│   └── settings.ts
│
├── game/
│   ├── scoring.ts
│   ├── mastery.ts
│   ├── streak.ts
│   └── challenges.ts
│
└── app/
```

---

# 31. Morse Data

Tek kaynak olarak bir Morse mapping kullanılmalıdır.

Örnek:

```typescript
const MORSE = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--.."
};
```

Sayılar ve punctuation daha sonra eklenebilir.

---

# 32. Learning Order

İlk sürümde karakter sırası:

```text
E
T

I
A
N
M

S
U
R
W
D
K
G
O

H
V
F
Ü
L
Ä
P
J
B
X
C
Y
Z
Q
```

Not:

Morse ağacının mantığı korunmalı fakat pedagojik öğrenme sırası ayrıca optimize edilebilir.

İlk sürümde İngilizce A-Z karakterleri ana hedef olmalıdır.

---

# 33. WPM Engine

WPM hesaplaması standart PARIS yaklaşımına göre yapılmalıdır.

Örneğin:

```text
1 WPM
=
50 units / minute
```

Timing engine:

```typescript
dotDuration = 1200 / WPM
dashDuration = dotDuration * 3
```

Farnsworth timing ayrıca uygulanmalıdır.

---

# 34. Scoring

Her challenge aşağıdaki faktörleri dikkate alabilir:

```text
Accuracy
Speed
Consistency
Difficulty
Streak
```

Örnek:

```text
Base Score = 100

Accuracy multiplier
Speed multiplier
Difficulty multiplier
Streak multiplier
```

Ancak skor sistemi kullanıcıyı hız yerine doğruluğa zorlamamalıdır.

Öncelik:

```text
Accuracy > Recognition > Speed
```

---

# 35. Viral Growth Strategy

Uygulamanın viral olabilmesi için sadece "Morse öğrenme sitesi" olması yeterli değildir.

Paylaşılabilir sonuçlar oluşturulmalıdır.

Örneğin:

```text
⚡ MORSEFORGE RESULT

I reached:

23 WPM

Accuracy:
96%

Characters:
26 / 26

🔥 9 Day Streak

Can you beat me?
```

Paylaş butonu:

```text
Share Result
```

X / Twitter için otomatik paylaşılabilir metin oluşturulmalıdır.

---

# 36. Shareable Challenge

Kullanıcı:

```text
Challenge a friend
```

diyebilir.

Örneğin:

```text
I decoded 37 Morse signals in 60 seconds.

Can you beat me?

⚡ MorseForge
```

Link:

```text
/mode/challenge/ABC123
```

İlk sürümde backend olmadan challenge ID sadece challenge parametrelerini encode edebilir.

Örneğin:

```text
/challenge?time=60&wpm=20&count=40
```

---

# 37. Viral Loop

Temel loop:

```text
Learn
 ↓
Practice
 ↓
Score
 ↓
Beat Personal Best
 ↓
Generate Result Card
 ↓
Share
 ↓
Friend Opens
 ↓
Challenge
 ↓
New User
```

Bu loop ürünün growth motoru olarak düşünülmelidir.

---

# 38. Viral Score Model

Uygulamanın viral potansiyelini 100 üzerinden değerlendirmek için aşağıdaki model kullanılabilir.

```text
Viral Potential =
Shareability      × 25
Challenge Factor  × 20
Novelty            × 15
Visual Appeal      × 15
Learning Utility   × 10
Social Competition × 10
Low Friction       × 5
```

Mevcut fikir için tahmini:

| Faktör             | Skor |
| ------------------ | ---: |
| Shareability       | 8/10 |
| Challenge          | 9/10 |
| Novelty            | 8/10 |
| Visual Appeal      | 9/10 |
| Learning Utility   | 9/10 |
| Social Competition | 7/10 |
| Low Friction       | 9/10 |

Ağırlıklı sonuç:

```text
VIRAL POTENTIAL

84 / 100
```

---

# 39. Viral Potansiyeli 90+ Yapacak Özellikler

## 1. Daily World Ranking

```text
GLOBAL SIGNAL BOARD

#1  42 WPM
#2  39 WPM
#3  37 WPM
```

Leaderboard kullanıcıyı tekrar getirir.

---

## 2. Shareable Score Card

Her challenge sonrası görsel:

```text
┌──────────────────────────────┐
│         MORSEFORGE           │
│                              │
│           27 WPM             │
│                              │
│        ████████████          │
│          96% ACC             │
│                              │
│      26 / 26 MASTERED        │
│                              │
│      ⚡ CAN YOU BEAT ME?     │
└──────────────────────────────┘
```

Bu özellikle X/Twitter için çok değerli olur.

---

## 3. "Can You Decode This?"

Ana sayfada tek bir viral widget:

```text
Can you decode this?

••• --- •••
```

Input:

```text
[____________]
```

Sonuç:

```text
SOS
```

ve:

```text
Your time:
1.42 sec
```

Bu özellik uygulamanın landing page'inde doğrudan kullanılmalıdır.

---

## 4. One-Minute Challenge

Ana CTA:

```text
⚡ 60 SECOND MORSE CHALLENGE
```

Kullanıcı siteye girer.

Login yok.

Signup yok.

Direkt oyun.

Bu friction'ı ciddi şekilde azaltır.

---

# 40. Monetization

İlk aşamada monetization zorunlu değildir.

Ürün önce kullanıcı toplamalıdır.

İleride:

### Free

* Morse alphabet
* Tree
* Basic practice
* Listening
* Daily challenge

### Pro

* Advanced statistics
* Custom training
* Unlimited challenges
* Advanced WPM
* Personal training plan
* Historical analytics
* Advanced sound controls

Ama:

> Temel öğrenme deneyimi ücretsiz kalmalıdır.

---

# 41. Analytics

İlk sürümde kullanıcı hesabı olmadan anonim analytics kullanılabilir.

Takip edilebilecek eventler:

```text
app_open
lesson_started
lesson_completed
character_mastered
practice_started
practice_completed
challenge_started
challenge_completed
result_shared
audio_enabled
key_used
tree_opened
```

Privacy-friendly analytics tercih edilmelidir.

Uygulama (TASK-039): **onaylı (consent-based) analytics**.

* Google Analytics 4 yalnızca ziyaretçi onay bandında "Accept" dedikten sonra yüklenir (Consent Mode v2, varsayılan red; reklam sinyalleri hiç açılmaz). Onaydan önce Google'a istek gitmez, `_ga` çerezi oluşmaz.
* Global Privacy Control veya Do Not Track, soru sorulmadan "red" sayılır; tercih Ayarlar → Data'dan değiştirilebilir. Geri alma çerezleri de siler.
* `/message/` sayfasında GA ve bant hiç yoktur (mesaj URL fragment'ında).
* Cloudflare Web Analytics (çerezsiz) ve `/e/` sayacı onaydan bağımsız olarak aynen kalır; sayacın kendi anahtarı vardır.

---

# 42. Privacy

Kullanıcı ilerlemesi default olarak:

```text
LOCAL ONLY
```

olmalıdır.

Açıkça belirtilmeli:

> Your progress is stored locally on your device.

Kullanıcı hesabı olmadan kullanılabilmelidir.

Çerez yalnızca kullanıcı Google Analytics'e onay verirse kurulur (§41). Onay kaydı (`morseforge_consent`) yedeğe girmez ve "Erase everything" onu silmez.

---

# 43. SEO

Landing page SEO hedefleri:

```text
learn morse code
morse code translator
morse code practice
morse code trainer
learn morse code online
morse code alphabet
morse code audio
morse code practice test
```

Ancak site yalnızca SEO sayfası gibi görünmemelidir.

Ana hedef:

```text
PLAY
```

olmalıdır.

---

# 44. Landing Page

Hero:

```text
LEARN MORSE.
BUILD THE SIGNAL.

Turn Morse Code into a game.

[ START TRAINING ]

[ TRY 60s CHALLENGE ]
```

Altında canlı demo:

```text
••• --- •••

[ DECODE ]
```

Sonra:

```text
Learn
Practice
Listen
Send
Master
Compete
```

---

# 45. Onboarding

İlk açılış:

```text
Welcome to MorseForge.

How do you want to learn?

[ I'M NEW TO MORSE ]

[ I KNOW THE BASICS ]

[ I'M HERE TO PRACTICE ]
```

Yeni kullanıcı:

```text
STEP 1

E = .

Tap / hold the key.

[ HOLD SPACE ]
```

Sonra:

```text
T = -

[ HOLD SPACE ]
```

Sonra:

```text
E + T

Can you decode?

.- 
```

Böylece kullanıcı daha ilk 30 saniyede Morse göndermeye başlamalıdır.

---

# 46. UX Principle

Uygulama kullanıcıya uzun açıklamalar okumamalıdır.

Öğret:

```text
SHOW
→
TRY
→
FAIL
→
TRY AGAIN
→
MASTER
```

Metin yerine etkileşim önceliklidir.

---

# 47. Sound-first Learning

Morse öğrenirken kullanıcı yalnızca:

```text
.-
```

görmemeli.

Bunun yanında:

```text
🔊 beep-beep
```

duymalıdır.

İdeal öğrenme:

```text
Visual
+
Audio
+
Motor Memory
```

üçünü birlikte kullanmalıdır.

---

# 48. Motor Memory

Kullanıcı karakteri sadece görmemeli.

Örneğin:

```text
A = .-
```

öğrenirken:

```text
short
long
```

basmalıdır.

Bu nedenle:

```text
SEE
HEAR
SEND
RECOGNIZE
```

dört aşamalı mastery sistemi kullanılmalıdır.

---

# 49. Achievement System

Başarımlar:

```text
⚡ FIRST SIGNAL
İlk Morse sinyalini gönderdin.

🔌 CIRCUIT STARTED
İlk 5 karakteri öğrendin.

💡 LIGHTBULB
İlk karakterini Mastered yaptın.

📡 RADIO OPERATOR
10 WPM'e ulaştın.

⚡ SPEED DEMON
25 WPM'e ulaştın.

🔥 SIGNAL MASTER
Tüm karakterleri Mastered yaptın.

🛰️ CQ CQ CQ
İlk gerçek Morse mesajını gönderdin.
```

---

# 50. Easter Eggs

Eğlence için gizli özellikler:

```text
SOS
CQ
73
88
```

gibi gerçek Morse/radyo kültürü öğeleri bulunabilir.

Kullanıcı:

```text
... --- ...
```

girdiğinde özel animasyon çıkabilir.

---

# 51. Future Features

İlk sürümden sonra:

```text
[ ] User accounts
[ ] Cloud sync
[ ] Global leaderboard
[ ] Friend challenges
[ ] Multiplayer
[ ] Bluetooth Morse key
[ ] USB Morse key
[ ] Microphone mode
[ ] Morse audio recognition
[ ] AI generated practice
[ ] Custom word lists
[ ] Radio callsign mode
[ ] Ham Radio training
[ ] Discord integration
[ ] X/Twitter sharing
```

Özellikle:

### Microphone Mode

Kullanıcı gerçek bir Morse key bağlayıp mikrofondan ses alabilir.

```text
REAL KEY
   ↓
MIC
   ↓
AUDIO ANALYSIS
   ↓
MORSE DECODER
```

Bu özellik ileride ürünün en güçlü farklılaştırıcılarından biri olabilir.

---

# 52. MVP

İlk sürüm gereksiz büyütülmemelidir.

MVP:

```text
✓ Morse alphabet
✓ Morse Tree
✓ Character learning
✓ Guided lessons
✓ Morse encoder
✓ Morse decoder
✓ Web Audio
✓ Listening mode
✓ Keyboard Morse key
✓ Short / Long press
✓ WPM
✓ Free practice
✓ LocalStorage
✓ Statistics
✓ Streak
✓ Daily challenge
✓ Dark premium UI
✓ PWA
```

İlk sürümde:

```text
✗ Accounts
✗ Backend
✗ Multiplayer
✗ Payments
✗ AI
```

olmamalıdır.

---

# 53. Development Phases

## Phase 1 — Core

```text
Morse mapping
Encoder
Decoder
Timing engine
Audio engine
Keyboard key
```

## Phase 2 — Learning

```text
Signal Tree
Guided lessons
Mastery
Progress
```

## Phase 3 — Practice

```text
Free Practice
Listening
Word Practice
Speed Training
```

## Phase 4 — Gamification

```text
XP
Streak
Achievements
Daily Challenge
Score
```

## Phase 5 — Viral

```text
Challenge
Share Card
60 Second Challenge
Leaderboard architecture
```

## Phase 6 — PWA

```text
Offline
Install
Mobile optimization
```

---

# 54. Definition of Done

MVP tamamlandığında kullanıcı:

1. Siteye girmeli.
2. Hesap açmadan başlayabilmeli.
3. Morse Tree'yi görebilmeli.
4. E ve T'yi öğrenebilmeli.
5. Space tuşuyla Morse gönderebilmeli.
6. DOT/DASH ayrımını otomatik algılayabilmeli.
7. Ses duyabilmeli.
8. Morse'u karaktere çevirebilmeli.
9. Listening challenge oynayabilmeli.
10. İlerlemesini localStorage'a kaydedebilmeli.
11. Günlük challenge oynayabilmeli.
12. Sonucunu paylaşabilmeli.

---

# 55. Product North Star

MorseForge'un temel hedefi:

> "Morse öğrenmek için 10 dakika gireyim" deyip 45 dakika sonra hâlâ challenge oynayan kullanıcı oluşturmak.

Ürün:

```text
Educational Tool
        ↓
Practice App
        ↓
Game
        ↓
Competition
        ↓
Community
```

evrilmelidir.

---

# 56. Final Product Identity

## Name

**MorseForge**

## Tagline

**Learn Morse. Build the Signal.**

## Core metaphor

**Morse Code → Electrical Signal Network**

## Core mechanic

**Learn → Send → Hear → Decode → Master**

## Viral mechanic

**60 Second Morse Challenge**

## Visual identity

**Retro Telegraph × Electrical Engineering × Modern Cyber UI**

## Storage

**LocalStorage first**

## Deployment

**CloudPanel + PWA**

## Initial viral potential

**84 / 100**

With:

* leaderboard
* challenge links
* beautiful share cards
* 60-second challenge
* daily challenge
* one-click play

potential viral score:

**91–94 / 100**

---

# 57. Most Important UX Rule

MorseForge açıldığında kullanıcıya:

> "Morse nedir?"

diye 4 paragraf açıklama gösterme.

Şunu göster:

```text
YOUR FIRST SIGNAL

E = .

Press SPACE

[       SPACE       ]
```

Kullanıcı ilk sinyalini gönderdiği anda:

```text
⚡ SIGNAL DETECTED

E

+10 XP
```

görsün.

**MorseForge'un büyüme noktası öğrenmek değil, sinyal göndermenin eğlenceli olmasıdır.**

