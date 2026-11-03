---
id: TCK-1211
title: "Le nom et le slug d'un espace créé sans question s'écrivent dans la langue de la plateforme"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-85--ce-que-le-site-public-montre-d-une-agence-individual"
tags: [back, onboarding, agence, i18n, pistes]
---

## Objectif utilisateur

Le nom public d'un espace individuel créé par « Publier » est le même pour tous les visiteurs,
« Espace de {prénom} », quelle que soit la langue de son titulaire.

## Contexte

Réf : **P85.03** du fichier de pistes, `validé` (critère V7 accordé).

Mesuré avant correctif (`pre-dev` fbb8fc003, test de garde ci-dessous) : `POST
/api/host/individual/auto-onboard` pour Awa, `preferred_language = en` → `name = "Space of Awa"` ;
le slug en dérive (`uniqueSlug($name)`). `docs/features.md` § 1.12 écrit « Espace de {prénom} »,
sans parler de langue.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la piste propose deux voies sans en recommander une — un libellé composé à
l'affichage par le front (le prénom seul en donnée), ou un nom fixe dans la langue de la
plateforme. **La plus étroite est la seconde** : ni colonne, ni changement d'API, ni texte neuf, et
c'est la forme que la spec écrit déjà. C'est aussi la recommandation du délégué (2026-10-20). Le
nom reste modifiable par l'hôte ; les espaces existants ne sont pas réécrits (ce serait du V4).

## Hypothèses (mode sans humain)

- « La langue de la plateforme » est `fr` : `config('app.locale')` vaut `en` par défaut et ne la
  dit donc pas ; la spec l'écrit en français. Une constante `AUTO_SPACE_LOCALE = 'fr'` la porte.
- Les clés `onboarding.auto_space.*` de `lang/en` et `lang/wo` ne sont plus lues par ce chemin ;
  elles ne sont pas retirées (hors du delta minimal).

## Delta à produire

- [x] `HostIndividualOnboardingService::autoSpaceName()` traduit en `fr`, plus dans la langue du
  compte.
- [x] Test dans `tests/Feature/Onboarding/HostAutoOnboardTest.php`.

## Critères d'acceptation

- [x] AC1 — un compte `en`, puis `wo`, reçoit « Espace de Awa », slug `espace-de-awa…`.
- [x] AC2 — sans prénom, un compte `en` reçoit « Mon espace ».

## Hors périmètre

- Les espaces déjà créés (aucune réécriture de données).
- L'annuaire public des agences individuelles (P85.04).

## Notes d'implémentation

- Ablation : service rendu à `fbb8fc003` → 1 rouge (`'Space of Awa'`) ; remis → 14 verts.
- Classes voisines vertes : `HostIndividualOnboardingTest`, `SpaceCreatedEventTest`,
  `AgencySlugAfterUpgradeTest`, `GeneratedAgencySlugCountsDeletedAgenciesTest`.
