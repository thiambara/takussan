---
id: TCK-765
title: "SMS : repli sur l'intégration de la plateforme, et localisateur d'intégrations oublié entre deux jobs"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-11--notifications--doublons-préférences-échecs"
tags: [back, sms, notifications, pistes]
---

## Contexte

Réf : **P11.06** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`IntegrationLocator::find()` ne cherche, pour un `agency_id` donné, que l'intégration de cette
agence : un professionnel mono-agence (dont `agency_id` est dérivé du profil) dépend du
fournisseur de son agence, quand un multi-agences (`agency_id` nul) passe par la plateforme.
ADR-0032 met le coût des SMS à la charge de la plateforme. Le localisateur est en outre un
`singleton` qui met en cache les résultats, nuls compris : dans le worker (`--max-time=3600`), une
intégration activée ou tournée met jusqu'à une heure à prendre effet.

## Décision du porteur

repli sur l'intégration plateforme ; scoped() au lieu de singleton()

## Objectif utilisateur

Un SMS part par le compte de la plateforme quand l'agence n'en a pas, et une intégration activée
sert dès le job suivant.

## Contraintes strictes

- L'intégration active de l'agence l'emporte sur celle de la plateforme.
- Les classes qui tiennent le localisateur par leur constructeur (routeur, pilotes Orange, Mtarget,
  LAfricaMobile, WhatsApp Cloud, puller Mtarget) passent en `scoped()` avec lui : un singleton qui
  le garde garderait son cache.

## Delta à produire

- [x] `IntegrationLocator::find()` : l'agence, puis la plateforme (`agency_id` nul).
- [x] `AppServiceProvider` : `scoped()` pour le localisateur et ses six consommateurs.
- [x] `tests/Feature/Services/Sms/IntegrationLocatorTest.php`.

## Critères d'acceptation

- [x] AC1 — Une agence sans intégration propre envoie par celle de la plateforme.
- [x] AC2 — L'intégration de l'agence, quand elle existe, l'emporte.
- [x] AC3 — Une intégration créée entre deux jobs (`forgetScopedInstances()`, ce que fait le worker)
      sert au job suivant.

## Hors périmètre

- `IntegrationLocator::flush()`, toujours sans appelant, reste.

## Notes d'implémentation

- **Ablation** : `singleton()` remis seul → AC3 rouge (`lafricamobile` au lieu d'`orange`) ;
  l'ancien `find()` remis seul → AC1 rouge (aucune intégration trouvée). Correctif remis : 3 verts.
- Le test existant `test_disabling_orange_integration_at_runtime_routes_to_lam` de `SmsRouterDriverTest` oubliait le localisateur
  à la main (`forgetInstance`) : il passait parce que le routeur relit l'intégration, alors que le
  pilote Orange singleton gardait l'ancien localisateur.
