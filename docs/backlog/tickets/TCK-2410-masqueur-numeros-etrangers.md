---
id: TCK-2410
title: "Socle IA : le masquage et la garde des jeux d'évaluation attrapent les numéros étrangers, et aucun document ne cite de numéro réel"
status: doing
phase: P1
family: bug
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-29
depends_on: [TCK-2400]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models: []
tags: [api, ia, socle-ia, donnees-personnelles, garde, adr-0076]
---

## Objectif utilisateur

Le porteur peut envoyer une annonce à un modèle externe, la stocker (`ai_suggestions.input_snapshot`)
et verser des cas d'évaluation dans le dépôt sans qu'un numéro d'annonceur écrit à l'étrangère
(indicatif `+33`, `+225`, `00…`, numéro national à points) ne passe en clair — et sans qu'un prix,
une surface, une date ou une référence de bien soit pris pour un numéro.

## Contexte

Relevé le 2026-10-29 pendant l'anonymisation de vraies annonces pour TCK-2403. `App\Support\PhoneMasker`
et `scripts/check-ai-evals-pii.mjs` ne connaissent que le plan de numérotation sénégalais
(TCK-2400 : « hors périmètre : les numéros étrangers »). Re-mesuré sur `dev` (ce ticket) : **aucune**
de ces formes n'est masquée ni signalée, avec des numéros fictifs :

- indicatif étranger collé ou groupé — `+33612345678`, `+33 6 12 34 56 78`, `+2250712345678`,
  `+225 07 12 34 56 78`, `0033612345678`, `+44 7700 900123` ;
- une espace après le `+` — `+ 33 6 12 34 56 78` ;
- le `(0)` de trunk — `+33 (0)6 12 34 56 78` ;
- un numéro national à deux chiffres par groupe, collé, espacé ou à points — `0612345678`,
  `06 12 34 56 78`, `06.12.34.56.78` (France, Côte d'Ivoire).

Un numéro de type `+33 768123456` est même masqué **à moitié** (`+33 [TELEPHONE]`) : sa fin ressemble
à un préfixe sénégalais.

Une fuite réelle en a résulté : deux vrais numéros d'annonceurs ont été cités en exemple dans un
document poussé. Le défaut du masqueur ne l'a pas causée ; la **règle** manquait.

## Contrat de données

- Aucun endpoint, aucune migration. Classes touchées : `App\Support\PhoneMasker` (nouvelle constante
  de masquage, `PATTERN` reste le motif **sénégalais**, dont `RadarPhone` et `RadarAmountParser`
  dépendent), `scripts/check-ai-evals-pii.mjs`, `tests/fixtures/ai/donnees-personnelles.json`.

## Contraintes strictes (métier)

- Le masqueur et la garde reconnaissent **le même ensemble** de formes (TCK-2400, inchangé) :
  le fixture partagé les éprouve des deux côtés.
- **Rien de ce qui n'est pas un numéro ne devient `[TELEPHONE]`** : prix (`1 500 000 F`, `+ 1 000 000`),
  surfaces, dates (`01/05/2026`, `01.05.2026`), références de bien (`TK-2026-AB12CD`), millésimes.
  Chaque non-cas est un test.
- Un numéro étranger n'est reconnu que s'il porte un **indicatif ITU valide précédé de `+` ou `00`**
  (ou, sans indicatif, la forme nationale à cinq paires `0X XX XX XX XX`) : jamais un nombre quelconque.
- `RadarPhone::fromText()` ne lit toujours que des numéros sénégalais.
- **RÈGLE** : aucun document du dépôt (ticket, plan, ADR, journal, commentaire, test, fixture, jeu
  d'évaluation) ne cite un numéro relevé dans la réalité, même comme exemple d'un défaut. Les
  exemples sont des numéros manifestement fictifs (`+33612345678`, `+221771234567`, `06 12 34 56 78`,
  `+1 202 555 0123`). Voir « Notes d'implémentation » pour ce qu'une garde peut en porter.

## Delta à produire

- [ ] `PhoneMasker::MASK_PATTERN` = numéro sénégalais (`PATTERN`) OU numéro étranger ; `mask()` et
      `EvalCaseAnonymizer` l'utilisent ; `PATTERN` ne change pas.
- [ ] `scripts/check-ai-evals-pii.mjs` : le même motif étendu.
- [ ] Fixture partagé : une forme par ligne ci-dessus, et les non-cas (prix, surface, date, référence).
- [ ] Tests : `PhoneMaskerTest`, `EvalCaseAnonymizerTest` ; appelants re-mesurés.
- [ ] La règle « aucun numéro réel dans un document » : en garde si elle se porte sans faux positif,
      sinon écrite dans le ticket et l'en-tête de la garde.

## Critères d'acceptation

- [ ] AC1 — Chaque forme étrangère du contexte est masquée par `PhoneMasker::mask()` et signalée par
      la garde (un cas de fixture, éprouvé des deux côtés).
- [ ] AC2 — Les numéros fictifs actuels du fixture restent masqués ; les non-cas (prix, surfaces,
      dates, références, `+ 1 000 000`) ne sont ni masqués ni signalés.
- [ ] AC3 — Un numéro étranger dans un champ `expected` d'un cas d'évaluation fait échouer la garde.
- [ ] AC4 — `RadarPhone::fromText()` et `RadarAmountParser` ne changent pas de comportement sur leurs
      tests existants.
- [ ] AC5 — Chaque nouveau cas rougit sans sa modification du motif (ablation consignée).
- [ ] AC6 — La règle des numéros réels est écrite là où elle s'applique.

## Hors périmètre

- Les numéros étrangers écrits sans indicatif ni zéro initial (`612345678`, `7700 900123`) : ils ne se
  distinguent pas d'un nombre.
- Les numéros nationaux étrangers à autre forme que `0X XX XX XX XX`.
- Un nom de personne (aucun motif ne le reconnaît).

## Notes d'implémentation

_(à remplir par implementing-specs)_
