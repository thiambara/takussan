---
id: TCK-2043
title: "Statuts `inactive` et `suspended` du profil prestataire déclarés réservés"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-115--statuts-denum-quaucun-chemin-de-app-nécrit"
tags: [api, enums, service-providers, pistes]
---

## Contexte

Réf : **P115.04** du fichier de pistes, `validé` par le porteur (V7 accordé).
`ServiceProviderProfileStatus::Inactive` et `::Suspended` n'ont aucun écrivain dans `app/`
(re-mesuré le 2026-10-24 par `grep -rn "ServiceProviderProfileStatus" app database routes` : seuls
`Draft` et `Active` sont écrits, `Suspended` est lu par la seule garde de
`ServiceProviderOnboardingService:56`, `Inactive` jamais), alors que leur docblock les décrit comme
des états qui arrivent.

## Décision du porteur

validation du porteur (2026-10-23) : garder `inactive` et `suspended` marqués « Réservé » dans leur docblock et dans `CasDEnumReservesTest`, comme P115.07 (TCK-1307) ; badge seul côté front ; la ligne de `models-spec.md` s'aligne en session

## Objectif

Le code ne laisse plus croire qu'un profil prestataire devient `inactive` ou `suspended`, et la
garde de TCK-1307 rougit le jour où un chemin les écrit.

## Delta à produire

- [x] Docblock « Réservé (TCK-2043, P115.04) » sur `Inactive` et `Suspended`.
- [x] Les deux cas ajoutés à la liste de `tests/Unit/Architecture/CasDEnumReservesTest.php`.
- [x] Front : rien à changer. Mesuré : `ServiceProvidersList.tsx` ne leur donne qu'un badge, et
      aucun écran ne propose `filter[status]` sur la liste des prestataires
      (`grep -rn ServiceProviderProfileStatus src` : le type, le badge, et le paramètre facultatif
      `status` de `fetchServiceProviders`, qu'aucun appelant ne passe).

## Critères d'acceptation

- [x] AC1 — Les deux cas portent la marque « Réservé ».
- [x] AC2 — Une écriture neuve d'un de ces cas par la constante dans `app/` fait rougir la garde.

## Hors périmètre

- La ligne de `docs/models-spec.md` (§ 37) : le porteur l'aligne en session (spec fermée à
  l'implémenteur).
- Un geste de suspension d'un prestataire, ou la pose d'`inactive` : choix écartés par la décision.

## Notes d'implémentation

- Ablation : docblock d'avant remis → 1 rouge (`chaque cas réservé le dit`) ; fichier temporaire
  `['status' => ServiceProviderProfileStatus::Suspended]` dans `app/` → 1 rouge qui le nomme ;
  tout remis → 3/3 vert.
