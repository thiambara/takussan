---
id: TCK-1283
title: "Invitations par téléphone : la forme espacée et la forme nationale sont ramenées à l'E.164"
status: done
phase: P2
family: bug
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-125--téléphones-écrits-sans-normalisation-et-leurs-lecteurs"
tags: [api, invitation, telephone, pistes]
---

## Contexte

Réf : **P125.04** du fichier de pistes, `retenu · autonome` (A1).

Les trois invitations par téléphone (agent, propriétaire, prestataire) valident `phone` par
`TelephoneJoignable` sur la valeur brute. Leur message d'erreur donne en exemple
« +221 77 123 45 67 », une forme que la même règle refuse ; la forme nationale est refusée aussi,
alors que la visite et la demande de contact la normalisent (`TelephoneSaisi`, TCK-590).

Mesuré avant correctif (`pre-dev` a2398e474, test de garde ci-dessous) : les six cas (trois
routes × `+221 77 000 08 01` et `77 000 08 01`) rendent 422 `phone`, « … (e.g. +221 77 123 45 67) ».

## Objectif

Une invitation à `77 000 08 01` ou à `+221 77 000 08 01` est créée, et le SMS part au
`+221770000801`.

## Delta à produire

- [x] `prepareForValidation()` de `InviteAgentRequest`, `InviteOwnerRequest` et
      `InviteServiceProviderRequest` : `TelephoneSaisi::normaliser` sur `phone`, comme
      `ContactLeadPublicRequest`.
- [x] Test : `InvitationBySmsTest::test_une_invitation_a_un_numero_saisi_en_forme_humaine_part_en_e164`,
      six cas.

## Critères d'acceptation

- [x] AC1 — Les trois routes rendent 201, `data.phone` = `+221770000801`, et un SMS part à ce
      numéro, pour les deux formes.
- [x] AC2 — Un numéro injoignable (`+330612345678`) reste refusé en 422.

## Hors périmètre

- Les trois écrans (champ libre `type="tel"`) : la normalisation côté API suffit au critère, la
  Piste propose l'une ou l'autre voie ; le passage des écrans à `PhoneInput` n'est pas fait.
- L'exemple du message de validation : il devient juste, puisque la forme espacée est acceptée.
- Le normaliseur unique (P125.05, V6).

## Hypothèses

- `TelephoneSaisi::normaliser` ne devine rien hors des formes sénégalaises qu'il documente : un
  numéro étranger espacé est seulement débarrassé de ses séparateurs, puis jugé par
  `TelephoneJoignable`, comme sur la visite.

## Notes d'implémentation

- Ablation : les trois requêtes remises à leur version d'avant → les six cas rougissent (422) ;
  remises → `InvitationBySmsTest` 13/13.
