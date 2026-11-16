---
id: TCK-2949
title: "Étape du numéro des assistants d'invité : le panneau « {agence} vous attend » chiffré (biens suivis, dernier loyer, pièces à envoyer)"
status: done
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2939]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [front, entree, assistants, invitation, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'invité qui vérifie son numéro voit déjà ce qui l'attend chez l'agence : ses biens, son dernier loyer, les pièces à envoyer.

## Contrat de données

- `GET /api/me/profiles/{profile}/invite-summary` (TCK-2939), suspendu à l'amendement d'ADR-0094 (décision « rien avant le code » de TCK-2613 `#8`). Si le porteur refuse l'amendement, ce ticket passe `obsolete` et la fiche TCK-2613 garde l'écart avec ce motif.

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-assistants`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-assistants-a.tsx`, visionneuse `?p=app-entree-assistants&a=a`, **e4 « Ton numéro (étape commune) »**, **bureau** (le panneau n'existe pas au téléphone) : lignes « 3 biens suivis par l'agence » + titres, « Ton dernier loyer · 350 000 F reçus le 5 nov. », « 2 pièces à envoyer · RIB et pièce d'identité » (`:965-967`). La disposition sous 1280 (panneau empilé) est dans TCK-2945.
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-assistants e4 ; fiche TCK-2613 (`#8`).

## Contraintes strictes (métier)

- Chaque ligne n'est rendue que si l'API la sert ; sans résumé, les lignes génériques actuelles (`CeQuiVousAttend.tsx`).
- Libellés `fr`/`en`/`wo` (`wo` = français) ; tutoiement de l'entrée conservé.

## Delta à produire

- [ ] Lignes chiffrées du panneau, par rôle (bailleur, agent, prestataire).
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Pour un bailleur dont `invite-summary` rend 3 biens et un dernier loyer de 350 000 F le 5 nov., le panneau affiche « 3 biens suivis par l'agence » avec les trois titres et « Ton dernier loyer · 350 000 F reçus le 5 nov. ».
- [ ] AC2 — Sans résumé (404 ou champs nuls), les lignes génériques actuelles sont rendues, sans erreur.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2613 : entrée `#8` retirée.
- [ ] AC-F2 — À 1440 × 900, `fidelite compare` sur e4 ne rend aucun écart non expliqué.

## Hors périmètre

- La disposition sous 1280 (TCK-2945). La règle d'accès (TCK-2939).

## Notes d'implémentation

2026-11-15 — implémenté (agent délégué, arbre `takussan-manques`).

**Prémisses re-mesurées** :
- `invite-summary` ne répond qu'au titulaire d'un profil **actif** (`ActiveProfileResolver::resolve`) ; les pages
  d'assistant choisissent le profil par `profilAReprendre` (souvent `draft`). L'acceptation de l'invitation passe le
  profil à `active` (mesuré par TCK-2939, `AcceptationNActiveQueLeBrouillonTest`), donc l'invité qui arrive par son
  lien est servi ; un profil resté en brouillon reçoit 404 → panneau sans chiffres (AC2). Règle d'accès hors périmètre.
- Ton : le ticket dit « tutoiement de l'entrée conservé », mais le panneau livré (TCK-2613) est au **vouvoiement**
  (ADR-0095 : la maquette tutoie, elle n'est pas une référence de ton) → « Votre dernier loyer », pas « Ton ».
- L'API ne rend qu'un **compte** de pièces (`missing_documents`), pas leurs noms.

**Décisions tranchées** (« valide tes choix ») :
- Lecture **serveur** dans les trois pages (`/onboarding/owner|agent|service-provider`), dans leur `Promise.all`,
  par `fetchResumeDInvite` (`src/lib/resume-d-invite.ts`) qui porte le `catch → null` une seule fois.
- Lignes, chacune seulement si servie : bailleur — « N biens suivis par l'agence » + titres (remplace la ligne
  générique ; compte 0/nul → ligne générique), « Votre dernier loyer · {montantCourt} reçus le {jourMois} »
  (`paid_at` nul → « {montant} reçus ») ; agent — sa ligne générique (prospects), puis « N biens suivis par l'agence ·
  Le parc que vous suivrez, depuis votre espace », jamais de loyer ; prestataire — l'intervention jointe, jamais de
  biens ni de loyer ; les trois — « N pièces à envoyer » si `missing_documents > 0`.
- Noms des pièces : tirés de `GET /api/me/pieces` (déjà lu par la page) avec le filtre de l'API (obligatoires et
  `missing`, pas `aDonner` qui compterait les refusées), écrits seulement si leur nombre égale le compte du résumé ;
  sinon « Quand vous voulez, depuis votre espace ».
- Clés neuves sous `onboarding.invite.attente.chiffres.*` (15, par l'outil de verrou ; `wo` = `fr`).

**Preuves** : `CeQuiVousAttend.tck-2949` 7/7 (AC1, AC2 ×2, ligne par rôle, noms discordants) ; tests des pages
mis à jour (`resume` passé ; 404 du seul résumé → `null`, les autres lectures intactes) ; `src/components/onboarding/invite/__tests__`
+ tests des assistants 107/107 ; `tsc` propre (hors `ResteARapprocher.test.tsx`, TCK-2933 en cours) ; eslint ;
`check:*` front et `scripts/check-*.mjs` verts. Ablations une à une (restaurées par `cp`, md5 vérifié), toutes
rouges : ligne des biens retirée (AC1), `catch` retiré du helper (page prestataire), garde « noms = compte » retirée.
- AC-F1 : fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2613.json`, l'écart accepté « 3 biens suivis… » passé en
  `ecarts_resolus` (2026-11-15).
- AC-F2 **non mesuré** : pas de relevé au navigateur dans ce lot (consigne du porteur, 2026-11-15).
