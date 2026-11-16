# ADR-0119 — La date d'une pièce d'identité se lit dans le téléphone, par un moteur d'OCR servi par notre origine

- **Statut** : Accepté le 2026-11-15 — décision du porteur « implémente tout » puis « valide tes choix »
- **Date** : 2026-11-15
- **Tickets** : TCK-2899
- **S'appuie sur** : la maquette `app-documents` (ajout d'une pièce : la date d'expiration lue sur la photo)

## Contexte

La maquette du coffre montre la date d'expiration d'une carte CEDEAO ou d'un passeport **lue sur la
photo**, avant tout envoi. Lire la zone MRZ demande un moteur d'OCR. Trois voies : un service tiers
(la pièce quitte l'appareil vers un tiers), l'API (la pièce est lue côté serveur avant que le
titulaire l'ait confirmée), ou un moteur embarqué dans le navigateur.

## Décision

1. **Le moteur tourne dans le navigateur** : `tesseract.js` 7.0.0 (WebAssembly), modèle `eng`
   `4.0.0_best_int`. La photo ne quitte pas l'appareil pour être lue ; seule la date proposée
   pré-remplit le champ, que le titulaire confirme ou corrige.
2. **Le moteur est servi par notre origine, jamais par un CDN** : `scripts/copier-moteur-ocr.mjs`
   copie worker, cœur wasm et modèle depuis `node_modules` vers `public/ocr/` à `predev` et
   `prebuild`. `public/ocr/` est ignoré par git (~14 Mo dérivés du lock) ; l'image Docker l'emporte
   par `COPY /app/public`. L'extension `gz` est servie telle quelle (`routing.ts`, `proxy.ts`).
3. **Chargé à la demande** : le moteur n'est téléchargé que quand le titulaire choisit
   « Pièce d'identité » ou « Passeport » ; aucune autre page ne le charge.
4. **Un échec ne bloque rien** : lecture impossible ou illisible → le champ reste vide, saisie à la main.

## Conséquences

- +~14 Mo dans l'image du front (fichiers statiques), téléchargés seulement par qui ajoute une pièce.
- La montée de version de `tesseract.js` suit le lock ; la copie suit d'elle-même.
- À mesurer au navigateur sur une vraie carte (AC5 de TCK-2899) — non mesuré au lot du 2026-11-15.

## Application

`takussan-web/src/lib/documents/lecture-mrz/` (analyse de la MRZ et moteur, tests unitaires),
`components/documents/coffre/ajout/AjoutAuCoffre.tsx`, `scripts/copier-moteur-ocr.mjs`.
