---
id: TCK-143
title: "Frontend — Sélecteur de profil actif & contexte multi-profil"
status: done
phase: P0
family: front
estimate: M
wave: 16
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-141]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
tags: [front, profiles, auth, p0]
---

## Objectif utilisateur

Un utilisateur authentifié qui possède plusieurs profils métier (ex. propriétaire chez l'agence A et agent chez l'agence B) bascule explicitement entre ses profils depuis l'interface, et l'application réagit immédiatement : permissions, agence courante, libellés et raccourcis reflètent le profil sélectionné sans relogin.

## Contrat de données

Endpoints exposés par TCK-141 :

- `GET /api/me/profiles` — liste les profils du user authentifié (composite id `<type>:<id>`, `type`, `numeric_id`, `agency_id`, `agency`, `status`, `created_at`) + `meta.active_profile_id`, `meta.count`.
- `PATCH /api/me/active-profile` body `{ "profile_id": "agent:5" }` — pose un cookie httpOnly `active_profile_id` ; renvoie le profil sélectionné.
- Header `X-Profile-Id: <type>:<id>` honoré par toute requête authentifiée comme override prioritaire (au-dessus du cookie).

`GET /api/auth/me` continue d'exposer `roles`, `agency_id` (dérivé du profil actif). Toute mutation de profil actif **doit** déclencher un refetch de `/auth/me` côté client pour refléter les nouvelles permissions.

## Direction UX / Artistique

- **Switcher** : composant compact dans le header du layout `(dashboard)` — étiquette = libellé court du profil actif (ex. "Agent · Acme Immo"). Clic → menu déroulant listant tous les profils du user, regroupés par type (Owner / Agent / Broker / Service Provider) avec le nom de l'agence en sous-titre.
- **Indication visuelle du profil actif** : badge / coche dans le menu, et marqueur discret dans le header (couleur de l'avatar ou pastille de type).
- **Compte mono-profil** : pas de switcher (auto-bascule côté backend déjà appliquée) — afficher seulement le libellé statique pour cohérence.
- **Compte sans profil** (admins purs) : pas de switcher, libellé "Admin Takussan" (cf. layout super-admin TCK-145).
- **État de transition** : pendant le switch, masquer brièvement les KPIs / tuiles (skeleton) plutôt qu'afficher des données obsolètes.
- **Cohérent avec le design system Lin/Bricolage** (TCK-129).

## Contraintes strictes (métier)

- Le profil actif **détermine** les permissions affichées : aucun bouton / lien d'action ne doit s'afficher hors du scope du profil sélectionné. Toujours réconcilier l'UI avec `roles` après chaque switch.
- Le switch ne doit **jamais** envoyer un `profile_id` qui n'apparaît pas dans `GET /api/me/profiles` du user courant — sinon 403 backend.
- Toute requête API authentifiée portée par le client doit propager le cookie (mode `credentials: 'include'`) ou injecter l'en-tête `X-Profile-Id` ; ne jamais filtrer côté client après réception.
- Si le cookie est invalide / stale (profil supprimé), le backend l'ignore silencieusement — le client doit redemander `/me/profiles` au prochain mount pour resynchroniser.
- KYC et infos administratives sont **par profil** : l'écran de gestion de compte expose un onglet par profil, pas un formulaire unifié.

## Delta à produire

- [ ] Hook / query React Query : `useMyProfiles()` (GET) et `useSwitchActiveProfile()` (PATCH) avec invalidation/refetch de `/auth/me` au succès
- [ ] Composant `ProfileSwitcher` dans le header du layout `(dashboard)`
- [ ] Composant `ProfileBadge` (libellé + pastille type) réutilisable
- [ ] Section "Mes profils" dans la page de paramètres du compte — un onglet/carte par profil avec champs KYC propres (RIB, license, certifications selon le type)
- [ ] Adapter `getServerSession` / fetchers pour transmettre le cookie ou l'en-tête `X-Profile-Id` côté SSR
- [ ] Tests UI : rendu mono-profil (pas de switcher), rendu multi-profil, switch déclenche refetch, profil orphelin (cookie stale) reset
- [ ] Cohérence avec `NoAgencyState` (TCK-115) pour les admins purs

## Critères d'acceptation

- [ ] Un user avec un seul profil ne voit pas de switcher mais voit son libellé
- [ ] Un user multi-profil bascule en un clic ; l'agence courante (sidebar, KPIs, raccourcis) reflète le nouveau profil sans recharger la page
- [ ] Après un switch, `useQuery(['auth','me'])` est invalidé et les permissions affichées correspondent au nouveau scope
- [ ] Aucune action protégée par `team_id = profile.agency_id` n'apparaît dans l'UI après un switch vers un autre profil
- [ ] La page de paramètres du compte expose un onglet/section par profil avec ses champs KYC distincts
- [ ] Aucun appel client n'utilise `filter` côté client pour distinguer les profils (toujours `GET /api/me/profiles`)
- [ ] Un cookie `active_profile_id` invalide ne bloque pas l'app — l'utilisateur revoit son profil auto-basculé

## Hors périmètre

- Endpoints CRUD de gestion des profils (création, suppression — backend dédié à créer ultérieurement, géré par admin/agency_admin)
- Création d'un profil par un agency_admin (ex. recruter un agent) — ticket dédié à filer
- UI super-admin (TCK-145)
- Audit log de changement de profil (P2 — voir features.md §2.1)

## Notes d'implémentation

- **Proxy route handlers** `src/app/api/me/profiles/route.ts` et `src/app/api/me/active-profile/route.ts` : les hooks client (`useMyProfiles`, `useSwitchActiveProfile`) tapent ces endpoints same-origin pour que le cookie httpOnly `active_profile_id` posé par le backend Laravel transite naturellement (pas de cross-origin). Le proxy lit aussi le cookie et le réinjecte côté Next pour la cohérence entre la session SSR et la session client.
- **Cookie SSR forwarding** : `apiRequest` accepte désormais `activeProfileId?: string` qui pose `X-Profile-Id`. `getMe(token, activeProfileId?)` est appelé avec la valeur de `getActiveProfileId()` (cookie côté Next). Sans ça, le SSR `/auth/me` lisait toujours le profil auto-basculé et écrasait visuellement le profil choisi.
- **Active profile state** : volontairement non stocké dans `AuthContext` — la source de vérité est le cookie httpOnly + le re-fetch React Query de `['me','profiles']` et `['auth','me']`. `useSwitchActiveProfile.onSuccess` invalide les deux et appelle `refreshUser` pour synchroniser l'in-memory user avec les rôles dérivés du nouveau profil.
- **fields[]/include= obligatoires** : `fetchMyProfiles` construit toujours `fields[profiles]=…&fields[agencies]=…&include=agency` — pas de fan-out, pas de fetch all-fields (cf. CLAUDE.md).
- **Pas de switcher ≠ pas de label** : mono-profil rend un libellé statique pour signaler le contexte (cohérence visuelle), super_admin sans profil rend "Admin Takussan", autres sans profil rendent rien (l'app actuelle n'a pas encore de slot pour un onboarding "ajouter un profil" — TCK out-of-scope, créer un ticket si besoin).
- **Cookie stale** : si le cookie référence un profil supprimé, le backend l'ignore (TCK-141) et auto-bascule. Pas de logique côté client à ajouter — le `meta.active_profile_id` reflète l'état réel à chaque mount.
- **Tests UI** (`ProfileSwitcher.test.tsx`, 4 cas) : empty + no-roles → null, empty + super_admin → libellé, mono-profile → libellé statique, multi-profile → trigger + click + appel PATCH + refreshUser.
