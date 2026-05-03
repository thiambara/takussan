---
id: TCK-137
title: "Profil contact — Édition téléphone (champ aujourd'hui désactivé)"
status: review
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

- **Backend reset de `phone_verified_at`** : le ticket annonçait le reset
  comme "déjà géré" par TCK-069 — il ne l'était pas. Ajouté dans
  `AuthController::updateProfile` : si `phone` est dans la requête et
  diffère de la valeur courante, `phone_verified_at` est posé à `null`
  dans la même mise à jour. Validation E.164 stricte
  (`^\+[1-9]\d{6,14}$` accepte aussi la chaîne vide pour effacer le
  numéro) ajoutée dans `UpdateProfileRequest`.
- **Pas d'endpoint dédié `PATCH /api/me`** : le ticket mentionnait
  `PATCH /api/me` ou `/api/users/{id}`, mais le frontend utilise déjà
  `POST /api/auth/profile` (avec `_method=PUT`) hérité de TCK-013. Pour
  rester cohérent avec les autres champs profil (first_name, bio,
  avatar), on étend ce même endpoint plutôt que d'introduire une route
  parallèle. À harmoniser dans `models-spec` / `features.md` lors d'un
  futur `/sync-specs`.
- **Flow OTP inline plutôt que lien** : le ticket dit "réutiliser le
  composant déjà livré par TCK-069". On réutilise les *server actions*
  (`phoneSendOtpAction`, `phoneVerifyOtpAction`) sans redupliquer
  `PhoneVerificationSection`. Le flow OTP est inline dans la section
  Coordonnées (bouton "Vérifier" → input 6 chiffres + "Confirmer"). La
  section Sécurité conserve son propre `PhoneVerificationSection`
  inchangé pour les utilisateurs qui passent par cet onglet.
- **Pas de `<form>` imbriqué** : le bouton de confirmation OTP est un
  `type="button"` (avec gestion `Enter` via `onKeyDown`) pour éviter une
  soumission parasite du formulaire parent (HTML interdit l'imbrication
  de `<form>`).
- **Sparse fieldsets (AC6)** : la section ne déclenche aucun GET — le
  user est passé en prop par la page server (`getMeAction`) puis mis à
  jour localement à partir de la réponse de la mutation. La mutation
  renvoie déjà le `UserResource` à jour, donc pas besoin de refetch.
  L'AC est respecté à l'échelle de la section ; le `getMeAction` global
  reste hors périmètre (existant et hors-scope).
- **Helper `isE164` autonome** : pas de `libphonenumber-js` ajouté pour
  garder le bundle léger. Le regex E.164 strict suffit côté UX (la vraie
  source de vérité reste le backend). Le `phoneSchema` permissif déjà
  présent dans `lib/schemas/common.ts` est conservé tel quel pour les
  formulaires d'inscription qui acceptent encore les formats locaux.
- **Tests** :
  - Backend : 5 nouveaux cas dans `AuthProfileTest`
    (E.164 valide, regex 422, reset sur change, no-reset si valeur
    inchangée, clear via chaîne vide) — total 11/11 passants.
  - Frontend : `ProfileContactSection.test.tsx` — 8 cas (no
    placeholder, live error E.164, save POST avec champ phone, badge
    "Non vérifié" après reset, OTP inline confirmation, sync
    `useAuth().setUser` après save, sync `useAuth().setUser` après
    OTP verify, masquage du bloc "Vérifier" tant que l'édition n'est
    pas sauvée). 34/34 passants sur le périmètre profile.
- **Cross-section sync via `useAuth().setUser`** : après une sauvegarde
  réussie ou une vérification OTP, on appelle `setUser(...)` sur le
  contexte d'auth pour propager le nouveau `phone` /
  `phone_verified_at` à `ProfileSecuritySection` (qui lit via
  `useAuth()`) sans recharger la page. Constaté en smoke test : avant
  ce fix, la carte « Vérification du téléphone » affichait l'ancien
  numéro jusqu'au prochain reload.
- **Vérification UI navigateur** : effectuée — édition + sauvegarde,
  format invalide (alert live + bouton désactivé), envoi OTP (debug
  code visible), saisie + confirmation OTP → badge « Vérifié »
  immédiat, persistance après reload, propagation cross-section vers
  la Sécurité. Aucune erreur console.
