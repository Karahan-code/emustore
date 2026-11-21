
<p align="center">
  <img src="public/icon.png" width="140" alt="EmuStore Logo" border-radious="50px">
</p>
<h2 align="center">Ɛmustore</h2>

<h3 align="center">A Homebrew Emulator Game Store for PlayStation 5</h3>

<p align="center">
  A modern, console-focused homebrew store experience for jailbroken PS5 systems.
</p>

<p align="center">
  <a href="https://github.com/Karahan-code/emustore/releases">
    <img src="https://img.shields.io/github/v/release/Karahan-code/emustore?style=for-the-badge&label=Latest%20Release" alt="Latest Release">
  </a>
  <a href="https://github.com/Karahan-code/emustore/stargazers">
    <img src="https://img.shields.io/github/stars/Karahan-code/emustore?style=for-the-badge" alt="Stars">
  </a> <br>
  <a href="https://github.com/Karahan-code/emustore/releases">
    <img src="https://img.shields.io/github/downloads/Karahan-code/emustore/total?style=for-the-badge" alt="Downloads">
  </a>
  <img src="https://img.shields.io/github/license/Karahan-code/emustore?style=for-the-badge" alt="License">
</p>

---

## 📸 Preview (Alpha Footage)

<p align="center">
  <sub><em>⚠️ Early alpha footage (v0.1.0) — UI, artwork, and features are subject to change.</em></sub>
</p>
<p align="center">
  <img src="public/alphaimg/1.png" alt="EmuStore Alpha Footage - Library View" width="100%" />
</p>
<p align="center">
  <img src="public/alphaimg/2.png" alt="EmuStore Alpha Footage - Library View" width="100%" />
</p>
<p align="center">
  <img src="public/alphaimg/3.png" alt="EmuStore Alpha Footage - Library View" width="100%" />
</p>

## ✨ About

> 🚧 EmuStore is currently under active development.

**EmuStore** is a PlayStation 5 homebrew store project designed to provide a clean, fast and console-friendly way to discover and manage homebrew applications, emulators, tools and utilities.

The project is designed specifically around the experience of using a store directly on a PS5 rather than behaving like a conventional web dashboard.

### 🎯 Main Goals

- 🎮 Console-focused user interface
- 🏪 Homebrew application store
- 🕹️ Emulator discovery
- 🔎 Fast search and categorization
- 🎛️ Controller-friendly navigation

---


**Current development focus:**

- Store UI
- Home screen
- Emulator catalog
- Platform categories
- Application details
- Installation/update architecture

---

## 🖼️ Screenshots

> Screenshots will be added as the PS5 UI reaches the first public preview.

<p align="center">
</p>

<p align="center">
</p>

---


## 🎮 Supported Platforms

EmuStore can provide metadata and application support for projects targeting platforms such as:

- PlayStation
- Nintendo
- Sega
- Arcade
- Atari
- Other retro platforms


---

## 🧩 Features

### Store

- Featured applications
- Recently updated applications
- Categories
- Platform filtering
- Application search
- Application details

### Application Pages

Each application can provide:

- Application name
- Description
- Developer
- Version
- Compatibility
- Screenshots
- Changelog
- Installation status
- Update status
- Official project link

### Library

The library is designed to keep track of:

- Installed applications
- Favorites
- Available updates
- Application versions

---

## 📦 Installation

will be added

---

## 🔄 Updates

will be added

---

## 🛠️ Development

The repository currently contains the project's development UI and application architecture.

### Development environment

```bash
git clone https://github.com/Karahan-code/emustore.git

cd emustore

npm install

npm run dev
```

The development interface can then be accessed locally through the configured Next.js development server.

---

## 🗺️ Roadmap

### Phase 1 — Foundation

- [x] Project initialization
- [x] Initial UI
- [x] Development environment
- [x] EmuStore branding
- [x] Finalize design system

### Phase 2 — Store

- [x] Home screen
- [ ] Featured applications
- [x] Application cards
- [x] Search
- [x] Categories
- [x] Platform pages
- [x] Application detail pages

### Phase 3 — Library

- [ ] Installed applications
- [x] Favorites
- [ ] Version tracking
- [ ] Update detection
- [ ] Update interface

### Phase 4 — PS5 Integration

- [ ] Native PS5 client
- [ ] Controller navigation
- [ ] Package management
- [ ] Installation workflow
- [ ] Update workflow
- [ ] Repository integration

### Phase 5 — Public Release

- [ ] First public beta
- [ ] Documentation
- [ ] Stable release
- [ ] Community feedback
- [ ] Performance optimization

---

## 🔐 Legal & Content

EmuStore is intended as a platform for homebrew applications, emulators, tools and utilities.

EmuStore does **not** intend to distribute copyrighted commercial game ROMs, ISOs or other unauthorized copies of copyrighted content.

Users are responsible for ensuring that the software, game backups and other content they use comply with applicable laws and the rights of the respective copyright holders.

---

## 🤝 Contributing

Contributions, ideas and bug reports are welcome.

Before submitting a pull request:

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test your changes.
5. Submit a pull request.

For larger changes, please open an issue first to discuss the proposed implementation.

---

## 🐛 Issues

Found a bug or have a feature request?

Open an issue:

👉 [**EmuStore Issues**](https://github.com/Karahan-code/emustore/issues)

Please include:

- PS5 firmware/environment
- EmuStore version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Relevant logs or screenshots

---

## ⭐ Support the Project

If you find EmuStore useful, consider giving the project a ⭐ on GitHub.

It helps the project gain visibility and encourages further development.

<p align="center">
  <a href="https://github.com/Karahan-code/emustore">
    ⭐ Star EmuStore on GitHub
  </a>
</p>

---

## 📜 License

This project is licensed under the terms specified in the repository's license.

See [`LICENSE`](LICENSE) for details.

---

<p align="center">

**EmuStore**

*Homebrew. Emulation. One Store.*

</p>


<!-- 

Yapılacaklar:
1- Önyüz Blackbox, Overdrive'ın benzeri olacak.✅
2- Oyunların title, description, file size gibi bir sürü stringleri olacak. Bunlar apilerle mi yoksa el ile kendimiz mi yazacağız bilmiyorum.✅
3- Oyunların iconu kutu(cover) görseli olacak, kendi sayfasında birkaç farklı fotoğrafı
olacak.✅
4- Detaylı APİ, JSON string backend kurulacak.✅
5- Her konsol oyunlarının(iso,nsp...) nereye kurulacağını otomatik bulan sistem bulunacak.Ayarlardan bu dosya yolları değiştirilebilir olacak.✅
6-Anasayfada filtreleme seçenekleri olacak.✅
7-Dualsense navigasyona uygun olacak.✅
8-Klavye kullanımı ps5'in kendi klavyesini tetikleyecek.✅
9-Mail yoluyla (veya başka bir şekilde) iletilen hata raporlama seçeneği olacak.✅
10-İngilizce, Türkçe dil seçeneği olacak.✅

11- Dualsense (options) tuşu ile ayarlara gidilecek bunu da aşağıdaki kontrol bilgilendirmelerinde gösterilecek.✅
12-. Discover kısmına masaüstündeki (resimdeki) kısım eklenecek.✅
13- Header düzeltilecek icon isim sola geri kalanlar ortaya sağ kısım aynı kalacak.✅
14- Deneme oyunları ve linkleri eklenecek.
15- Ayarlar en alta uygulama güncelleme kısmı eklenecek. Backendde yeni sürüm çıkınca otomatik güncelleme bildirimi ve güncelleme özelliği getirilecek.(github releases takibi)✅
16- UI ses efectleri eklenecek.
17- oyun sayfası Available sources kısmı kaldırılacak 'add favorities' buttonun yanına indirme kısmı açılacak. En altta buna benzer adlı bir tek satırlı kısım olacak✅

18- topbar stiky kalacak aşağı gelince kayboluyor.
19- oyunların json dosyaları okunacak resimleri eklenecek.
-->