---
id: TCK-250
title: "Wizard reprenable — composant frontend + persistance draft"
status: done
phase: P0
family: front
estimate: S
wave: 29
created: 2026-05-10
updated: 2026-05-10
depends_on: []
blocks: [TCK-253, TCK-255, TCK-257, TCK-259, TCK-261, TCK-267]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
tags: [front, onboarding, design-system, p0]
---

## Objectif utilisateur

Permettre à un utilisateur d'**interrompre un onboarding multi-étapes** (publication d'un bien, KYC owner, KYC agent…) et de le reprendre exactement là où il s'était arrêté, depuis n'importe quel écran de l'app, sans perdre la saisie.

## Contrat de données

Endpoint backend générique pour persister l'état :

- `PUT /api/me/wizard-drafts/{key}` — body : `{ step: int, data: object }`. Upsert.
- `GET /api/me/wizard-drafts/{key}` — lit l'état courant.
- `DELETE /api/me/wizard-drafts/{key}` — efface (à l'issue du wizard ou abandon explicite).

Stockage : nouvelle table `wizard_drafts` (id, user_id, key, step, data json, updated_at). Garbage collection : drafts > 90 jours purgés par cron.

## Direction UX / Artistique

Composant générique présentant : barre de progression en haut, bouton "Précédent / Suivant" en bas, sauvegarde silencieuse à chaque changement de step (debounce 800ms). Sortie sans engagement : si l'utilisateur quitte la page, un toast "Votre progression est sauvegardée" s'affiche brièvement. Bandeau persistant sur dashboard tant qu'un draft existe : "Reprenez votre publication / votre onboarding" avec deep-link.

## Contraintes strictes (métier)

- Drafts strictement scoped par `user_id` (jamais cross-user).
- `key` est un identifiant logique (ex. `host-individual-wizard`, `owner-onboarding-{invitation_id}`) — la convention est portée par les tickets consommateurs.
- Les drafts ne contiennent **jamais** de données sensibles non chiffrées (pas de mot de passe, pas de token). Le KYC documentaire (uploads) ne passe pas par le draft mais par l'API media dédiée.
- Le composant frontend ne prescrit pas le shape de `data` — chaque wizard fournit son propre form schema.

## Delta à produire

- [ ] Migration : `create_wizard_drafts_table` (id, user_id, key unique par user, step, data json, timestamps)
- [ ] Modèle : `App\Models\WizardDraft`
- [ ] Controller : `App\Http\Controllers\WizardDraftController` (PUT/GET/DELETE)
- [ ] FormRequest : `UpsertWizardDraftRequest`
- [ ] Policy : `WizardDraftPolicy` (un user ne voit que ses propres drafts)
- [ ] Console : `App\Console\Commands\PurgeOldWizardDrafts` (90j)
- [ ] Tests backend : `tests/Feature/WizardDraft/` (CRUD scoped, purge)
- [ ] Composant frontend réutilisable : wizard avec barre de progression, navigation step, autosave debounced
- [ ] Hook frontend : pour lire/écrire/effacer un draft donné
- [ ] Bandeau dashboard : afficher tous les drafts actifs avec deep-link de reprise
- [ ] Tests frontend : autosave, reprise, navigation entre steps

## Critères d'acceptation

- [ ] AC1 — Modifier un champ d'un wizard sauvegarde le draft sous 1s (visible côté backend).
- [ ] AC2 — Quitter et revenir : le wizard restaure le step et la data exacts.
- [ ] AC3 — Le bandeau dashboard apparaît pour tout draft actif et disparaît à completion / suppression.
- [ ] AC4 — Un user ne peut pas lire le draft d'un autre user (403).
- [ ] AC5 — Drafts > 90j sont purgés au passage du cron.

## Hors périmètre

- Wizards spécifiques (host individual, KYC owner, etc.) — portés par les tickets parcours.
- Versioning des drafts (historique des steps) — non requis MVP.

## Notes d'implémentation

- Backend : `wizard_drafts` (id, user_id, key, step, data json, timestamps) avec contrainte unique `(user_id, key)`. Routes sous `/api/me/wizard-drafts/{key}` (GET/PUT/DELETE) + `GET /api/me/wizard-drafts` pour le bandeau dashboard. `WizardDraftPolicy` enforce le scoping user_id. Cron `wizard-drafts:purge` à 03:30 (rétention 90j, override `--days`, support `--dry-run`).
- Frontend : `<WizardReprenable>` (générique, form-library agnostic), hook `useWizardDraft(key)` (autosave debounced 800ms, `flush()`, `clear()`), bandeau `<WizardDraftsBanner>` câblé sur `/app`. Les routes `key → href` de reprise sont centralisées dans `lib/wizard-drafts.ts` (`resolveWizardResume`) — chaque ticket consommateur (TCK-253/255/257/259/261/267) viendra y déclarer la sienne au besoin.
- Cross-user mutations : un PUT par un autre user crée silencieusement une nouvelle ligne pour ce dernier (la contrainte unique sur `(user_id, key)` protège l'original). Vérifié par `WizardDraftCrossUserAccessTest`.
- 16 tests backend (52 assertions) + 14 tests frontend (3 fichiers) verts. Build Next.js OK.
