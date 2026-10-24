---
id: TCK-2036
title: "« Publiés » de la liste des biens compte la règle du catalogue, par un filtre `filter[public]=1` de `/api/properties`"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-198--un-même-mot-compté-par-des-règles-différentes-d-un-écran-à-l-autre"
tags: [api, front, biens, tableau-de-bord, pistes]
---

## Objectif utilisateur

Dans l'espace d'agence, « publiés » dit la même chose partout : la tuile « Publiés » de
`/app/properties`, la liste qu'elle ouvre et l'avertissement « numéro non vérifié […] pas affiché
sur vos annonces » comptent les biens en ligne au sens du catalogue, comme l'accueil d'agence
(`Property::public()`, TCK-1115). Un bien loué, vendu, en maintenance, en revue ou refusé resté
`visibility = public` n'y est plus compté.

## Contexte

Réf : **P198.03** du fichier de pistes. La tuile comptait `filter[visibility]=public` seul, son
lien ouvrait `visibility=public`, et l'avertissement lisait ce compte.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : la recommandation du délégué ; même filtre que P167.07

Recommandation du délégué recopiée de l'entrée : « un filtre neuf de `/api/properties` qui exprime
`Property::public()` (par exemple `filter[published]=1`), lu par la tuile « Publiés », son lien et
l'avertissement de numéro non vérifié, plutôt que renommer la tuile ».

## Hypothèses (mode sans humain)

- « Même filtre que P167.07 » : la décision de P167.07 nomme `filter[public]=1` (callback sur
  `scopePublic`) ; c'est ce nom qui est pris, pour que la console le lise tel quel.
- Une valeur fausse ou autre que vraie (`0`, `false`) ne filtre pas : seule la demande « publiés »
  a un sens.
- Le lien de la tuile porte `public=1` ; la page le relaie à l'API. Aucun contrôle neuf n'est
  ajouté aux filtres de la liste (la décision ne le demande pas).

## Delta à produire

- [x] API : filtre `public` de `Property::getAllowedQueryFilters()` (callback sur `scopePublic`).
- [x] Front : `DashboardPropertyFilters.public`, relayé par `buildListParams` ; la tuile compte
  `filter[public]=1`, ouvre `public=1` et y est active ; l'avertissement lit ce compte.
- [x] Gardes : `PropertyCrudTest::test_p198_03_filter_public_suit_la_regle_du_catalogue`,
  `publies.tck-2036.test.tsx` ; `tuiles.tck-1289.test.tsx` suit le nouveau lien.

## Critères d'acceptation

- [x] AC1 — `GET /api/properties?filter[public]=1` rend les seuls biens que `Property::public()`
  retient : ni un bien `rented` public, ni un bien privé, ni un bien sans `published_at`.
- [x] AC2 — la tuile « Publiés », son lien et l'avertissement de numéro non vérifié lisent ce filtre.

## Hors périmètre

- La tuile de la console (P167.07, autre angle) : elle peut lire le même filtre.

## Notes d'implémentation

- Reproduit sur `96d942893` : `filter[public]=1` → 400 (filtre inconnu) ; la page comptait par
  `filter[visibility]=public`.
- Ablation : `Property.php` remis → rouge (`400 is identical to 200`) ; `page.tsx` et
  `properties-server.ts` remis → les trois tests front rouges ; rétabli → verts.
