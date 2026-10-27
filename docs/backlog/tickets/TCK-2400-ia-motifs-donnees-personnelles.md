---
id: TCK-2400
title: "Socle IA : le masquage et la garde des jeux d'évaluation attrapent les numéros et adresses écrits autrement, sans masquer les prix"
status: todo
phase: P1
family: back
estimate: S
wave: 80
created: 2026-10-27
updated: 2026-10-27
depends_on: [TCK-2383, TCK-2384]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models: []
tags: [api, ia, socle-ia, donnees-personnelles, garde, adr-0076]
---

## Objectif utilisateur

Le porteur peut envoyer une annonce ou un message à un modèle externe, et verser des cas
d'évaluation dans le dépôt, sans qu'un numéro de téléphone ou une adresse e-mail écrits de façon
inhabituelle ne passe en clair — et sans qu'un prix soit pris pour un numéro.

## Contexte

Relevé par les revues du lot 0 (TCK-2383 `PhoneMasker`, TCK-2384 `EvalCaseAnonymizer` et
`scripts/check-ai-evals-pii.mjs`), 2026-10-27. ADR-0076 §5 : une donnée personnelle ne part pas en
clair vers un fournisseur.

Formes **non attrapées** aujourd'hui :

- préfixes absents du motif (`7[05678]|33`) : 30, 34, 71, 79 — à confirmer contre le plan de
  numérotation de l'ARTP en vigueur avant de les ajouter ;
- groupements `77 12 34 567`, `77/123/45/67` ;
- `221…` sans `+` ni `00` ;
- chiffres pleine chasse (`７７…`) ou arabes-indiens (`٧٧…`) ;
- e-mail obfusqué `awa (at) exemple.sn`, `＠` pleine chasse ;
- **côté garde seulement** : un téléphone coupé par U+200B (le masqueur, lui, est couvert).

Et un **faux positif** : un prix de 9 chiffres commençant par 70, 75, 76, 77, 78 ou 33 (« 750000000
FCFA ») est pris pour un numéro par la garde — et, s'il est écrit d'un seul tenant, masqué par
`PhoneMasker`, ce qui casserait l'extraction de prix du Radar.

## Contrat de données

- Aucun endpoint, aucune migration. Classes touchées : `App\Support\PhoneMasker`, le masquage
  d'e-mail de `EvalCaseAnonymizer`, `scripts/check-ai-evals-pii.mjs`.

## Contraintes strictes (métier)

- Le masqueur et la garde reconnaissent **le même ensemble** de formes : une forme que l'un masque
  et que l'autre ne voit pas (ou l'inverse) est un défaut.
- Échec fermé conservé : une erreur PCRE ne rend jamais le texte brut.
- Un nombre immédiatement suivi d'une marque monétaire (`F`, `FCFA`, `F CFA`, `CFA`, `XOF`,
  `francs`) n'est pas un numéro.
- Les préfixes ajoutés citent leur source datée dans le docblock.

## Delta à produire

- [ ] `PhoneMasker::PATTERN` : préfixes confirmés, groupements, `221` nu, normalisation des
      chiffres pleine chasse et arabes-indiens avant le motif, exclusion des montants.
- [ ] Masquage d'e-mail : `(at)`, `[at]`, ` at ` entre deux mots plausibles, `＠`.
- [ ] `scripts/check-ai-evals-pii.mjs` : mêmes formes, U+200B et autres invisibles retirés avant le
      balayage, exclusion des montants ; épreuves pour chaque forme et pour le faux positif.
- [ ] Tests : `tests/Unit/Ai/PhoneMaskerTest.php` et `tests/Unit/Ai/EvalCaseAnonymizerTest.php` étendus
      d'un cas par forme listée ci-dessus, plus « 750000000 FCFA » non masqué.

## Critères d'acceptation

- [ ] AC1 — Chaque forme du contexte est masquée par le socle et détectée par la garde (un cas de
      test et une épreuve par forme).
- [ ] AC2 — « 750000000 FCFA » et « 75 000 000 F CFA » ne sont ni masqués ni signalés.
- [ ] AC3 — `node scripts/check-ai-evals-pii.mjs` reste vert sur les jeux du dépôt.
- [ ] AC4 — Chaque nouveau cas rougit sans sa modification du motif (ablation consignée).

## Hors périmètre

- Les numéros étrangers hors Sénégal.
- La détection de noms (déjà traitée par `EvalCaseAnonymizer`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
