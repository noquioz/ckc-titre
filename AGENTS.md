# AGENTS.md

Guidelines pour les agents (humains ou IA) qui contribuent à ce repository.

## Objectif du projet

Créer un outil local simple pour générer des vidéos sociales avec:
- fond animé organique,
- texte animé mot par mot,
- export MP4 fiable via FFmpeg.

## Conventions techniques

- Node.js 20+
- TypeScript strict
- Frontend: React + Vite
- Backend: Express
- Éviter d’introduire de nouvelles dépendances lourdes sans justification.

## Workflow attendu

1. Installer: `npm install`
2. Développer: `npm run dev`
3. Tester: `npm test`
4. Vérifier build: `npm run build`

Toute PR/changement doit laisser `npm test` et `npm run build` au vert.

## Qualité de code

- Préférer des fonctions pures dans `frontend/src/lib` pour la logique testable.
- Garder les composants UI focalisés sur l’affichage/interaction.
- Côté backend, isoler la logique FFmpeg dans `backend/src/services`.
- Gérer les erreurs utilisateur avec messages explicites.

## Export vidéo

- Codec attendu: `libx264`
- Pixel format: `yuv420p`
- Flag: `+faststart`
- Résolution cible v1: `1080x1920`

Ne pas modifier ces paramètres sans raison produit claire.

## UX / Design

- La preview doit rester fidèle au rendu exporté.
- Les contrôles de lecture (play/pause/scrub) doivent rester fluides.
- Conserver une UI lisible desktop + mobile.

## Tests minimaux à préserver

- Unit: tokenisation texte, timeline, wrapping
- Intégration backend: `/api/export` (succès + erreurs)
- Vérification des propriétés MP4 (codec/pix_fmt/résolution)

## Scope v1 (à respecter)

- Une scène unique
- Pas d’audio
- Export MP4 vertical uniquement

Les features hors scope doivent être proposées derrière un plan v2.
