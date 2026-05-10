---
id: TCK-253
title: "Onboarding wizard Customer — welcome modale + profil minimal différé"
status: todo
phase: P0
family: front
estimate: S
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

_(à remplir par implementing-specs)_
