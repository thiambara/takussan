---
id: TCK-251
title: "Welcome modale générique — composant 3 slides skippable"
status: todo
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

- [ ] Migration : `create_welcome_views_table` (id, user_id, key, seen_at, unique sur `(user_id, key)`)
- [ ] Modèle : `App\Models\WelcomeView`
- [ ] Controller : `App\Http\Controllers\WelcomeViewController` (POST/GET)
- [ ] Tests backend : `tests/Feature/WelcomeView/` (idempotence, scoping)
- [ ] Composant frontend `<WelcomeModal>` réutilisable : props `key`, `slides[]` (illustration, titre, body), `onComplete`
- [ ] Hook `useWelcomeOnce(key)` : déclenche la modale si non vue, marque comme vue à completion ou skip
- [ ] i18n : strings communes ("Suivant", "Passer", "Bienvenue") dans lang/

## Critères d'acceptation

- [ ] AC1 — Au premier déclenchement, la modale s'affiche ; après skip ou completion, elle ne réapparaît plus.
- [ ] AC2 — `Esc` ferme la modale et marque comme vue.
- [ ] AC3 — Une key vue par un user n'apparaît pas dans la table d'un autre user (scoped).
- [ ] AC4 — Strings localisées en FR, EN, WO.

## Hors périmètre

- Contenu des slides par parcours — porté par chaque ticket consommateur (TCK-253, etc.).
- Re-déclenchement programmatique via "Aide" du menu — possible évolution future.

## Notes d'implémentation

_(à remplir par implementing-specs)_
