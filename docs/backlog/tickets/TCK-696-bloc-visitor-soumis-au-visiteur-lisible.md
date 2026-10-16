---
id: TCK-696
title: "Le bloc `visitor` d'une visite suit la règle des `visitor_*` : le bailleur sans la fiche ne lit pas le compte du visiteur"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#17-propertyvisit-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-21--données-personnelles-dun-user-sorties-par-include
tags: [api, visits, privacy, pistes]
---

## Contexte

Réf : **P21.03** du fichier de pistes, `validé` par le porteur (critère accordé : V3).

`PropertyVisitResource` masque au bailleur qui n'est pas du personnel la fiche client
(TCK-590, M7′) et les `visitor_*` que la planification pour une fiche recopie (M7″). Quand la
fiche est liée à un compte, `PropertyVisitController::planForCustomer` pose `visitor_id` sur ce
compte, et le bloc `include=visitor` rendait son nom, son e-mail et son téléphone sans condition.
Reproduit le 2026-10-16 : le bailleur lit `visitor = {first_name, last_name, email, phone}` au
détail comme à la liste.

## Décision du porteur

validé — bloc visitor soumis à $visiteurLisible, nom compris

## Objectif

Le bloc `visitor` d'une visite n'est rendu qu'au lecteur qui lit aussi ses `visitor_*`.

## Delta à produire

- [x] `PropertyVisitResource` : le bloc `visitor` vaut `null` quand `$visiteurLisible` est faux
      (identifiant, nom, e-mail et téléphone compris).
- [x] Un test dans `ProprietaireDuBienTest` : planification réelle pour une fiche liée à un
      compte, lecture par le bailleur (détail et liste, `include=visitor,customer`), puis versant
      autorisé (personnel de l'agence, visiteur lui-même).

## Critères d'acceptation

- [x] AC1 — Le bailleur non-personnel reçoit `visitor: null`, et la réponse ne contient ni l'e-mail,
      ni le téléphone, ni le nom du compte visiteur, au détail comme à la liste.
- [x] AC2 — Le personnel de l'agence et le visiteur lui-même lisent toujours le bloc complet.
- [x] AC3 — Une visite sans fiche (demande publique) garde son bloc `visitor` (`$visiteurLisible`
      vrai quand `customer_id` est nul, inchangé ; établi par lecture, aucun test ne charge
      `include=visitor` sur une demande publique).

## Hypothèses (mode sans humain)

- « Bloc soumis » est lu comme le bloc entier à `null`, sur le patron du bloc `customer` voisin,
  et non comme des clés vidées une à une. Le front (`VisitDetail.tsx::resolveRequester`) gère
  déjà `visitor` nul : il retombe sur `visitor_name`, nul lui aussi, puis sur le nom anonyme.
- `visitor_id` à la racine de la ressource n'est pas visé par la précision et reste émis.

## Hors périmètre

- `visitor_id` à la racine, qui reste lisible du bailleur (un identifiant, pas une donnée de
  contact).
- Les autres fuites du même angle (P21.01, P21.02, P21.05), traitées par leurs propres tickets.

## Notes d'implémentation

- Ablation : condition `$visiteurLisible &&` retirée du bloc → le test neuf **rouge** (« Array
  [...'email' => 'visiteur@exemple.sn'...] is identical to null ») ; remise → vert, classe
  entière 13 verts (91 assertions).
- Le test passe par `POST /api/property-visits` plutôt que par la factory : c'est ce chemin qui
  pose `visitor_id` sur le compte de la fiche, et l'assertion le vérifie.
