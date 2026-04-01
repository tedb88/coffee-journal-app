# ☕ BrewMap

> Snap a coffee bag. Get a perfect brew recipe. Log your journey.

BrewMap is a mobile-first web app for specialty coffee lovers. Point your camera at any coffee label, and BrewMap extracts the origin, process, and roast details — then generates a tailored pour-over recipe just for you. Every brew you make gets logged to your personal journal and pinned on a live world map.

---

## ✨ Features

### 📸 Smart Label Scanner
Upload a photo of any coffee bag and let AI do the reading. BrewMap uses **Llama 4 Scout** (via Groq) to extract:
- Coffee name & brand
- Origin country & region
- Roast level & processing method
- Tasting notes, variety, and altitude

A clean 3-step flow walks you through the scan:
1. **Upload** — preview your photo before analysing
2. **Confirm** — review the extracted details
3. **Recipe** — get a personalised pour-over guide

### 📖 Brew Journal
Every coffee you scan is saved to your personal journal. Flip through your history, revisit tasting notes, and track how your palate evolves over time.

### 🗺️ World Map
Watch your coffee world grow. Each origin you scan drops a pin on an interactive map — a beautiful visual record of every country your beans have come from.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A free [Groq API key](https://console.groq.com) (takes 30 seconds to create)

### Installation

```bash
git clone https://github.com/tedb88/coffee-journal-app.git
cd coffee-journal-app
npm install
```

### Configuration

Copy the example env file and add your Groq key:

```bash
cp .env.example .env
```

```env
VITE_GROQ_API_KEY=your_groq_api_key_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 5 |
| Styling | Plain CSS with custom properties |
| Vision AI | Llama 4 Scout via Groq API |
| Map | Leaflet.js |
| Storage | localStorage |
| Fonts | Syne (headings) + DM Sans (body) |

---

## 📱 Design

BrewMap is built mobile-first with a max-width card layout that looks sharp on both phone and desktop. The design uses a blue-to-orange gradient (`#3B82F6 → #F97316`) that nods to the journey from bean to cup.

---

## 🔒 Privacy

All your brew data stays on your device — nothing is sent to any server except the label image (analysed by Groq's API) and your API key never leaves your local `.env` file.

---

## 📄 License

MIT — brew freely.
