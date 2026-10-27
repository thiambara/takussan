---
id: TCK-2400
title: "Socle IA : le masquage et la garde des jeux d'évaluation attrapent les numéros et adresses écrits autrement, sans masquer les prix"
status: doing
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

- [x] `PhoneMasker::PATTERN` : préfixes confirmés, groupements, `221` nu, normalisation des
      chiffres pleine chasse et arabes-indiens avant le motif, exclusion des montants.
- [x] Masquage d'e-mail : `(at)`, `[at]`, ` at ` entre deux mots plausibles, `＠`.
- [x] `scripts/check-ai-evals-pii.mjs` : mêmes formes, U+200B et autres invisibles retirés avant le
      balayage, exclusion des montants ; épreuves pour chaque forme et pour le faux positif.
- [x] Tests : `tests/Unit/Ai/PhoneMaskerTest.php` et `tests/Unit/Ai/EvalCaseAnonymizerTest.php` étendus
      d'un cas par forme listée ci-dessus, plus « 750000000 FCFA » non masqué.

## Critères d'acceptation

- [x] AC1 — Chaque forme du contexte est masquée par le socle et détectée par la garde (un cas de
      test et une épreuve par forme).
- [x] AC2 — « 750000000 FCFA » et « 75 000 000 F CFA » ne sont ni masqués ni signalés.
- [x] AC3 — `node scripts/check-ai-evals-pii.mjs` reste vert sur les jeux du dépôt.
- [x] AC4 — Chaque nouveau cas rougit sans sa modification du motif (ablation consignée).

## Hors périmètre

- Les numéros étrangers hors Sénégal.
- La détection de noms (déjà traitée par `EvalCaseAnonymizer`).

## Notes d'implémentation

2026-10-27, sur `feat/socle-ia-lot-0`.

- **Préfixes, source datée** : plan de numérotage national de l'ARTP, communication du 6.IX.2022,
  reprise dans la publication de l'UIT « Sénégal (indicatif de pays +221) » du 3.X.2023
  (`itu.int/dms_pub/itu-t/oth/02/02/T02020000B80006PDFF.pdf`, tableau « Détails du plan de
  numérotage ») : fixe **30** (Expresso), **32** (Free), **33** (Sonatel, 338/339), **36** (Hayo),
  **39** (ADIE) ; mobile **70**, **72** (Hayo), **75** (MVNO), **76**, **77**, **78**, **79** (ADIE) ;
  VoIP **93** (FAI). **34 et 71 ne sont pas des préfixes** — 71 n'apparaît que comme bloc de 70
  (`7011`) — : écartés, et épinglés comme non masqués par le fixture. 32, 36, 39, 72 et 93 ne
  figuraient pas dans le ticket : ajoutés parce qu'ils sont au plan.
- **Le même ensemble des deux côtés, par construction** : `takussan-api/tests/fixtures/ai/donnees-personnelles.json`
  liste les formes (téléphones, courriels, et ce qui n'est pas personnel). `PhoneMaskerTest`,
  `EvalCaseAnonymizerTest` et les épreuves de `check-ai-evals-pii.mjs` le lisent tous trois : une
  forme ajoutée là est éprouvée par le masqueur ET par la garde. Le commentaire de `repo-ci.yml`
  le note (le chemin est couvert par `takussan-api/tests/**`).
- **Groupements** : séparateur facultatif (espace, insécable, point, tiret, **barre oblique**) entre
  les groupes 2-3-2-2, 2-2-2-3 ou 3-2-2-2 (`338 21 00 00`). Un groupement 3-3-3 (`750 000 000`) n'en
  est aucun : seul le prix **collé** était un faux positif, et la marque monétaire l'exclut. Une
  première version stricte (séparateurs exigés à des positions fixes) a été écartée : elle
  rejetait `77<ZWNJ>123 45<ZWSP>67`, que le masqueur couvrait déjà (test existant rouge).
- **Normalisation code point pour code point** : `PhoneMasker::mask()` ramène les chiffres pleine
  chasse, arabes-indiens et arabes-indiens étendus à l'ASCII et retire les invisibles, puis
  remplace dans le texte d'origine par une table d'indices — tout ce qui n'est pas un numéro reste
  intact (`８ pièces`). `EvalCaseAnonymizer` applique `normalizeDigits()` à son texte replié, qui
  retirait déjà les invisibles. Échec fermé conservé (UTF-8 invalide → purge puis relance, sinon
  exception) ; le `preg_replace` du courriel lève désormais au lieu de rendre `''`.
- **Courriels** : `(at)`, `[at]`, `{at}`, ` at ` entre deux mots, `＠`, arobase espacée. Le domaine
  doit finir par un TLD alphabétique (`rendez-vous at home` n'est pas un courriel). Coût accepté :
  `Villa at Mermoz.Belle` le serait.
- **Hors masque, assumé** : un prix de 9 chiffres collé **sans** marque monétaire (`750000000`)
  reste masqué.
- **AC4, ablations** (chacune annulée ensuite ; rouges PHP sur `PhoneMaskerTest` +
  `EvalCaseAnonymizerTest`, et épreuve JS en échec) : préfixes ARTP → 14 rouges ; marque
  monétaire → 8 ; `221` nu → 4 ; 2-2-2-3 → 2 ; 3-2-2-2 → 2 ; barre oblique → 2 ; chiffres non
  ASCII → 7 ; invisibles (masqueur) → 1 ; courriel obfusqué → 3 ; `＠` → 1. Chaque ablation de la
  garde la fait sortir en 1 sur la forme correspondante.
- **Vérifié** : tests IA du back 328 verts ; `node scripts/check-ai-evals-pii.mjs` vert (aucun
  jeu versé à ce jour : 0 fichier lu) ; toutes les gardes du dépôt vertes.
