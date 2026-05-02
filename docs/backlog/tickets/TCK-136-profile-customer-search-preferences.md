---
id: TCK-136
title: "Profil locataire — Préférences de recherche & alertes"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-02
updated: 2026-05-02
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

_(à remplir par implementing-specs)_
