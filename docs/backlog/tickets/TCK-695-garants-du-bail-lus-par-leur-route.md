---
id: TCK-695
title: "La fiche du bail lit et affiche tous ses garants par GET /api/leases/{id}/guarantors"
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
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#27-guarantor-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-21--données-personnelles-dun-user-sorties-par-include
tags: [front, api, lease, guarantor, pistes]
---

## Contexte

Réf : **P21.04** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

Le front ajoute un garant par `POST /api/leases/{id}/guarantors`, qui l'attache au pivot
`lease_guarantor` sans écrire `leases.guarantor_id`. La fiche relit le bail par
`GET /api/leases/{id}?include=property,guarantor,payments` et passe `lease.guarantor` à la section
des garants ; or `LeaseController::show` ignore `include`, et `LeaseResource` n'émet aucune clé
`guarantor`. La section affiche donc toujours l'état vide, et son compteur vaut toujours 0 : le
bouton d'ajout n'est jamais désactivé au plafond de 3. La route `GET /api/leases/{id}/guarantors`
existe et rend les garants du pivot, mais aucun appelant ne la lit, et aucun test API ne l'exerce.

## Décision du porteur

lire et afficher tous les garants par GET …/guarantors ; guarantor_id laissé tel quel

## Objectif utilisateur

L'agent (et le locataire) voit sur la fiche du bail tous les garants rattachés, y compris celui
qu'il vient d'ajouter, et le bouton d'ajout se désactive au troisième.

## Contrat de données

- Endpoint existant, consommé : `GET /api/leases/{lease}/guarantors` → `data: [{ id, first_name,
  last_name, email, phone, role }]` (`LeaseController::listGuarantors`, autorisation `view` du bail).
- Aucun changement d'API ni de schéma.

## Contraintes strictes (métier)

- Les garants affichés sont ceux du pivot `lease_guarantor` (models-spec § 14, `guarantor_id` est
  l'ancienne colonne conservée pour compatibilité) ; trois au plus par bail.
- `leases.guarantor_id` et la relation `Lease::guarantor` ne changent pas.

## Delta à produire

- [x] Front : un hook qui lit `GET /api/leases/{id}/guarantors`, invalidé par l'ajout d'un garant.
- [x] Front : la section des garants affiche chaque garant de cette liste (nom, téléphone, e-mail),
      et son compte vient de cette liste.
- [x] Front : la fiche ne passe plus `lease.guarantor`, et `useLease` ne demande plus
      `include=guarantor`, que l'API ignore.
- [x] Tests : un test front de la section (liste de deux garants affichés, plafond à trois), un test
      API `LeaseGuarantorListTest` qui fige la forme lue par le front après un ajout.

## Critères d'acceptation

- [x] AC1 — Avec deux garants rendus par la route, la section affiche les deux noms, et non l'état
      vide.
- [x] AC2 — Avec trois garants, le bouton d'ajout est désactivé.
- [x] AC3 — Un garant ajouté par `POST …/guarantors` est rendu par `GET …/guarantors` avec
      `first_name`, `last_name`, `phone` et `email`.
- [x] AC4 — L'ajout invalide la liste des garants du bail.

## Hypothèses (mode sans humain)

- La route ne rend pas `relationship_to_tenant`, que la section affichait pour `lease.guarantor` :
  ce champ n'est plus affiché. L'ajouter à la route serait un changement d'API hors de la décision.
- Le locataire (section en lecture) voit les garants que la route lui rend ; sans garant, la section
  reste masquée pour lui, comme avant.

## Hors périmètre

- Le sort de `leases.guarantor_id` et de `Lease::guarantor` (décision : laissés tels quels).
- Le retrait d'un garant depuis la fiche (`DELETE …/guarantors/{id}` existe, sans appelant ici).
- L'émission des garants dans `LeaseResource`.

## Notes d'implémentation

- Reproduction (piste, mesureur) : `POST …/guarantors` → 201, puis
  `GET /api/leases/{id}?include=property,guarantor,payments` → aucune clé `guarant*`,
  `leases.guarantor_id` à `NULL`. Avant correctif, `GuarantorSection.test.tsx` : 3 rouges sur 4
  (le hook de la liste n'est jamais appelé, la section rend l'état vide, le bouton reste actif à 3).
- Ablation front : `GuarantorSection.tsx` remis à son état d'origine → 3 rouges sur 4 ; correctif
  remis → 4 verts.
- `LeaseGuarantorListTest` garde un comportement d'API déjà juste (aucun code API ne change) : il
  est vert avant comme après. Ablation : `phone` retiré de `listGuarantors` → 1 rouge
  (« array has the key 'phone' ») ; restauré → 2 verts. La route ne trie pas : le test cherche les
  garants par prénom, et non par position.
- La clé `lease.guarantor.relationship` n'est plus affichée (la route ne rend pas
  `relationship_to_tenant`) ; elle reste dans les trois dictionnaires, aucune garde ne signalant une
  clé orpheline.
