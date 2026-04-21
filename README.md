# DungeonMind 🐉🧠

**The Next-Generation, AI-Enhanced VTT for Dungeons & Dragons 5e.**

**Play Now on Web for Free:** [https://haydud3.github.io/dungeonmind/](https://haydud3.github.io/dungeonmind/)

DungeonMind is a real-time, fully synchronized Virtual Tabletop (VTT) and campaign dashboard built from the ground up to be the most accessible, feature-rich, and **completely free** alternative on the market. It seamlessly blends powerful, immersive 3D/2D tabletop features with cutting-edge AI assistants to handle the heavy lifting of running a campaign.

No subscriptions, no server hosting, no complicated port-forwarding, and no software to install. Just share a 6-character code and start playing in your browser.

![Status](https://img.shields.io/badge/Status-Beta-orange)
![Tech](https://img.shields.io/badge/Stack-React_Vite_Firebase-blue)
![AI](https://img.shields.io/badge/AI-Puter_OpenAI_Gemini-purple)

---

## 🌟 Why DungeonMind is the Best Free Alternative

Many VTTs lock essential features behind paywalls, require complex server setups, or have steep learning curves. DungeonMind democratizes premium tabletop features:

### 1. 100% Free & Zero Setup
* **Browser-Based:** Play instantly on PC, Mac, Tablet, or your Phone.
* **No Hosting Required:** Powered by Firebase, real-time sync is handled automatically. You never have to worry about IP addresses, tunneling, or paying for a server tier.
* **Anonymous Play:** Join games instantly via a simple 6-character code—no mandatory account creation needed for players.

### 2. Immersive 3D & 2D Tactical Maps
* **Any 2D Map Becomes 3D in Minutes:** You aren't restricted to buying specialized 3D assets or map packs. You can take **any flat 2D map**—whether it's an existing map from D&D Beyond, an exported map from Roll20, or an image you found online—and use DungeonMind to turn it into a fully playable 3D environment in minutes.
* **Seamless Perspective Shift:** Instantly toggle between traditional 2D Top-Down maps and an immersive Isometric 3D view.
* **Dynamic Fog of War & True Line of Sight:** A GPU-accelerated Fog of War system that calculates real-time vision. Players only see what their tokens can see, blocked accurately by walls, doors, and windows.
* **Custom 3D Tokens:** Upload your own `.glb` 3D models directly to character sheets, or choose from a massive built-in roster of free NPC/Monster models.
* **Dynamic Lighting:** Place lights that cast real-time shadows, illuminating dark dungeons only where the light reaches.

### 3. Cutting-Edge AI Integration (The "Mind" in DungeonMind)
DungeonMind doesn't just host your game; it actively helps you run it using AI (supporting **Puter.js** for completely free AI, alongside **OpenAI** and **Google Gemini**):
* **AI Map Geometry:** Upload a 2D map and use AI to instantly detect grids and generate walls/lighting geometry automatically.
* **Smart Session Recaps:** Say goodbye to taking notes. The AI can process thousands of lines of chat logs and dice rolls, using a Map-Reduce algorithm to generate cinematic session summaries.
* **Instant NPC Generator:** Need a shopkeeper right now? Generate fully fleshed-out NPCs with stats, motivations, and secrets in seconds.
* **Lore Engine & "Possession":** The AI reads your Campaign Bible. You can ask it questions about your own lore, or "Possess" an NPC to have the AI chat in-character with your players based on the world's history.

### 4. Foolproof D&D Beyond Integration
* **Instant Import:** Bring your characters over from D&D Beyond in seconds.
* **Bypass Restrictions:** D&D Beyond frequently blocks VTTs with Cloudflare. DungeonMind features a robust multi-proxy fallback system, plus a **Manual JSON Paste** feature that guarantees you can always import your sheet, no matter what security DDB implements.
* **Fully Interactive Sheets:** Once imported, every stat, skill, spell, and custom feature is clickable. Roll attacks, damage, and saving throws directly into the synchronized 3D dice tray.

### 5. Streamlined Campaign Management
* **Rich Text Journals & Handouts:** Write lore in a beautiful Quill editor and push visual handouts (images + text) directly to your players' screens.
* **Combat Tracker:** Automated initiative rolling and turn management built right into the sidebar.
* **Mobile-Friendly Design:** A specialized compact UI ensures players can view their sheets, roll dice, and chat comfortably from their phones while playing in person.

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite + Three.js / React Three Fiber (for 3D rendering)
- **Styling:** Tailwind CSS + Lucide React
- **Backend / DB:** Firebase (Firestore real-time sync, Anonymous Auth)
- **AI Integration:** Puter.js SDK (Free Serverless), OpenAI API, Google Gemini API

---

## 🚀 How to Play

You don't need to download anything. DungeonMind is hosted on GitHub Pages and uses Firebase for its backend.

**👉 [Launch DungeonMind Here](https://haydud3.github.io/dungeonmind/)**

### Creating a Campaign (Dungeon Master)
1. Click **"Start New Campaign"** on the Lobby screen.
2. Complete the **Onboarding Wizard** to define your world's Tone, Lore, and Conflict.
3. Share the **6-character Code** (top right) with your players.

### Joining a Campaign (Player)
1. Enter the code provided by the DM.
2. Click **"Join"**.
3. Navigate to the **Party** tab to create your character or import from D&D Beyond.

---

## ⚙️ Setting Up AI (Optional but Highly Recommended)

To use the AI Generators (NPCs, Recaps, Map Geometry), you need to select an AI Provider in the **Settings** tab.

* **Puter.js (100% Free):** Select Puter, allow the pop-up to log in with a free Puter account, and get instant access to models like Llama 3 and Mistral at no cost.
* **Bring Your Own Key:** If you prefer, you can paste your own OpenAI (`sk-...`) or Google Gemini (`AIza...`) API keys. These are stored locally in your browser and are never uploaded to the database.

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are highly welcome! 

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Built with ❤️ and a Natural 20.*