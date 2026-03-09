# ckc-titre

Mini-logiciel local pour créer des vidéos verticales (1080x1920) avec texte animé mot par mot et export MP4 pour réseaux sociaux.

## Fonctionnalités

- Fond animé organique inspiré des formes fluides (Perlin noise / contours)
- Animation du texte mot par mot avec GSAP (appear/disappear)
- Prévisualisation interactive avec contrôles Play/Pause + scrub timeline
- Export vidéo MP4 (H.264, yuv420p, faststart) via FFmpeg
- UI de réglages essentiels: texte, durée, taille, position, vitesse, palette

## Stack

- Frontend: React + Vite + TypeScript + p5.js + GSAP
- Backend: Node.js + Express + TypeScript + FFmpeg
- Tests: Vitest (frontend + backend) + Supertest (API)

## Prérequis

- Node.js 20+
- npm 10+
- ffmpeg et ffprobe disponibles dans le PATH

Vérification rapide:

```bash
node -v
npm -v
ffmpeg -version
ffprobe -version
```

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:3001](http://localhost:3001)
- Healthcheck: [http://localhost:3001/api/health](http://localhost:3001/api/health)

## Build production

```bash
npm run build
npm run start
```

Le backend sert automatiquement le frontend buildé (`frontend/dist`) quand disponible.

## Tests

```bash
npm test
```

## API

### `GET /api/health`
Retourne l’état du backend et la disponibilité de FFmpeg.

### `POST /api/export`
Upload d’un WebM temporaire + config, transcodage en MP4.

Form-data attendu:
- `video`: fichier WebM
- `config`: JSON sérialisé (optionnel)

Réponse:

```json
{
  "downloadUrl": "/api/downloads/export-xxx.mp4",
  "durationSec": 8,
  "resolution": "1080x1920",
  "codec": "h264"
}
```

## Structure du projet

```text
.
├── frontend/
│   ├── src/
│   │   ├── components/VideoCanvas.tsx
│   │   ├── lib/
│   │   ├── App.tsx
│   │   └── styles.css
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   └── services/ffmpeg.ts
│   └── tests/export.test.ts
└── package.json
```

## Limitations v1

- Une seule scène de texte
- Export sans audio
- MP4 vertical uniquement (1080x1920)

## Roadmap proposée

- Multi-scènes / script import
- Presets multi-formats (1:1, 16:9)
- Pistes audio (musique/voix)
- Optimisation bundle (code-splitting p5)
