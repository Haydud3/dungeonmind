# DungeonMind 🐉⚔️

**An immersive, browser-based 3D & 2D Virtual Tabletop (VTT), miniature studio, and campaign hub for Dungeons & Dragons 5e.**

[![Play Now](https://img.shields.io/badge/Play_Now-Browser_VTT-emerald?style=for-the-badge&logo=google-chrome&logoColor=white)](https://haydud3.github.io/dungeonmind/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VTT](https://img.shields.io/badge/VTT-3D%20%26%202D%20Tactical-blue)](https://haydud3.github.io/dungeonmind/)
[![Stack](https://img.shields.io/badge/Stack-React%2018%20%7C%20Three.js%20%7C%20Vite-61dafb)](https://github.com/Haydud3/dungeonmind)
[![Multiplayer](https://img.shields.io/badge/Multiplayer-Realtime%20Firebase-ffca28)](https://firebase.google.com/)
[![Status](https://img.shields.io/badge/Status-Beta-brightgreen)](https://github.com/Haydud3/dungeonmind)

---

## 🧭 Overview

**DungeonMind** is a modern, 100% free Virtual Tabletop designed to make running tabletop RPG sessions fluid, visually stunning, and effortless. It combines WebGL 3D tactical battlemaps, Hero Forge-compatible 3D miniature rendering, dynamic lighting, real-time fog of war, and interactive D&D 5e character sheets into a seamless web app.

**No downloads. No subscription paywalls. No port-forwarding.** Just create a campaign, share a 6-character room code, and play together instantly on PC, Mac, tablet, or mobile.

---

## 🌟 Key Features

### 🎲 1. Immersive 3D & 2D Tactical Battlemaps
* **Perspective Switching:** Seamlessly toggle between a classic 2D top-down grid and a cinematic 3D isometric view at any moment.
* **Bring Any 2D Map to Life:** Drop in any battlemap image (from D&D Beyond, Roll20, or community cartographers) and immediately explore it with 3D elevation and camera controls.
* **Real-Time Dynamic Lighting:** Place torches, lanterns, and magical light sources that cast real-time shadows and illuminate dark dungeons.
* **Dynamic Fog of War & Line of Sight:** GPU-accelerated token vision accurately occludes unexplored rooms and respects walls, closed doors, and windows.
* **Tactical Measurement & Grid Tools:** Distance rulers, cell snapping, elevation adjustments, and status markers give you total tactical precision during encounters.

### 🗿 2. 3D Miniature Studio & Hero Forge Support
* **Custom 3D Miniature Uploads:** Full support for custom `.glb` and `.gltf` 3D miniature files. Bring your personal [Hero Forge](https://www.heroforge.com/) digital downloads, Titancraft minis, or custom Blender models directly onto the battlefield.
* **Interactive 3D Previewer:** Inspect and manipulate models with real-time 360° rotation, camera panning, elevation offsets, and scale sliders before deploying them.
* **Curated Mini Compendium:** Instant access to an integrated library of 3D monster, hero, and NPC models.
* **In-Map Token Customizer:** Right-click any token on the tactical grid to swap or tweak its 3D miniature on the fly.

### 📜 3. Complete D&D 5e Character Sheets
* **Interactive Digital Sheets:** Fully functional 5e character sheets covering ability scores, skills, hit points, spell slots, inventory, and class features.
* **One-Click D&D Beyond Importer:** Import character sheets from D&D Beyond in seconds with built-in multi-proxy fallbacks and direct JSON paste support.
* **Integrated 3D Dice Tray:** Click any skill, attack, saving throw, or spell to roll interactive 3D physics-based dice that sync instantly across everyone's chat log.

### ⚔️ 4. Real-Time Campaign & Combat Management
* **Zero-Setup Multiplayer:** Built on real-time database sync—no dedicated server hosting, port-forwarding, or account requirements for players.
* **Initiative Ribbon & Combat Tracker:** Manage encounters with automated initiative sorting, active turn indicators, real-time HP bars, and status effects.
* **Campaign Journals & Handouts:** Write lore in a rich-text editor and push visual handouts and notes directly to players' screens.
* **In-Person & Mobile Friendly:** Players sitting at a physical table can easily use DungeonMind on their smartphones or tablets as a companion character sheet and dice roller.

### 🪄 5. Smart Assistant Utilities *(Optional)*
* Optional GM assistance tools to speed up prep: generate NPC backstories, draft session recaps, or auto-detect walls on battlemap images when desired. Easily powered by free Puter.js or your own OpenAI/Gemini API keys.

---

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| **Frontend Framework** | [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) |
| **3D Rendering** | [Three.js](https://threejs.org/) + [React Three Fiber (@react-three/fiber)](https://github.com/pmndrs/react-three-fiber) + [Drei](https://github.com/pmndrs/drei) |
| **Realtime Sync & Storage** | [Firebase](https://firebase.google.com/) (Cloud Firestore & Anonymous Auth) |
| **Styling & UI** | [Tailwind CSS](https://tailwindcss.com/) + [Lucide Icons](https://lucide.dev/) |
| **Rich Text Editor** | [React Quill](https://github.com/zenoamaro/react-quill) |

---

## 🚀 Getting Started

### Play Online (No Installation Needed)
Launch directly from your browser:
👉 **[https://haydud3.github.io/dungeonmind/](https://haydud3.github.io/dungeonmind/)**

1. **For Dungeon Masters:** Click **"Start New Campaign"**, set your campaign name, and share the 6-character room code with your players.
2. **For Players:** Enter the room code on the lobby screen, hit **"Join"**, and create or import your character.

---

### Local Development Setup

If you want to contribute or run DungeonMind locally:

#### 1. Clone the repository
```bash
git clone https://github.com/Haydud3/dungeonmind.git
cd dungeonmind
```

#### 2. Install dependencies
```bash
npm install
```

#### 3. Run the development server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

#### 4. Build for production
```bash
npm run build
```

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome!

1. Fork the project
2. Create your feature branch (`git checkout -b feature/NewFeature`)
3. Commit your changes (`git commit -m 'Add NewFeature'`)
4. Push to the branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.