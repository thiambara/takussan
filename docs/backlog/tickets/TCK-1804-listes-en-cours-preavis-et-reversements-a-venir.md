---
id: TCK-1804
title: "Petites listes « en cours » : le préavis arrête un second renouvellement et ouvre l'avis, les reversements « à venir » du bailleur comptent l'attente d'approbation"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#28-payout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-162--compteurs-et-sélecteurs--en-cours--écrits-par-une-liste-de-statuts-à-la-main"
tags: [api, front, leases, reviews, payouts, pistes]
---

## Contexte

Réf : **P162.07** du fichier de pistes, `validé`.

Quatre listes de statuts écrites à la main, chacune plus étroite que l'intention « en cours » :
`LeaseRenewalService::guardNoActiveChild` (sans `terminating`), `ReviewEligibility::LEASE_STATUSES`
(sans `terminating`), les reversements « à venir » de l'aperçu du bailleur (sans
`awaiting_approval`), et les baux lus par l'accueil du locataire (`active` seul).

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket »

Critère accordé : V7 (classement du mesureur). La recommandation du délégué, que l'entrée porte, est
suivie point par point :
1. `guardNoActiveChild` compte aussi `Terminating` ;
2. `ReviewEligibility::LEASE_STATUSES` lit `Terminating` aussi ;
3. les reversements « à venir » du bailleur ajoutent `awaiting_approval`, par une méthode de
   `PayoutStatus` plutôt qu'une liste du front ;
4. l'accueil du locataire reste à `active`, avec un commentaire qui le dit.

## Choix de l'implémenteur

- (1) relit `Lease::OPEN_STATUSES` (P162.03, TCK-1716 : en cours + attente de signature) plus
  `Draft`, ce qui rend exactement l'ancienne liste plus `terminating`.
- (3) « une méthode de `PayoutStatus` » que le front puisse lire passe par l'API : méthode
  `PayoutStatus::upcoming()` (`awaiting_approval`, `pending`, `scheduled`, `processing`), lue par un
  filtre `filter[upcoming]=1` de `GET /api/payouts` (callback de `customQueryFilters`, patron de
  `PropertyContactLead`), que la carte du bailleur demande à la place de `filter[status]`. Voie
  retenue parce que c'est la seule où le front ne recopie plus de liste ; elle n'ouvre aucune
  donnée neuve (le filtre restreint une liste déjà autorisée).

## Hypothèses (mode sans humain)

- L'état « parent `expired` ou `active` avec un renouvellement `terminating` » n'est pas atteint par
  le chemin ordinaire : `handOver` passe le parent à `renewed` dès qu'un enfant entre en vigueur
  (lu, `LeaseRenewalService.php`). La garde est donc défensive (données antérieures à VERIF-596,
  écriture hors service) ; elle est mesurée sur un état construit, pas reproduite par le parcours.

## Objectif

Les quatre sites disent la même chose que l'intention qu'ils servent, et le cas voulu (4) le dit.

## Delta à produire

- [x] `LeaseRenewalService::guardNoActiveChild` : `[...Lease::OPEN_STATUSES, Draft]`.
- [x] `ReviewEligibility::LEASE_STATUSES` : `Terminating` ajouté ; docblock de classe aligné.
- [x] `PayoutStatus::upcoming()` et filtre `filter[upcoming]` sur `Payout`.
- [x] `overview/owner/page.tsx` : `filter: { upcoming: 1 }` au lieu de la liste de statuts.
- [x] `leases-active-summaries.ts` : commentaire « `active` seul, voulu ».
- [x] Tests : `tests/Feature/Api/ListesEnCoursPreavisEtReversementsAVenirTest.php` (neuf),
      `overview/__tests__/bailleur.tck-595.test.tsx` (mis à jour).

## Critères d'acceptation

- [x] AC1 — Un parent `expired` dont le renouvellement est `terminating` refuse un second
      renouvellement (422 sur `parent`), et n'a toujours qu'un enfant.
- [x] AC2 — Un locataire dont le bail est `terminating` dépose un avis sur le bien (201).
- [x] AC3 — `GET /api/payouts?filter[upcoming]=1` rend, d'un bailleur, ses reversements
      `awaiting_approval`, `pending`, `scheduled` et `processing`, et aucun `completed`, `failed`
      ou `cancelled`.
- [x] AC4 — La carte « Prochains versements » demande `filter[upcoming]=1`, sans `filter[status]`.

## Reste à faire

- Néant pour la `Piste`.

## Hors périmètre

- `GET /api/public/properties/{slug}/review-eligibility` (`PublicPropertyController::reviewEligibility`)
  ne lit pas `ReviewEligibility` : il admet tout bail du locataire, quel qu'en soit le statut, et une
  visite terminée, alors que le dépôt de l'avis applique la règle. L'écran peut donc annoncer un avis
  que le dépôt refuse (bail `draft`, par exemple). Vu au passage, non corrigé.

## Notes d'implémentation

- Le premier test d'avis passait par l'écran public d'éligibilité, déjà vert avant correctif (voir
  « Hors périmètre ») : il vise désormais `POST /api/properties/{id}/reviews`, qui lit la règle.
- Ablation API : les quatre fichiers de `app/` remis à `cab732f6b` → 3 rouges (renouvellement passé,
  403 sur l'avis, 400 sur `filter[upcoming]`) ; correctif remis → 3 verts. Ablation front :
  `page.tsx` remis → 1 rouge (`filter[upcoming]` absent) ; remis → vert.
