---
id: TCK-1313
title: "Un espace `individual` n'entre plus dans l'annuaire public des agences et n'a plus de fiche d'agence"
status: doing
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
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-85--ce-que-le-site-public-montre-d-une-agence-individual"
tags: [back, front, public, agence, pistes]
---

## Objectif utilisateur

Le visiteur ne lit plus, pour un particulier, une « agence » au nom générique (« Espace de
{prénom} ») à côté de la fiche de la même personne : l'annuaire et la fiche d'agence ne montrent
que des agences professionnelles, et la carte de contact d'un bien mène à la fiche de la personne.

## Contexte

Réf : **P85.04** du fichier de pistes, `validé` (critère V7 accordé).

Mesuré avant correctif (`pre-dev` 53f6599d7, test de garde ci-dessous) : un espace `individual`
actif avec un bien publié apparaît dans `GET /api/public/agencies`, et
`GET /api/public/agencies/{slug}` comme `…/{slug}/properties` répondent 200. La carte de contact de
la fiche bien (`PropertyAgentCard`) lie `/agencies/{slug}` quel que soit le `kind`.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la piste demande de trancher si l'annuaire et la fiche d'agence montrent un espace
`individual`, et ne décrit qu'une voie à mettre en œuvre, celle du « non » : filtrer
`kind = standard` dans les trois méthodes de `PublicAgencyController`, et faire lier par la carte
de la fiche bien la fiche de la personne plutôt que celle de l'espace. C'est aussi la
recommandation du délégué (2026-10-20). Une agence passée en `standard` retrouve sa fiche sous le
slug que TCK-1004 garde.

## Hypothèses (mode sans humain)

- « La fiche de la personne » est celle du contact que la carte montre déjà
  (`primary_contact.slug`, `/agents/{slug}`). Sans slug de contact, le nom de l'espace reste écrit,
  sans lien.
- Le sitemap tire ses fiches d'agence de `GET /api/public/agencies` : il suit le filtre sans
  changement côté front.

## Delta à produire

- [x] `PublicAgencyController::index()`, `show()`, `properties()` : `kind = standard`.
- [x] `PropertyAgentCard` : pour une agence `individual`, le lien mène à `/agents/{contact.slug}`.
- [x] Les deux tests de `PublicRoleTest` qui lisaient l'équipe d'un espace sur sa fiche d'agence
  attendent désormais un 404 ; leurs assertions sur la personne sont gardées.

## Critères d'acceptation

- [x] AC1 — l'annuaire liste l'agence `standard` et pas l'espace.
- [x] AC2 — la fiche et le portefeuille de l'espace répondent 404 ; ceux de l'agence `standard`, 200.
- [x] AC3 — la carte de contact d'un bien d'un espace ne lie jamais `/agencies/…` ; elle lie la
  fiche du contact, ou n'écrit que le nom sans slug de contact.

## Hors périmètre

- `PublicProfileFacts::agences()` sert encore, dans l'index `/api/public/agents`, l'espace comme
  `agency` d'une personne ; le front de l'index ne le lie pas (lu), il n'est pas retouché.
- La branche `individual` de `professionnelsIci` dans `show()` n'est plus atteinte ; elle n'est pas
  retirée (delta minimal).
- Le formulaire anonyme vers l'admin d'un espace (reste de P85.05) : sans fiche, il n'a plus lieu.

## Notes d'implémentation
