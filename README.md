# Micro Emergency Assistant (MEA)

A fast, offline-friendly web app to help people in Ethiopia quickly find and call the nearest emergency services — and to demo next-gen community response flows in a hackathon setting.

## Why this exists

In emergencies, seconds matter. People often don’t know which service is closest, how to reach them, or how to share their location. Network is unreliable, and many systems are not localized.

**Micro Emergency Assistant** solves this by:
- Detecting the user’s location and showing the nearest Police, Ambulance, Fire, Hospital, and Pharmacy
- One-tap calling and quick location sharing
- Working offline (PWA) with local JSON data for Addis Ababa
- Offering local language (English/Amharic) and a clean mobile-first UI
- Demonstrating believable “panic mode”, citizen responders, and a QR-based health passport for hackathon demos

---

## Live Demo Value (Hackathon-ready)

- Panic Mode with tracking (simulated)
- Citizen Responder side panel (mock responders move toward the user)
- Emergency ID & Health Passport (QR generation + mock scan)
- Multi-point nearest services (top 3 per category)
- Map theme selector (Light, Carto Light, Dark)
- Offline PWA installable
- Language toggle (English / Amharic)

---

## Quick Start

Prereqs: Node 18+ recommended

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite (usually `http://localhost:5173`).

Build for production:
```bash
npm run build
npm run preview
```

Install as PWA (optional): open the app in Chrome/Edge and “Install app”.

---

## How to Demo (Suggested Flow)

1. Load the app. Allow location. The map centers on your position (or falls back to central Addis Ababa).
2. Toggle language (top-right) to show Amharic UI, then switch back.
3. Change **Map Theme** from inside the map (Light/Carto/Dark) to demonstrate design polish.
4. Show nearest services (top 3) and one-tap Call.
5. Press and hold (or double-tap) the big red **EMERGENCY** button to activate **Panic Mode**:
   - A banner appears: “Tracking active”.
   - A side panel slides in showing **Responders** (moving toward you) and a **Services** tab.
   - After ~5s, a responder “accepts” your call (message appears).
6. Tap Share My Location (bottom-left) and pick WhatsApp/Telegram/SMS; or it copies a Google Maps link to the clipboard.
7. Open **ID** (top-right). Fill in Name, Blood Type, etc. Click “Save & Generate QR” to show the QR.
8. Click “Responder Mode: Scan” and upload the QR image you just generated to “scan” and reveal the profile.

This entire flow is local/simulated — perfect for a believable demo without backend dependencies.

---

## Features

- GPS detection with Addis Ababa fallback
- Local data from `public/emergency_data.json`
- Nearest per category (Haversine) — top 3 results
- Map with themed tiles (Light/Carto/Dark) and bright category icons
- Category filter chips (All, Police, Ambulance, Fire, Hospital, Pharmacy)
- Service cards: distance + ETA (walking/drive) + one-tap Call
- Share My Location: WhatsApp / Telegram / SMS / clipboard fallback
- Offline PWA: cache assets and JSON for reuse when offline
- Language: English / Amharic
- Accessibility: high-contrast dark theme, minimum hit sizes, ARIA where relevant

### Demo-Only Additions
- **Panic Mode**: hidden trigger (long-press or double-tap EMERGENCY). Simulated tracking every 5s, “Alert sent…” toast, “Tracking active” banner.
- **Citizen Responder Network**: loads `public/responders.json`, shows responders in a **tabbed** side panel (Responders/Services), animates responders moving toward the user each cycle, and shows “accepted your call”.
- **Emergency ID & Health Passport**: profile form saved locally, QR generated on device, mock scan via file upload to decode QR.

---

## Tech Stack

- React + Vite
- Leaflet + OpenStreetMap / CARTO tiles (no API keys)
- PWA via `vite-plugin-pwa`
- QR code generation: `qrcode`
- QR scan (mock via image upload): `jsqr`
- Styling: hand-rolled CSS, dark theme with category accents

---

## Project Structure

```
workspace/micro-emergency-assistant/
  public/
    emergency_data.json       # Addis Ababa emergency locations (MVP dataset)
    responders.json           # Mock nearby responders (demo)
  src/
    App.jsx                   # Main app: map, logic, panic, responders
    Profile.jsx               # Emergency ID & Health Passport (QR generate/scan)
    index.css                 # Dark theme, animations, layout
    main.jsx                  # React entry
  vite.config.js              # PWA config (generateSW), React plugin
  package.json
```

---

## Data & Configuration

- Update emergency locations: edit `public/emergency_data.json`
- Update responders for demo: edit `public/responders.json`
- Default fallback location is central Addis Ababa (see `ADDIS_FALLBACK` in `App.jsx`).

---

## Privacy & Networking

- No real backends; “tracking” is simulated and POSTs to `/mock-track` are no-ops.
- Only remote calls are to public tile servers for map imagery.
- All profile data stays in the browser (localStorage) — QR is generated locally.

---

## Scripts

- `npm run dev` – start Vite dev server
- `npm run build` – production build (PWA assets generated)
- `npm run preview` – preview built app locally

---

## Troubleshooting

- Location denied: app uses Addis Ababa fallback coords.
- No internet: app still loads if previously visited (PWA cache) but tiles may be limited; core features still present.
- QR scan not working: ensure you upload a PNG/JPG screenshot of the generated QR.
- Chunk size warning: safe to ignore for demo — can be tuned with Rollup chunking if needed.

---

## Roadmap (Post-Demo)

- Real backend for panic alerts and responder dispatch
- Role-based responder app
- Marker clustering on dense maps
- Better geofence logic beyond simple proximity
- Multi-city support, richer data, live status for facilities

---

## License

MIT – use responsibly. Map data © OpenStreetMap contributors; tile styles © their respective providers.
