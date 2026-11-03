---
id: TCK-1108
title: "Champs d'un garant bornés à leur colonne dans les trois requêtes : 422 et non 500"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#27-guarantor-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-91--bornes-max-des-formrequests-face-aux-varcharn"
tags: [back, garants, validation, pistes]
---

## Contexte

Réf : **P91.03** du fichier de pistes, `retenu · autonome` (A1 : les colonnes fixent les bornes,
seul le 500 devient 422).

`guarantors.phone` est un `varchar(30)` ; `first_name`, `last_name`, `occupation`, `employer` et
`relationship_to_tenant` des `varchar(255)`. `StoreGuarantorRequest`, `UpdateGuarantorRequest` et
`AttachGuarantorLeaseRequest` les validaient sans `max` : une valeur trop longue atteignait
PostgreSQL (22001), soit 500.

## Objectif utilisateur

Qui saisit un garant avec un champ trop long (deux numéros dans le champ téléphone, par exemple)
reçoit une erreur de validation sur le champ, et non une panne serveur.

## Delta à produire

- [x] Trait `App\Http\Requests\Concerns\BorneLesChampsDuGarant` : la largeur des six colonnes, une
      seule liste, ajoutée en `max:` aux règles des trois requêtes.
- [x] Test `tests/Feature/Api/GuarantorFieldLengthTest.php`.

## Critères d'acceptation

- [x] AC1 — `POST /api/guarantors` : `phone` de 31 caractères, ou l'un des cinq champs texte de 256 :
      422 sur la clé, aucun garant créé ; à la borne : 201.
- [x] AC2 — `PUT /api/guarantors/{id}` : mêmes cas, 422, garant inchangé ; à la borne : 200.
- [x] AC3 — `POST /api/leases/{id}/guarantors` (garant neuf) : mêmes cas, 422, aucun garant
      rattaché ; à la borne : 201.

## Hors périmètre

- Le format du téléphone (`TelephoneSaisi`, `TelephoneJoignable`) : il changerait ce qu'on accepte
  aujourd'hui.
- La borne de l'adresse e-mail (P91.05).

## Notes d'implémentation

- Ablation : les trois FormRequest rendues à `HEAD` et le trait retiré → 3 rouges sur 3 ; correctif
  remis → 3/3.
