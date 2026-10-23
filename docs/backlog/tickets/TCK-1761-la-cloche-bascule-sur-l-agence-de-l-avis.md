---
id: TCK-1761
title: "Un avis de la section d'agence porte son agence, et la cloche bascule sur son profil avant de l'ouvrir"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-161--cibles-de-notification-qui-ouvrent-un-écran-fermé-au-destinataire"
tags: [back, front, notifications, multi-agence, pistes]
---

## Contexte

Réf : **P161.04** du fichier de pistes, `validé` (validation en bloc du porteur).

Une cible de notification ne portait qu'un `kind` et un `id`, et la cloche suivait `target.path`
sans changer de profil. Les pages de la section d'agence (`/app/agency/finances`, `audit`, `kyc`,
`team`, `roles`, `moderation…`, et l'onglet des reversements de `/app/payments`) lisent l'agence du
profil actif : un admin de deux agences qui ouvrait l'avis de B sous le profil de A lisait les
données de A, sans signe d'erreur.

## Décision du porteur

> validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué que la validation reprend : une clé `agency_id` dans le JSON `target`
des seules notifications émises pour une agence, sans colonne, et la cloche qui bascule sur le
profil de cette agence avant de suivre le lien quand il diffère du profil actif, sans lien quand
le destinataire n'y a plus de profil.

## Choix de l'implémenteur (voies laissées ouvertes)

- **Bascule silencieuse ou annoncée** : la bascule passe par le changement d'espace existant
  (`useSwitchActiveProfile`), qui annonce déjà « espace changé » par son toast. Aucun texte neuf.
- **Quels avis portent l'agence** : les seules cibles **de liste** de la section d'agence, dont la
  page lit le profil actif — `finances`, `payouts`, `payout_approvals`, `team`, `role_delegations`,
  `agency_kyc`, `agency_settings`, `audit`, `review_moderation`, `property_moderation`. C'est la
  voie la plus étroite : une cible à identifiant (`lease`, `booking`…) part aussi au locataire ou au
  client, qui n'a pas de profil dans l'agence ; la lui poser lui retirerait son lien.
- **Quel profil prendre** dans l'agence : l'admin d'abord, puis agent, propriétaire, prestataire.

## Delta produit

- [x] `NotificationTarget` : `agencyId`, `forAgency()`, la clé `agency_id` dans `toArray()` (absente
  sans agence : la forme d'avant est inchangée), relue par `fromArray()`.
- [x] Les émetteurs des cibles ci-dessus posent l'agence (relevé, reversement, délégation,
  dossier KYC, bien, avis, activité, agence du seuil).
- [x] Front : `NotificationTarget.agency_id` ; `LienDansLAgence`, rendu par `NotificationRow` quand
  la cible porte une agence : bascule puis `router.push`, pas de lien sans profil dans l'agence,
  pas de navigation si la bascule échoue.

## Critères d'acceptation

- [x] AC1 — une cible rattachée rend et relit `agency_id` ; une cible sans agence garde sa forme.
- [x] AC2 — `GET /api/notifications` rend `target.agency_id`.
- [x] AC3 — l'import d'un relevé et les avis de délégation portent l'agence de leur objet.
- [x] AC4 — avis de B ouvert sous A : bascule sur le profil d'admin de B, puis la page ; avis de
  l'agence active : lien simple ; sans profil dans l'agence : pas de lien ; bascule refusée : pas
  de navigation.

## Reste à faire

- Les cibles à identifiant (`lease`, `booking`, `maintenance`…) ne portent pas l'agence : ce que
  leurs pages chargent sous le profil d'une autre agence reste à vérifier (le constat le laissait
  « à vérifier »).

## Notes d'implémentation

- Tests : `NotificationTargetAgencyTest` (4) et `NotificationRow.agence.test.tsx` (4), écrits avant
  le correctif → 4 et 3 rouges.
- Ablation : clé `agency_id` retirée de `toArray()` → 4 rouges ; `LienDansLAgence` court-circuité
  dans `NotificationRow` → 3 rouges ; correctif remis → verts.
- `LienDansLAgence` est un composant à part pour que `NotificationRow` sans agence ne demande ni
  `QueryClient` ni routeur : ses tests existants n'ont pas bougé.
