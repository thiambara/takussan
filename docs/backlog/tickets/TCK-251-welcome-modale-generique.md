---
id: TCK-251
title: "Welcome modale générique — composant 3 slides skippable"
status: done
phase: P1
family: front
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: []
blocks: [TCK-253, TCK-257, TCK-259, TCK-261, TCK-265]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
tags: [front, onboarding, design-system, p1]
---

## Objectif utilisateur

Offrir aux utilisateurs nouvellement onboardés un **welcome contextualisé** (3 slides max, skippable) qui présente les capacités principales de leur rôle, vu une seule fois et tracé pour ne pas être redéclenché.

## Contrat de données

Endpoint pour tracer le visionnage :

- `POST /api/me/welcome-seen` — body `{ key: string }`. Marque comme vu.
- `GET /api/me/welcome-seen` — renvoie la liste des keys déjà vues.

Stockage : nouvelle table `welcome_views` (id, user_id, key, seen_at). Une entrée par `(user_id, key)`.

## Direction UX / Artistique

Modale plein écran (mobile) ou centrée (desktop) avec : illustration au-dessus, titre court, 1-2 phrases de body, indicateur de progression (3 points), bouton "Suivant" et lien "Passer". Slides paramétrables par parcours (Customer / Host / Owner / Agent / AgencyAdmin / ServiceProvider / Tenant). Pas d'auto-play. La modale ne se déclenche **jamais** si la key est déjà dans `welcome_views`.

## Contraintes strictes (métier)

- Strictement scoped par user.
- La modale ne bloque pas l'usage de l'app — elle peut être fermée (`Esc`, lien "Passer", clic en dehors).
- Le contenu des slides est défini côté frontend (i18n via lang/) — pas stocké en base.
- Si le user est sur mobile et la modale est en cours, la rotation d'écran ne perd pas l'état.

## Delta à produire

- [x] Migration : `create_welcome_views_table` (id, user_id, key, seen_at, unique sur `(user_id, key)`)
- [x] Modèle : `App\Models\WelcomeView`
- [x] Controller : `App\Http\Controllers\WelcomeViewController` (POST/GET)
- [x] Tests backend : `tests/Feature/WelcomeView/` (idempotence, scoping)
- [x] Composant frontend `<WelcomeModal>` réutilisable : props `key`, `slides[]` (illustration, titre, body), `onComplete`
- [x] Hook `useWelcomeOnce(key)` : déclenche la modale si non vue, marque comme vue à completion ou skip
- [x] i18n : strings communes ("Suivant", "Passer", "Bienvenue") dans lang/

## Critères d'acceptation

- [x] AC1 — Au premier déclenchement, la modale s'affiche ; après skip ou completion, elle ne réapparaît plus.
- [x] AC2 — `Esc` ferme la modale et marque comme vue.
- [x] AC3 — Une key vue par un user n'apparaît pas dans la table d'un autre user (scoped).
- [x] AC4 — Strings localisées en FR, EN, WO.

## Hors périmètre

- Contenu des slides par parcours — porté par chaque ticket consommateur (TCK-253, etc.).
- Re-déclenchement programmatique via "Aide" du menu — possible évolution future.

## Notes d'implémentation

**Backend** :
- Migration `2026_05_10_140000_create_welcome_views_table` (id, user_id FK cascade, key string(64), seen_at timestamp, unique sur `(user_id, key)`, pas de timestamps).
- `App\Models\WelcomeView` étend `AbstractModel`, `$timestamps = false`, cast `seen_at` → datetime, BelongsTo `user`.
- `WelcomeViewController` (POST/GET) sous `routes/api/me.php` group `auth:sanctum`.
- `StoreWelcomeViewRequest` valide `key` requis, max 64, regex `/^[A-Za-z0-9._:-]+$/` (même charset que les keys de `wizard-drafts`).
- Idempotence via `firstOrCreate(['user_id','key'])` → 201 si nouveau, 200 si replay.

**Frontend** :
- `<WelcomeModal>` (`src/components/welcome/WelcomeModal.tsx`) : props `open`, `slides[]`, `onComplete`, `onSkip`. Mobile fullscreen / desktop centered, 3 dots de progression, Esc + click outside + bouton close → tous traités comme skip via `Dialog.onOpenChange`.
- `useWelcomeOnce(key, slides)` (`src/hooks/useWelcomeOnce.ts`) : skippé si user anonyme, GET `/api/me/welcome-seen` au mount, ouvre la modale si `key` absente, POST le `key` à completion ou skip (idempotent via ref local + serveur), retourne `{ open, slides, onComplete, onSkip }` à spread dans `<WelcomeModal>`.
- Proxy Next : `src/app/api/me/welcome-seen/route.ts` (GET + POST), même pattern que le proxy `wizard-drafts`.
- i18n : namespace `welcome` (welcome / next / skip / finish / stepAriaLabel / dialogAriaLabel) ajouté dans `messages/{fr,en,wo}.json`.
- Tests Vitest : `useWelcomeOnce.test.tsx` (anonyme = no-op, ouverture conditionnelle, POST à completion, dédup skip+complete) — 5 cas verts.

**Tests backend** : `tests/Feature/WelcomeView/WelcomeViewTest.php` (auth, empty pour user neuf, store + index round-trip, idempotence, scoping cross-user, validation 422 sur key vide / espaces / >64 / charset interdit, charset accepté incluant `._:-`) — 7 cas verts.
