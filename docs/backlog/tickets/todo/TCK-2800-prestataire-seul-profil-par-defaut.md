---
id: TCK-2800
title: "Un compte dont le seul profil actif est prestataire retrouve ce profil sans cookie : « Vos pièces » et l'espace ne sont plus vides après une connexion"
status: todo
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2614]
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#règle-4--active-profile-context"
tags: [back, profil-actif, prestataire, pieces, auto-bascule, suite-de-tck-2796, audit-ux, app]
---

## Objectif utilisateur

Un prestataire qui n'a qu'un profil se connecte et trouve, sur `/app/pieces`, la carte d'identité et l'assurance qu'il
doit fournir. Aujourd'hui, après n'importe quelle connexion, la page dit « Aucune pièce à fournir ».

## Constat (relevé du 2026-11-14, base de démo, GET seulement)

- Persona `prestataire` (`provider1@dakarimmo.sn`, un seul profil, `service_provider:1`) : `GET /api/me/profiles` rend
  `meta.active_profile_id: null`, `GET /api/me/pieces` rend `[]`. Avec `X-Profile-Id: service_provider:1`, l'API rend
  `cni` et `insurance` (relevé de l'agent de TCK-2796). Même chose pour `personas-prestataire-intervention`.
- Témoins : `proprietaire` et `agent` (un profil chacun, dans une agence) sont liés (`owner:1`, `agent:1`).
- **Cause** : le niveau 5 de `ResolveActiveProfile` (l'auto-bascule) ne lie un profil que si les profils actifs
  comptent **exactement une agence**. Un `ServiceProviderProfile` n'a pas d'`agency_id` (profil porté par le compte) : un
  compte prestataire seul compte **zéro** agence, et n'est jamais lié.
- **Les comptes réels sont touchés, pas seulement la démo** : la connexion efface le cookie `active_profile_id`
  (`takussan-web/src/app/api/auth/set-token/route.ts`, « so the resolver re-derives the scope »), la déconnexion aussi
  (`AuthController::logout`). Le dernier espace retenu (niveau 4) n'est écrit que par `PATCH /api/me/active-profile`,
  qu'aucun écran ne lance de lui-même ; un compte à un seul profil n'a rien à choisir. Seul le parcours d'accueil du
  prestataire pose le cookie — jusqu'à la connexion suivante.
- `docs/models-spec.md`, Règle 4, dit déjà « Auto-bascule si l'utilisateur n'a qu'un seul profil » : le code s'en écarte
  pour ce seul type.

## Delta

1. `ResolveActiveProfile`, niveau 5 : en plus de la règle mono-agence (inchangée), **un compte dont les profils actifs
   ne comptent aucune agence et qui n'en a qu'un** le voit lié. Aucun autre cas ne change : plusieurs agences → rien
   (sécurité explicite) ; un prestataire avec des profils dans une seule agence → le profil d'agence, comme avant
   (`first()` dans l'ordre bailleur, agent, admin, prestataire).
2. Les gardes d'agence ne bougent pas : le profil lié n'a pas d'agence, `User::agency_id` reste `null` pour ce compte.
   Le même profil était déjà liable par cookie ou par `X-Profile-Id` : la correction rend l'état par défaut égal à celui
   du parcours d'accueil.
3. Docblock du middleware et commentaire « mirrors » de `User::getAgencyIdAttribute()` mis à jour ; amendement daté
   d'[ADR-0004](../../../adr/0004-profil-actif-resolu-par-middleware.md).

## Critères d'acceptation
- [x] AC1 — Prestataire seul, actif, sans signal : le profil lié est le `ServiceProviderProfile`, sans agence.
  Ablation : retirer la nouvelle branche → rouge. — **Preuve** : `PrestataireSeulProfilParDefautTest`::test_un_prestataire_seul_est_lie_sans_ouvrir_d_agence ; ablation A1 (branche → `elseif (false)`) : 2 rouges.
- [x] AC2 — Prestataire seul **suspendu** : aucun profil lié. Ablation : retirer le filtre des profils actifs → rouge. — **Preuve** : `PrestataireSeulProfilParDefautTest`::test_un_prestataire_seul_suspendu_n_est_pas_lie ; ablation A2 (filtre actif retiré) : rouge.
- [x] AC3 — Prestataire + profils dans **deux** agences : aucun profil lié. Ablation : rendre la nouvelle branche
  inconditionnelle → rouge. — **Preuve** : `PrestataireSeulProfilParDefautTest`::test_un_prestataire_de_deux_agences_n_est_pas_lie ; ablation A3 (`elseif (count === 1)` → `else`) : rouge. La condition « aucune agence » est impliquée par « un seul profil » dans un `elseif` après la branche mono-agence : une seule condition, ablatée.
- [x] AC4 — Prestataire + un profil dans **une** agence : le profil d'agence est lié, pas le prestataire. — **Preuve** : `PrestataireSeulProfilParDefautTest`::test_un_prestataire_d_une_agence_garde_le_profil_d_agence.
- [x] AC5 — Prestataire seul : `User::agency_id` reste `null` et `GET /api/me/profiles` rend
  `meta.active_profile_id = service_provider:<id>`. — **Preuve** : même test que AC1 (`agency_id` null, `meta.active_profile_id`) ; base de démo après correctif : `service_provider:1` et `service_provider:20`.
- [x] AC6 — Prestataire seul, sans cookie : `GET /api/me/pieces` rend `cni` et `insurance`. — **Preuve** : `PrestataireSeulProfilParDefautTest`::test_vos_pieces_du_prestataire_seul_sans_cookie ; base de démo (GET) : `["cni","insurance"]` pour les deux personas prestataires, témoins bailleur/agent inchangés.
- [x] AC7 — Les tests existants de `ResolveActiveProfileTest` (dont « plusieurs profils, pas de choix arbitraire ») et
  `InactiveProfileGrantsNothingTest` restent verts. — **Preuve** : `tests/Feature/Middleware`, Auth, et les 43 fichiers qui fabriquent un `ServiceProviderProfile` : 415 verts.
