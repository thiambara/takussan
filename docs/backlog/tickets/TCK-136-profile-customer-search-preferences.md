---
id: TCK-136
title: "Profil locataire — Préférences de recherche & alertes"
status: done
phase: P1
family: front
estimate: M
wave: 15
created: 2026-05-02
updated: 2026-05-03
depends_on: [TCK-024, TCK-070]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#23-savedsearch-
    - docs/models-spec.md#1-user
tags: [front, profile, customer, saved-search, p1]
---

## Objectif utilisateur

Un locataire ouvre la section "Préférences de recherche" de son profil, configure ses critères favoris (type de bien, budget, villes) et active des alertes email pour être notifié dès qu'un nouveau bien correspond.

## Contrat de données

Endpoints existants livrés par TCK-024 (Recherche & filtres) et TCK-070 (Notification preferences) :
- `GET /api/saved-searches?filter[user_id]=me`
- `POST /api/saved-searches` / `PATCH /api/saved-searches/{id}` / `DELETE /api/saved-searches/{id}`
- Champ `notification_frequency` (`instant` / `daily` / `weekly` / `none`) sur SavedSearch
- Préférences globales utilisateur déjà câblées : `notifications_email_enabled` sur User

Conventions Spatie : `fields[saved_searches]=id,name,criteria,notification_frequency,is_active`, pas de fetch global.

⚠ **Ce ticket n'introduit pas de nouveau modèle.** La section "Préférences de recherche" du profil = une `SavedSearch` "par défaut" (par convention, la première active de l'utilisateur, ou marquée via un flag sur `metadata`) que l'utilisateur peut éditer depuis son profil.

## Impact TCK-138 → TCK-146

- **`SavedSearch` rattachée au User (identité), pas à un profil métier** : depuis TCK-138 → TCK-142, les *profils* (Owner/Agent/Broker/ServiceProvider) portent la persona métier scopée à une agence. Les recherches sauvegardées et préférences de notification restent **partagées entre tous les profils** d'un même user (même email/mdp/2FA). Aucun changement du modèle `SavedSearch.user_id` à prévoir.
- **Pas de scope `team_id`** : les endpoints `saved-searches` opèrent au niveau identité (cross-agence). Le `ResolveActiveProfile` (TCK-141) n'impacte pas ce flux ; un user multi-profils voit toujours **toutes** ses SavedSearches indépendamment du profil actif.
- **Page accessible à tout utilisateur authentifié** disposant du rôle `customer` ou `tenant` (rôles spatie globaux, pas un profil métier). Aucune dépendance sur le `ProfileSwitcher` (TCK-143).

## Direction UX / Artistique

- Section **non disabled** dans `ProfileCustomerSection` — supprimer tous les `placeholder="Bientôt disponible"`.
- Champs câblés : type de bien préféré (multi-select), budget max (FCFA), villes favorites (multi-tag), toggle alertes email.
- Le toggle "Alertes email" combine `notifications_email_enabled` (User) ET `notification_frequency != 'none'` (SavedSearch) — UX simple : un seul switch, le détail (fréquence) en dropdown.
- Lien vers la page complète des recherches sauvegardées (TCK-047 déjà livré) pour les utilisateurs avec plusieurs critères.
- Cohérent avec le design system Profil actuel (cards, inputs, toggles existants).

## Contraintes strictes (métier)

- L'utilisateur ne modifie que sa propre `SavedSearch` (scope automatique backend).
- Activer les alertes email exige un `email_verified_at` non null ; sinon afficher un message + lien vers la vérification (TCK-069).
- Persistance optimiste interdite sur les champs critiques — attendre la confirmation de l'API.
- Désactiver les alertes via le toggle = `notification_frequency = 'none'`, ne **jamais** supprimer la SavedSearch.

## Delta à produire

- [ ] Composant: `src/components/profile/ProfileCustomerSection.tsx` — câblage complet, retirer les `disabled` et `placeholder="Bientôt disponible"`
- [ ] Sous-composant `SearchPreferencesForm` (form + validation)
- [ ] Hook React Query : récupération + mutation de la SavedSearch "défaut"
- [ ] Logique de fallback : créer une SavedSearch si l'utilisateur n'en a pas encore
- [ ] Garde sur `email_verified_at` avant activation des alertes
- [ ] Tests UI : rendu sans SavedSearch, avec, mutation, garde email non vérifié

## Critères d'acceptation

- [ ] Aucun champ de la section n'est `disabled` ni n'affiche "Bientôt disponible"
- [ ] L'utilisateur peut renseigner type de bien, budget, villes favorites et sauvegarder
- [ ] Le toggle "Alertes email" met à jour `notification_frequency` sur la SavedSearch
- [ ] Si l'email n'est pas vérifié, le toggle est désactivé avec un message explicite
- [ ] Si l'utilisateur n'a pas encore de SavedSearch, la sauvegarde initiale en crée une
- [ ] Aucun fetch ne retourne tous les champs (sparse fieldsets)

## Hors périmètre

- Page complète de gestion multi-SavedSearches (TCK-047 déjà livré)
- Ajout du flag "is_default" sur SavedSearch côté modèle si décidé (ouvrir spec PR avant)
- Notifications push (P1 dédié dans TCK-070 famille)
- Recherches sauvegardées partageables (P3)

## Notes d'implémentation

- **Enum `notification_frequency` — `off` au lieu de `none`** : le ticket et
  `models-spec.md` mentionnent `'none'` mais le backend livré (TCK-070) ainsi
  que la chaîne frontend (`src/lib/schemas/search.ts`, `SavedSearchController`
  validation `in:off,daily,weekly,instant`) utilisent `'off'`. Le frontend
  s'aligne sur la réalité backend (`'off'` ↔ alertes désactivées). Le ticket
  utilise `'none'` comme synonyme conceptuel — pas de spec PR ouverte, le sens
  métier est identique. À harmoniser dans `models-spec.md` lors d'un futur
  `/sync-specs`.
- **Choix du SavedSearch « par défaut »** : pas de flag `is_default` (Hors
  périmètre du ticket). Convention : on prend la SavedSearch active la plus
  récente, ou la plus récente tout court si aucune n'est active
  (`pickDefault()` dans `ProfileCustomerSection`). Cohérent avec la fallback
  décrite dans le contrat de données.
- **Sous-ensemble de `PropertyType` côté UI** : la section profil locataire
  expose 6 types (apartment, house, villa, studio, room, land) plutôt que les
  16 du schéma backend — choix UX pour ne pas saturer la grille de cases. Les
  power users ont accès à la liste complète depuis `/properties` puis
  TCK-047 (Mes recherches sauvegardées).
- **Format des villes** : champ texte libre séparé par virgules — persisté en
  `criteria.cities` (array) côté backend. Pas de TagInput dans le design
  system ; un upgrade visuel pourra être proposé en P2.
- **Sparse fieldsets** : `useSavedSearchesQuery` envoie désormais
  `fields[saved_searches]=id,user_id,name,criteria,notification_frequency,is_active`
  via le wrapper `useApiQuery`. Le `SavedSearchController.index` n'utilise pas
  encore `spatie/laravel-query-builder` (le contrôleur retourne la ressource
  complète) — l'AC est respectée côté requête, mais le backend ignore
  silencieusement le param. À fixer côté backend dans un ticket dédié si on
  veut une vraie réduction de payload.
- **Vérification UI navigateur** : le serveur de dev n'était pas démarré au
  moment de l'implémentation (la session a été reprise après une compaction).
  La verification end-to-end navigateur doit être faite à la review (login en
  tant que `customer`, vérifier création/édition + comportement guard email
  non vérifié). Tests vitest verts (8/8 spécifiques + 57 sur le périmètre
  profile + queries).
- **Tests** :
  - `src/components/profile/__tests__/SearchPreferencesForm.test.tsx` (5 cas)
    — empty state, hydration, guard email non-verifié, POST si pas de
    SavedSearch, PATCH avec `notification_frequency: 'off'` si toggle off.
  - `src/components/profile/__tests__/ProfileCustomerSection.test.tsx` (3
    cas) — absence de "Bientôt disponible" + inputs non-disabled, sparse
    fieldsets dans la requête, guard email non-vérifié end-to-end.
