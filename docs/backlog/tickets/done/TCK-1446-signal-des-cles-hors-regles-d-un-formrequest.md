---
id: TCK-1446
title: "BaseFormRequest journalise, en local et en test, les clés du corps qu'aucune règle ne nomme (P80.03)"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-80--champs-envoyés-par-les-formulaires-et-écartés-par-validated"
  conventions:
    - "takussan-api/CLAUDE.md#validation--une-seule-convention-et-une-garde-qui-la-tient"
tags: [api, validation, pistes]
---

## Objectif

Qu'une clé envoyée par le front et écartée en silence par `validated()` laisse une trace, au lieu
d'être trouvée par lecture des mois plus tard. P80.01 (statut d'un client à la création) et P80.02
(voyageurs d'une réservation) ont été trouvés ainsi, sans aucun signal.

## Contexte

Réf : **P80.03** du fichier de pistes (angle 80), `validé` le 2026-10-21 (validation en bloc ;
critère V6 accordé : convention transverse sur tous les `BaseFormRequest`).

`BaseFormRequest` ne porte que `authorize()`, `prepareForValidation()` et `normalize()` : rien ne
relève une clé hors règles. Aucune garde `scripts/check-*.mjs` ne compare un corps du front aux
règles (mesuré par le mesureur le 2026-10-20).

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

### Choix de l'implémenteur

La `Piste` laisse deux voies : **journaliser**, ou faire échouer sous `APP_ENV=testing`. Retenue :
**journaliser**, nommée en premier et la plus étroite — aucune réponse ne change, aucun test
existant ne peut rougir sur un écart connu. C'est aussi la recommandation du délégué (Mesure du
2026-10-20). La bascule vers l'échec, si elle se veut, viendra après un premier relevé.

Hypothèses (aucune question possible en mode sans humain) :

- **environnements** : `local` et `testing` seulement. En préproduction et en production, rien
  n'est relevé (ni les clés, ni l'appel à `rules()`) ;
- **ce qui est journalisé** : `Log::warning('form_request.unruled_input_keys', …)` avec la classe
  du FormRequest, l'URI de la route et la liste des **noms** de clés ; jamais une valeur ;
- **portée** : clés de premier niveau du corps (JSON ou formulaire) et fichiers. Une règle
  `items.*.x` couvre `items`. Les clés imbriquées ne sont pas relevées ;
- **la chaîne de requête n'est pas lue** : `include`, `fields`, `filter`… n'ont pas de règle par
  construction ;
- **exceptions** : `_method` et `_token` d'office ; une sous-classe déclare les siennes dans
  `$unruledInputKeysAllowed`. Aucune n'est déclarée par ce ticket : la liste se dresse sur le
  premier relevé ;
- **les 38 FormRequest qui étendent `FormRequest` en direct** ne sont pas couverts : la piste vise
  `BaseFormRequest`.

## Reste à faire

- L'ADR de la convention (`docs/adr/`, chemin fermé à l'implémenteur), si le porteur veut l'écrire.
- Relever les signaux d'une exécution de la suite et décider : liste d'exceptions, correction des
  écarts, puis éventuelle bascule vers l'échec sous `testing`.
- L'écart voisin du constat : `AddParticipantsRequest` valide `role`, que
  `ConversationParticipantController` ne lit pas (hors du signal : la règle existe).

## Delta produit

- [x] `BaseFormRequest::validateResolved()` relève les clés du corps **avant** la validation, puis
      journalise celles qu'aucune règle ne nomme.
- [x] `$unruledInputKeysAllowed`, liste d'exceptions par sous-classe.
- [x] `tests/Feature/Validation/UnruledInputKeysSignalTest.php` (7 cas).

## Critères d'acceptation

- [x] AC1 — `POST /api/bookings` avec une clé sans règle → un `warning`
      `form_request.unruled_input_keys`, route `api/bookings`, clés `['couleur_preferee']`
      (test de non-vacuité ; `guests` a désormais sa règle depuis TCK-1065, il ne sert plus).
- [x] AC2 — la valeur de la clé n'apparaît pas dans le contexte journalisé.
- [x] AC3 — un corps entièrement couvert par les règles ne signale rien.
- [x] AC4 — hors `local` et `testing`, rien n'est signalé.
- [x] AC5 — une clé de `$unruledInputKeysAllowed` n'est pas signalée, une autre l'est.
- [x] AC6 — une chaîne de requête (`?include=…`) ne signale rien, en JSON comme en formulaire.

## Notes d'implémentation

- **Piège** : `BaseFormRequest::prepareForValidation()` remplace la source d'entrée par
  `input()`, qui fusionne la chaîne de requête. Pour un formulaire non JSON, la source **est**
  `$this->request` : relever les clés après la validation y aurait trouvé `include`. Les clés se
  relèvent donc avant `parent::validateResolved()` (cas AC6 formulaire).
- **Ablation** : appel du signal retiré de `validateResolved()` → 3 rouges (AC1, AC2, AC5), les 4
  cas « rien n'est signalé » restent verts, comme attendu ; correctif remis → 7 verts.
