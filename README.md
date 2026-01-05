DungeonMind 🐉🧠

**The AI-Enhanced TTRPG Companion for Dungeons & Dragons 5e.**

DungeonMind is a real-time, synchronized dashboard for Dungeon Masters and Players. It combines traditional campaign management tools (Maps, Journals, Character Sheets) with advanced AI agents that act as Scribes, NPC actors, and World-Building assistants.

![Status](https://img.shields.io/badge/Status-Beta-orange)
![Tech](https://img.shields.io/badge/Stack-React_Vite_Firebase-blue)
![AI](https://img.shields.io/badge/AI-Puter_OpenAI_Gemini-purple)

---

## ✨ Key Features

### 🤖 AI-Powered Tools
- **Smart Session Recaps (Map-Reduce):** Automatically processes thousands of words of chat logs and journal entries to generate cinematic session summaries without hitting context limits.
- **NPC Generator:** Instantly create fully fleshed-out NPCs with stats, quirks, and secrets.
- **Roleplay Assistant:** The AI reads your Campaign Bible and Journal to answer lore questions accurately or "Possess" an NPC to chat with players in character.
- **Multi-Provider Support:** Supports **Puter.js** (Free/Serverless), **OpenAI**, and **Google Gemini**.

### ⚔️ Campaign Management
- **Real-Time Sync:** All data (dice rolls, chat, map updates) syncs instantly across all connected devices via Firebase Firestore.
- **Interactive Map Board:** Upload maps, apply Fog of War, and reveal areas in real-time.
- **Rich Text Journal:** A fully-featured editor (Quill) to write lore, track quests, and save session logs.
- **Lobby System:** Join games via simple 6-character codes. No account required for quick play (Anonymous auth supported).

### 🛡️ For DMs & Players
- **DM Mode:** Control the map, ban/kick users, generate content, and manage the "Truth" (Campaign Bible).
- **Player Mode:** Manage character stats, roll 3D dice, and maintain a personal inventory.

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite
- **Styling:** Tailwind CSS + Lucide React (Icons)
- **Backend:** Firebase (Firestore, Auth)
- **Editor:** React-Quill-New
- **AI Integration:** Puter.js SDK, OpenAI API, Google Gemini API

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- A Firebase Project (Google Account)

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/dungeonmind.git](https://github.com/your-username/dungeonmind.git)
   cd dungeonmind

```

2. **Install dependencies:**
```bash
npm install

```


3. **Configure Firebase:**
* Go to [Firebase Console](https://console.firebase.google.com/).
* Create a project and enable **Authentication** (Google & Anonymous) and **Firestore**.
* Copy your Firebase configuration keys.
* Open `src/firebase.js` and replace the `firebaseConfig` object with your own:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};

```




4. **Run the development server:**
```bash
npm run dev

```


5. **Open in Browser:**
Go to `http://localhost:5173` (or the port shown in your terminal).

---

## ⚙️ Configuration

### 1. AI Setup (Required for Generators)

DungeonMind supports three AI modes. You can configure this in the **Settings** tab inside the app.

* **Puter.js (Recommended for Free Use):**
* No API key required.
* Uses the `window.puter` object to interface with free models like Mistral and Llama 3.
* *Note: Ensure you allow pop-ups for the Puter login prompt.*


* **OpenAI / Gemini:**
* Enter your `sk-...` or `AIza...` API keys in the Settings tab.
* Keys are stored locally in your browser's `localStorage` and are never saved to the cloud database.



### 2. Firestore Rules

To ensure data security, create the following rules in your Firebase Firestore Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/dungeonmind/public/data/campaigns/{campaignId} {
      allow read, write: if true; // DEV MODE - Lock this down for production!
    }
  }
}

```

---

## 📖 Usage Guide

### Creating a Campaign (DM)

1. Click **"Start New Campaign"** on the Lobby screen.
2. Complete the **Onboarding Wizard** to define your world's Tone, Lore, and Conflict.
3. Share the **6-character Code** (top right) with your players.

### Joining a Campaign (Player)

1. Enter the code provided by the DM.
2. Click **"Join"**.
3. Navigate to the **Party** tab to create your character.

### The "Map-Reduce" Recap Feature

If your session log becomes massive (over 15,000 characters):

1. Go to the **Chat** tab.
2. Click **"Generate Recap"**.
3. The app will automatically split the history into chunks, summarize them individually, and stitch them together into a final narrative.

---

## 🤝 Contributing

Contributions are welcome!

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

```

```
