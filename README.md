# Bugün Ne İzlesem / Ne Oynasam?

Karar vermekte zorlananlar için tek seferde tek bir güçlü öneri sunan; modern karanlık temalı (dark mode), cam efektli (glassmorphism) ve Tinder tarzı kart kaydırma mantığına sahip web uygulaması.

**Canlı Demo (GitHub Pages):** https://onurvatansever.github.io/bugun-ne-izlesem/

## Özellikler

- **3 Kategori Sekmesi:** Oyun (`CheapShark API`), Dizi (`TVMaze API`) ve Anime (`Jikan API v4`) — API anahtarı gerektirmez.
- **Hızlı Filtreler:**
  - `Sadece Yüksek Puanlılar (80+ / 8.0+)`
  - Oyun sekmesine özel `Sadece 10$ Altı İndirimler`
- **Tinder Tarzı Keşif Deneyimi:**
  - Butonlar, fare/dokunmatik sürükleme veya klavye kısayolları (`←` Pas Geç, `→` Kaydet).
  - Görülmemiş önerilerden rastgele seçim ve havuz sıfırlama.
  - Doğrudan Steam, TVMaze/Resmi Site veya MyAnimeList sayfasına açılan **Detaya Git** bağlantısı.
- **Kalıcı Listem Çekmecesi:** Kaydedilen öğeler tarayıcıda (`localStorage`) saklanır, kategoriye göre filtrelenebilir ve silinebilir.
- **Hata Yönetimi:** API yanıt vermezse Türkçe uyarı ekranı ve **Tekrar Dene** butonu.

## Yerel Çalıştırma ve Testler

Herhangi bir kurulum veya derleme adımı gerektirmez; `index.html` dosyasını doğrudan tarayıcınızda açabilirsiniz.

Otomatik birim testlerini çalıştırmak için (Node.js 18+):

```bash
node --test tests/core.test.mjs
```
