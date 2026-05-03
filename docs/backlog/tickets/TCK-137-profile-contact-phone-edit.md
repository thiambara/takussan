---
id: TCK-137
title: "Profil contact — Édition téléphone (champ aujourd'hui désactivé)"
status: todo
phase: P1
family: front
estimate: S
created: 2026-05-02
updated: 2026-05-03
depends_on: [TCK-069]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [front, profile, phone, p1]
---

## Objectif utilisateur

L'utilisateur peut modifier son numéro de téléphone depuis l'onglet Contact de son profil, avec déclenchement de la vérification SMS/OTP existante (TCK-069), au lieu du champ actuellement désactivé avec libellé "Bientôt disponible".

## Impact TCK-138 → TCK-146

- **`phone` est sur User (identité), pas sur un profil métier** : depuis TCK-138 → TCK-142, `User` est l'identité authentifiée pure. Le téléphone (et `phone_verified_at`) reste sur la table `users` — partagé entre tous les profils. Aucun champ téléphone par profil n'est prévu.
- **Pas de scope `team_id`** : la mutation `PATCH /api/me` opère au niveau identité, indépendamment du profil actif. Aucune dépendance sur TCK-141 / TCK-143.
- **`users.type` et `users.agency_id` supprimés** : si la page lit le user via `fields[users]=...`, ne pas inclure ces colonnes (elles n'existent plus).

## Contrat de données

Champ déjà existant côté modèle (`User.phone`, `User.phone_verified_at`) et endpoints livrés par TCK-069 :
- `PATCH /api/me` ou `PATCH /api/users/{id}` pour mettre à jour `phone`
- `POST /api/me/phone/verify-request` (envoi OTP)
- `POST /api/me/phone/verify` (validation OTP)

Le frontend doit utiliser `fields[users]=id,phone,phone_verified_at` lors du `GET`. Validation côté frontend : format E.164 (avec helper international).

## Direction UX / Artistique

- Dans `ProfileContactSection.tsx`, retirer le `disabled` et le helper "Bientôt disponible" sur le champ Téléphone.
- Pattern d'édition cohérent avec les autres champs : input éditable + bouton "Enregistrer" (ou debounce + toast).
- Si le téléphone n'est pas vérifié : badge orange "Non vérifié" + bouton "Vérifier" qui ouvre le flow OTP existant.
- Si vérifié : badge vert + date de vérification.
- Indicateur de format invalide en live (E.164).
- Aucun StubPlaceholder visuel sur la section.

## Contraintes strictes (métier)

- Format **E.164** obligatoire (ex : `+221770000000`) — refus côté backend si invalide.
- Modifier le numéro **réinitialise** `phone_verified_at` à `null` côté backend (déjà géré, à confirmer dans TCK-069) — l'UI doit refléter ce reset immédiatement.
- Aucun OTP n'est consommé sans confirmation explicite de l'utilisateur (rate-limit à respecter côté backend).
- Le numéro reste privé et n'apparaît jamais dans une réponse publique.

## Delta à produire

- [ ] Composant: `src/components/profile/ProfileContactSection.tsx` — retirer `disabled` sur Phone + helper "Bientôt disponible"
- [ ] Validation E.164 (libcomposable existante ou `libphonenumber-js`)
- [ ] Câblage du flow OTP (réutiliser le composant déjà livré par TCK-069)
- [ ] État UI : non vérifié / en attente OTP / vérifié
- [ ] Tests UI : édition, format invalide, déclenchement OTP, vérification

## Critères d'acceptation

- [ ] Le champ téléphone n'est plus `disabled` ni accompagné de "Bientôt disponible"
- [ ] Saisir un numéro valide E.164 et enregistrer met à jour `User.phone`
- [ ] Saisir un format invalide affiche une erreur en live
- [ ] Modifier le numéro fait passer le badge en "Non vérifié"
- [ ] Cliquer "Vérifier" ouvre le flow OTP existant et persiste après validation
- [ ] Aucun fetch ne retourne tous les champs du user (sparse fieldsets)

## Hors périmètre

- Authentification par téléphone (login OTP — P3)
- Suppression du numéro (cas RGPD — ticket dédié)
- Numéros multiples par utilisateur (hors spec)

## Notes d'implémentation

_(à remplir par implementing-specs)_
