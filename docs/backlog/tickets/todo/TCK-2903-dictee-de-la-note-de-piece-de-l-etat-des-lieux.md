---
id: TCK-2903
title: "État des lieux sur le terrain : dicter la note de la pièce au micro (téléphone)"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
  models:
    - "docs/models-spec.md#24-inventory-"
tags: [front, etats-des-lieux, terrain, voix, audit-ux, app]
---

## Objectif utilisateur

L'agent qui fait l'état des lieux debout, une main prise, dit « peinture refaite en octobre » au lieu de le taper : la phrase arrive écrite dans la note de la pièce, qu'il peut corriger avant de passer à la pièce suivante.

## Contrat de données

Aucun endpoint neuf. La note reste le texte `notes` de la pièce, envoyé comme aujourd'hui avec le brouillon de l'état des lieux. Le micro **écrit du texte** : aucun fichier audio n'est envoyé à Takussan ni stocké. ⚠ La reconnaissance vocale du navigateur (Chrome, Safari) envoie d'ordinaire le son **au service de son éditeur** (Google, Apple) — à signaler au porteur à la revue du ticket, et à dire dans la politique de confidentialité si retenu (TCK-537 suit les écarts entre la politique et le code).

> **Décision prise à l'écriture du ticket** : la note de la pièce figure dans le PDF signé, qui ne peut porter que du texte. Le micro de la maquette est donc une **dictée** (parole → texte, reconnaissance du navigateur), et non la note vocale enregistrée des interventions (TCK-2900, TCK-2901). Si le porteur préfère une note audio jointe à la pièce, ce ticket est à réécrire sur le socle TCK-2900.

## Direction UX / Artistique

- **Référence de fidélité** : page `app-etats-des-lieux`, approche `a`, écran **e1 « Une pièce »**, **téléphone** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-etats-des-lieux.tsx` (fonction `MobileAPiece`, l. 351-359 : icône `Mic` dans le coin haut droit du champ « Note de la pièce (facultatif) »).
- **Téléphone** : manque l'icône micro dans le champ. Toucher le micro démarre la dictée (état « J'écoute… » visible, micro en couleur primaire) ; retoucher l'arrête. Le texte reconnu s'ajoute à la fin de la note existante, séparé d'une espace.
- **Bureau** : la maquette (`BureauAPiece`, l. 468) ne dessine pas de micro — rien ne change au bureau.
- Langue de la dictée : celle de l'interface (`fr-FR`, `en-US`) ; en `wo`, la reconnaissance part en `fr-FR` (aucune reconnaissance wolof dans les navigateurs).

## Contraintes strictes (métier)

- **Amélioration progressive** : le micro n'est rendu que si le navigateur expose la reconnaissance vocale (`SpeechRecognition` ou `webkitSpeechRecognition`). Un bouton qui ne peut pas marcher est un défaut (même règle que `VoiceNoteRecorder`).
- Un refus du micro, une absence de réseau ou une erreur de reconnaissance s'affiche sous le champ ; le texte déjà saisi n'est jamais effacé.
- La dictée ne change pas l'enregistrement du brouillon : la note dictée part avec le brouillon comme une note tapée.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Bouton micro dans le champ « Note de la pièce » de l'écran d'une pièce au téléphone (`components/inventory/terrain/EcranDUnePiece.tsx`, champ `note`).
- [ ] Dictée : démarrer, arrêter, ajouter le texte reconnu à la note, erreurs lisibles — **un seul mécanisme de dictée** partagé avec TCK-2880 (dictée du compte rendu de visite, même solution) : le premier des deux livré l'écrit, le second le réutilise.
- [ ] Tests (vitest, reconnaissance doublée) : micro absent sans API ; texte reconnu ajouté après le texte existant ; erreur affichée sans perte du texte ; aucun micro au bureau.

## Critères d'acceptation

- [ ] AC1 — À 390, sur un navigateur qui expose `webkitSpeechRecognition`, le champ « Note de la pièce » porte un bouton nommé « Dicter la note » ; sans l'API, ce bouton n'est pas dans le DOM.
- [ ] AC2 — La note contient « Mur fissuré » ; une dictée qui reconnaît « peinture refaite » donne la note « Mur fissuré peinture refaite », et le brouillon envoyé porte cette note (`notes` de la pièce).
- [ ] AC3 — Une erreur `not-allowed` de la reconnaissance affiche un message sous le champ et laisse la note inchangée.
- [ ] AC4 — À 1440, l'écran d'une pièce ne rend aucun bouton « Dicter la note ».
- [ ] AC5 — Vérifier au navigateur (Chrome Android ou émulation 390) que la dictée écrit dans le champ ; corriger si absent.

## Hors périmètre

- Une note audio jointe à la pièce (voir la décision ci-dessus).
- La dictée des notes d'élément (« Précisez ») et des notes générales : la maquette n'y dessine pas de micro.

## Notes d'implémentation

_(à remplir par implementing-specs)_
