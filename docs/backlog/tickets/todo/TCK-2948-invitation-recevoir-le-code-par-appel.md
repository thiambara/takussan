---
id: TCK-2948
title: "Page d'invitation : « ou le recevoir par appel » sous le code"
status: todo
phase: P3
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2940]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [front, entree, invitation, code, appel, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'invité qui ne reçoit pas le SMS demande que le code lui soit dicté par un appel.

## Contrat de données

- `POST /api/public/invitations/{token}/code` avec `channel: "voice"`, et l'indication que la voie est active (TCK-2940).

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-invitation`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-invitation.tsx`, visionneuse `?p=app-entree-invitation&a=a`, **e1 « Code »**, **téléphone et bureau** : « Rien reçu ? Renvoyer le code dans 0:38, ou le recevoir par appel. » (`:342`).
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-invitation e1, « écarts couverts » 5 ; fiche TCK-2611 (`#6`). Séparé de TCK-2941 pour que le reste de la page n'attende pas le choix d'un fournisseur.

## Contraintes strictes (métier)

- Le lien n'est rendu que si la voie est active ; il partage le rebours du renvoi (pas d'appel avant la fin du rebours).
- Libellés `fr`/`en`/`wo` (`wo` = français) ; tutoiement de la page conservé.

## Delta à produire

- [ ] Lien « ou le recevoir par appel » et son appel.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Voie active, à la fin du rebours, « le recevoir par appel » envoie `channel: "voice"` à `…/code` et relance le rebours ; pendant le rebours, il est inactif.
- [ ] AC2 — Voie inactive, la phrase s'arrête à « Renvoyer le code dans … » (aucun lien d'appel).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2611 : entrée `#6` retirée.
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e1 ne rend aucun écart non expliqué.

## Hors périmètre

- Le fournisseur et la route (TCK-2940).

## Notes d'implémentation

Implémenté le 2026-11-15 (agent délégué, arbre `takussan-manques`).

- **Contrat** : `demanderCodeDInvitation(jeton, tel, locale, canal = 'sms')` ; `channel: "voice"` ne part que pour l'appel
  (le corps du SMS est inchangé) ; `voixDisponible` = `data.voice_available === true` (absent ou d'une autre forme : fermé).
  Aucun champ de l'aperçu public (TCK-2939, en cours) n'est lu : la voie se décide sur la réponse 202 de `…/code`,
  donc après le premier envoi — c'est déjà l'écran du code.
- **Écran** (`EcranDuCode`) : voie active → « Rien reçu ? Renvoyer le code dans 0:38, ou le recevoir par appel. » (clé
  `code.ouParAppel`, rich text `<renvoi>{texte}</renvoi>…<appel>…</appel>`). Le lien d'appel est un bouton **désactivé
  pendant le rebours** (texte gris, sans soulignement — la maquette le dessine ainsi), actif à sa fin avec « Renvoyer le
  code » ; l'appel relance le rebours (`retry_after` de la voie, 60 s). Voie inactive : la ligne d'avant, intacte.
- **Décisions tranchées** (« valide tes choix ») : après l'appel, une ligne `role="status"` « Un appel arrive : décrochez,
  le code vous est dicté. » (`code.appelEnCours`), retirée au retour au numéro ; les six cases sont vidées comme au
  renvoi (sans code en cours, l'API en émet un neuf). **422 sur l'appel** (pilote ou clé absents) → le lien se retire,
  erreur `errors.appelIndisponible` (« …Renvoyez le code par SMS. »), le SMS reste ; 429/404/410 suivent le chemin du SMS.
- **Écart de prémisse** : le ticket dit « tutoiement de la page conservé » — la page **vouvoie** (ADR-0095,
  `check-vouvoiement` vert) : les libellés neufs vouvoient.
- **Fidélité** : pas de relevé au navigateur (consigne du lot). AC-F1 : l'entrée `#6` de `TCK-2611.json`
  (« sans voie par appel, la phrase tient sur une ligne ») est réécrite — ne reste que l'écart du composant partagé
  `CasesDuCode` (+4 px), la phrase de deux lignes étant désormais rendue voie active. AC-F2 non mesuré.
- **Preuves** : `npx vitest run` de `EntreeDInvitation.appel.tck-2948.test.tsx` (4), `lib/__tests__/invitation-code.tck-2948.test.ts`
  (6), `EntreeDInvitation.tck-2611` et `.sortie.tck-2598` : 36/36 verts. Ablations une à une (md5 restauré) : rebours qui
  ne désactive plus l'appel, lien rendu sans `voice_available`, 422 non traité, `channel` retiré du corps,
  `voice_available` lu sans `=== true`, appel qui part en SMS — toutes rouges. `eslint` des fichiers, `check:i18n`,
  `check-vouvoiement`, `check-i18n-namespaces`, `scripts/check-*.mjs` verts. `tsc --noEmit` : une seule erreur, hors zone
  (`ResteARapprocher.test.tsx`, champ `ignored` de TCK-2933 en cours).
