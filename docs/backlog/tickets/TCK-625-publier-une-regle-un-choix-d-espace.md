---
id: TCK-625
title: "Devenir publicateur : /publish lâchait les comptes multi-agences sur un /app qui ne lisait rien, « Professionnel » était sans effet et le message de fin annonçait un brouillon inexistant"
status: doing
phase: P1
family: front
estimate: M
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: [TCK-254, TCK-255, TCK-624]
blocks: []
spec_refs:
  features:
    - docs/features.md
  models: []
tags: [front, publication, onboarding, hote, profils, navigation]
---

## Objectif utilisateur

- **Toute personne qui clique « Publier »** : arriver au formulaire du bien dans le bon espace, ou
  à l'assistant qui en crée un, sans détour ni promesse fausse.

Plan d'ensemble : [`docs/plans/2026-10-10-parcours-entrer-publier.md`](../../plans/2026-10-10-parcours-entrer-publier.md).

## Contexte (relevé le 2026-10-10)

- `usePublishIntent` comptait les agences par `user.agency_id` (nul dès deux agences, TCK-142) et
  par les seuls profils `agent` : le propriétaire et l'admin multi-agences n'étaient pas vus.
  Plusieurs agences → `/app?selectProfile=true&next=/publish`, que rien ne lisait.
- `lib/publish-intent.ts` : `hasPublishIntent` n'était lu nulle part ; le retour d'OAuth porte déjà
  la destination.
- Menu mobile : « Vendre » et « Publier une annonce » vers la même page.
- `/app` d'un client : aucune entrée pour devenir hôte.
- Assistant hôte : « Professionnel » renvoyait au support par courriel et menait au même endroit
  que « Particulier » ; le toast annonçait « votre premier bien est en brouillon » — l'API ne crée
  aucun bien.

## Décision

1. **Une règle** (`decidePublishIntent`) : un espace = une agence où l'on porte un profil
   `agency_admin`, `agent` ou `owner` (le plus capable retenu). Aucun → assistant hôte ; un →
   formulaire, après bascule du profil actif s'il est ailleurs ; plusieurs → **choix de l'espace
   sur `/publish`** (`switchActiveProfile`, puis le formulaire).
2. Retirés : `lib/publish-intent.ts` et ses appels, « Vendre » du menu mobile (`nav.links.sell`).
3. `/app` d'un client : « Publier un bien » → `/publish`.
4. Assistant hôte : « Professionnel » crée l'espace puis mène à `/app/settings/agency/upgrade`
   (la demande d'agence vérifiée par l'équipe) ; les messages de fin disent ce qui s'est passé.

## Critères d'acceptation

- [x] Plusieurs agences → `choose-space`, sans cible ; un espace avec un profil actif ailleurs →
      bascule vers le profil de l'espace ; un hôte (admin + propriétaire) n'a qu'un espace, sous
      son profil admin (`usePublishIntent.test.ts`).
- [x] « Vendre » n'est plus dans le menu mobile ; « Publier une annonce » mène à `/publish`
      (`Navbar.recherche.test.tsx`).
- [x] Un client et un locataire voient « Publier un bien » → `/publish` (`AppSidebar*.test.tsx`).
- [x] « Professionnel » mène à la demande d'agence (rouge sans le correctif) ; « Particulier » au
      premier bien, sans promettre de brouillon (`HostIndividualWizard.test.tsx`).

## Hors périmètre

- Ne pas redemander les CGU à qui les a déjà acceptées : aucune acceptation n'est gardée (cf. le
  plan, « Preuve d'acceptation des CGU »).

## Vérification

- vitest : `hooks`, `components/{home,layout,onboarding}`, `data`, `app/{publish,onboarding}` —
  verts. `tsc`, ESLint sur les fichiers touchés, `check:i18n` : verts.
