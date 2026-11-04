---
id: TCK-1263
title: "Signature d'un bail : la destination masquée d'un e-mail au long domaine est bornée à 120 caractères, dès l'envoi du code"
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
    - "docs/features.md#14-location-longue-durée-baux"
  adr:
    - "docs/adr/0042-preuve-de-consentement-a-la-signature-du-bail.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-91--bornes-max-des-formrequests-face-aux-varcharn"
tags: [api, bail, signature, pistes]
---

## Contexte

Réf : **P91.06** du fichier de pistes, `validé`.

Sans téléphone vérifié, le code de signature part par e-mail, et la destination vaut
`maskEmail($user->email)` : la première lettre, `•••@`, puis le domaine entier. `sign()` la recopie
dans `lease_signatures.otp_destination`, un `varchar(120)`. Une adresse au domaine de plus de 115
caractères (que la validation accepte) fait échouer la signature à sa dernière étape, code juste,
en 500 (22001), mesuré par le mesureur.

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V4.

## Choix de l'implémenteur

La `Piste` laisse deux voies : tronquer la destination masquée (`mb_substr(…, 0, 120)`), ou élargir
la colonne par une migration. Elle n'en recommande aucune ; la plus étroite est la troncature, sans
migration. Elle est faite **dans `maskEmail()`**, donc dès l'envoi : la destination rendue au
signataire par `sendCode`, celle mise en cache avec le code et celle de la preuve restent la même
chaîne. C'était l'objection du délégué à la troncature (la preuve d'ADR-0042 enregistre la
destination montrée) : elle ne s'applique pas à une troncature faite à la source.

## Objectif

Un signataire au long domaine signe son bail, et la preuve enregistre la destination qu'il a lue.

## Delta à produire

- [x] `LeaseSignatureService::DESTINATION_MAX_LENGTH = 120`, la longueur de la colonne.
- [x] `maskEmail()` borne la destination masquée à cette longueur.

## Critères d'acceptation

- [x] AC1 — Adresse `awa@` + domaine de 124 caractères, sans téléphone vérifié : `sendCode` rend
      une destination de 120 caractères, la signature rend 200, et `otp_destination` vaut la
      destination rendue.
- [x] AC2 — `LeaseSignatureTest` reste vert.

## Hypothèses

- `maskPhone()` rend au plus la longueur des chiffres du numéro, borné en amont : non touché.
- `docs/models-spec.md` § 82 (`otp_destination string(120)`) reste juste : aucune spec ne bouge.

## Notes d'implémentation

- Ablation : `maskEmail()` sans la borne → le test neuf rougit (129 caractères) ; remis → vert.
