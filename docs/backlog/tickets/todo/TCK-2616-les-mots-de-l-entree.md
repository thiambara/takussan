---
id: TCK-2616
title: "Les mots de l'entrée : le vouvoiement partout, plus d'anglicismes ni de « Valider », F CFA partout, et plus de note qui promet un brouillon qui n'existe pas"
status: todo
phase: P2
family: front
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#21-authentification--comptes"
tags: [front, i18n, copy, onboarding, audit-ux, app]
---

## Objectif utilisateur

La personne qui entre dans Takussan lit un français simple et constant : on la vouvoie partout, avant comme après la création de son compte, et aucun mot technique ou anglais ne l'arrête.

## Contrat de données

Aucun changement d'API. Re-mesure sur `dev` (1bce3798a), surfaces de la famille 2 (connexion, inscription, oubli, vérification, orientation, publier, invitation, assistants bailleur / agent / prestataire / administrateur / hôte) : tutoiement et vouvoiement mêlés sur un même écran ; « lead », « wizard », « dashboard », « KYC », « TOTP » visibles ; bouton « Valider » (clé `verifyCode`, et autres) ; montants « XOF » ; « vraie agence » ; « Vous êtes invité » au masculin seul ; note de pied « Vos réponses sont enregistrées au fur et à mesure » sur des écrans qui n'enregistrent rien.

## Direction UX / Artistique

- Règle de ton : **vouvoiement partout** ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10 par le porteur : il remplace la décision 2 c « tutoiement jusqu'au compte »). Aucun écran ne dépend de la session pour choisir sa voix, et aucun message ne porte la voix en argument. Le delta de charte (`docs/design-guidelines.md`, § « Ton & Micro-copy ») est porté par TCK-2683.
- Remplacements : « lead » → « prospect » (vocabulaire du pipeline arrêté avec la famille 5) ; « wizard » → « assistant » ; « dashboard » → « espace » ; « KYC » → « pièces » ; « TOTP » → « application d'authentification » ; « Valider » → le verbe de l'action (« Vérifier le code », « Envoyer mes pièces », « Rejoindre Dakar Immo ») ; « XOF » → « F CFA » à l'affichage ; « vraie agence » → « agence » (ou « agence enregistrée » quand la distinction compte) ; « Vous êtes invité » → « Une agence vous invite » / « Dakar Immo vous invite ».
- La note « Vos réponses sont enregistrées au fur et à mesure » ne reste que là où un brouillon est réellement enregistré.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).
- Aucune clé supprimée sans que son dernier appelant soit migré ; les trois langues `fr`/`en`/`wo` gardent la même forme (wo : texte français tel quel, wolof en pause).
- Les codes de devise envoyés à l'API restent `XOF` : seul l'affichage change.
- `node scripts/check-i18n.mjs` reste vert.
- Les textes que TCK-2600, TCK-2601, TCK-2604, TCK-2608, TCK-2611, TCK-2613, TCK-2614 écrivent suivent déjà la règle : ce ticket traite le **reste** des surfaces d'entrée, y compris l'assistant administrateur d'agence (`/onboarding/agency-admin`), non dessiné.

## Delta à produire

- [ ] Relevé écrit, dans les notes, de chaque clé touchée (avant / après).
- [ ] Remplacements et règle de ton appliqués aux surfaces d'entrée.
- [ ] Tests : un test par surface qui vérifie l'absence des mots bannis dans le rendu `fr` ; « XOF » absent des montants affichés dans les assistants ; note de pied absente de la page d'invitation et de la connexion.

## Critères d'acceptation

- [ ] AC1 — Aucun des mots « lead », « wizard », « dashboard », « KYC », « TOTP », « Valider », « XOF » n'apparaît dans le texte rendu `fr` des surfaces d'entrée (sur `dev` : chacun apparaît au moins une fois).
- [ ] AC2 — Aucune forme du tutoiement n'apparaît dans le texte rendu `fr` des surfaces d'entrée, avec ou sans session (la garde de TCK-2683, si elle est mergée avant, est verte sur ces clés).
- [ ] AC3 — La note « Vos réponses sont enregistrées au fur et à mesure » n'apparaît sur aucun écran sans brouillon.

## Hors périmètre

- Les derniers textes au tutoiement du site public, la charte et la garde (TCK-2683).
- La traduction wolof.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
