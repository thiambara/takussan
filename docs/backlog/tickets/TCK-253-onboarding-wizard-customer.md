---
id: TCK-253
title: "Onboarding wizard Customer — welcome modale + profil minimal différé"
status: done
phase: P0
family: front
estimate: S
wave: 29
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-251]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
tags: [front, onboarding, customer, p0]
---

## Objectif utilisateur

Le visiteur qui vient de s'inscrire sur Takussan voit un **welcome bref** qui lui présente les 3 capacités principales (recherche, favoris, messagerie), puis complète son profil minimal (téléphone, ville, type de recherche) au moment où il en a besoin — pas de friction au signup, friction utile à la 1ère action sensible.

## Contrat de données

Endpoint backend déjà existant pour mettre à jour le profil :

- `PATCH /api/me` — body partiel `{ phone?, city?, search_intent? }`. Les champs `city` et `search_intent` sont stockés dans `users.preferences` (JSON) si pas déjà colonnes dédiées (à valider en implémentation, sinon migration mineure).

Pas de nouvel endpoint requis — repose sur TCK-251 (welcome modale) et l'API user existante.

## Direction UX / Artistique

Welcome modale 3 slides : "Trouvez le bien parfait" / "Sauvegardez vos favoris" / "Discutez directement avec les agents". Skippable. Apparaît une seule fois (key `customer-welcome`).

Profil minimal différé : sheet/drawer qui s'ouvre quand le user déclenche **pour la 1ère fois** une action sensible (créer un favori, demander une réservation, contacter un agent). Le sheet propose : "Aidez-nous à mieux personnaliser vos résultats" + 3 champs optionnels + bouton "Plus tard". Vu une fois, il ne réapparaît plus (key `customer-profile-minimal`).

## Contraintes strictes (métier)

- Welcome ne bloque jamais l'usage.
- Profil minimal entièrement optionnel — l'action sensible se poursuit même si l'utilisateur clique "Plus tard".
- L'incentive doit rester non manipulatif (pas de dark pattern type "Êtes-vous sûr ?" sur le skip).
- Strings i18n FR/EN/WO via lang/.

## Delta à produire

- [ ] Page `/app/dashboard` (ou layout customer) : intégrer `<WelcomeModal>` (TCK-251) avec slides Customer
- [ ] Composant `<CustomerMinimalProfileSheet>` : sheet/drawer 3 champs, bouton "Plus tard"
- [ ] Hook `useTriggerMinimalProfileOnce()` : déclenche le sheet sur 1ère action sensible si key `customer-profile-minimal` non vue
- [ ] Wiring dans : favoris (`useFavoriteMutation`), demande réservation (`useBookingRequest`), contact agent (`useStartConversation`)
- [ ] i18n des 3 slides + sheet
- [ ] Tests frontend : déclenchement unique, skip non bloquant, persistance

## Critères d'acceptation

- [ ] AC1 — Au 1er login post-signup, la welcome modale s'affiche ; après skip/completion elle ne réapparaît plus.
- [ ] AC2 — Au 1er clic sur "Ajouter aux favoris" (par exemple), le sheet de profil minimal s'affiche ; la favorisation se déclenche en parallèle (pas de blocage).
- [ ] AC3 — Au 2e clic sur une action sensible, le sheet ne réapparaît plus.
- [ ] AC4 — Les valeurs saisies sont persistées sur `users.preferences` et utilisables par la recherche.

## Hors périmètre

- Personnalisation des résultats de recherche basée sur `search_intent` — autre ticket (suggestion / ranking).
- Welcome modale au signup OAuth (Google / Facebook / Apple) — comportement identique, déjà couvert par le hook unique.

## Notes d'implémentation

- **Backend** — Migration `add_preferences_to_users_table` ajoute une colonne JSON `preferences` distincte de `metadata` (qui est interne back-office). Nouveau contrôleur `Api\Me\MeController::update` exposé via `PATCH /api/me`, accepte `phone` (E.164), `city`, `search_intent` (enum `rent|buy|both`) — tous optionnels. Le contrôleur `PUT /api/auth/profile` existant n'est pas réutilisé car il exige `first_name`/`last_name`. `UserResource` expose `preferences` (objet vide si absent).
- **Frontend** — `<CustomerWelcomeWizard>` compose `<WelcomeModal>` + `useWelcomeOnce('customer-welcome', …)` (réuse intégrale TCK-251). `<MinimalProfileTriggerProvider>` monte le sheet une fois dans `AppShell` et expose `useTriggerMinimalProfileOnce()` via React context — appel no-op hors dashboard. Wiring dans `useFavorite` (add path uniquement), `useBookingRequest` et `useContactMessage`. Le sheet ne s'ouvre qu'une seule fois par session : `consumedRef` court-circuite les déclencheurs suivants même avant que le POST `welcome-seen` n'aboutisse.
- **i18n** — Namespace `customer.welcome.slides[0..2]` et `customer.minimalProfile.*` dans `messages/{fr,en,wo}.json`.
- **Tests** — Backend : `MeUpdateTest` (4 tests : patch partiel, fields supplémentaires intacts, validation enum, 401 anonyme). Frontend : `MinimalProfileTriggerProvider.test.tsx` (4 tests : ouverture, single-shot, gating non-customer, prefetch déjà-vu).
