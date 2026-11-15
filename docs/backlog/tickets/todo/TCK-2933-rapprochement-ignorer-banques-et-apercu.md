---
id: TCK-2933
title: "Rapprochement : « Ignorer » un paiement sans ligne, « Banques prises en charge » et l'aperçu avant import"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2932]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#40-bankstatement-"
tags: [front, rapprochement, banque, import, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'admin écarte d'un geste un paiement qui n'aura pas de ligne de banque, et importe un relevé en sachant d'avance ce qui sera lu.

## Contrat de données

- `POST /api/reconciliation/ignored-payments` et `DELETE …/{id}`, `POST /api/bank-statements/preview`, `GET /api/reconciliation/supported-formats` (TCK-2932).

## Direction UX / Artistique

- **Référence de fidélité** : `app-rapprochement`, **approche C**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-rapprochement.tsx`, visionneuse `?p=app-rapprochement&a=c`.
  - **e0 « Reste à rapprocher »**, **bureau** : « Ignorer » sur un paiement sans ligne de banque (`:337`) — « Chercher » et « Délier » restent.
  - **e1 « Aucun relevé »**, **téléphone et bureau** : rubrique « Banques prises en charge » en puces (`:391-398`) et la promesse « on vous montre ce qu'on a lu avant d'importer » (`:380`).
- Audit : `audit-f6-agence-entree.md`, § app-rapprochement e0, e1 ; fiche TCK-2675.

## Contraintes strictes (métier)

- Les puces de banques viennent de `supported-formats.banks` **seulement** (D-67) ; si la liste est vide, la rubrique dit les formats lus (« CSV — colonnes réglables · OFX ») au lieu d'inventer des noms de banque, et la fiche TCK-2675 garde l'écart « banques » avec le motif D-67 jusqu'à ce que le porteur fournisse les exports.
- L'import passe toujours par l'aperçu : fichier choisi → aperçu (lignes lues, ignorées et raisons, période, premières lignes) → « Importer » ou « Changer de fichier ».
- « Ignorer » demande un motif (puces + texte pour « Autre ») et se défait depuis un toast « Annuler ».
- Libellés `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] « Ignorer » d'un paiement sans ligne (bureau ; au téléphone dans le menu de la carte).
- [ ] Rubrique « Banques prises en charge ».
- [ ] Étape d'aperçu dans l'import.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — À 1440, un paiement sans ligne proposée porte « Ignorer » ; choisir « Espèces gardées à l'agence » appelle `POST /api/reconciliation/ignored-payments` avec `cash_kept`, retire la rangée et décrémente « À rapprocher » ; « Annuler » du toast la remet.
- [ ] AC2 — Sans relevé, l'écran rend la rubrique « Banques prises en charge » : une puce par banque de `supported-formats.banks`, ou, liste vide, la ligne des formats lus.
- [ ] AC3 — Choisir un fichier dans « Importer un relevé » affiche l'aperçu (comptes et 10 lignes) **avant** toute écriture ; « Changer de fichier » ne crée aucun relevé ; « Importer » crée le relevé.
- [ ] AC4 — Vérifier au navigateur, avec des paiements confirmés par passerelle en base, la phrase « N confirmés tout seuls » et la mention Wave / Orange Money de e1 (non vérifiables sur la démo) ; corriger si absentes.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2675 mise à jour (« Ignorer » et aperçu retirés des écarts ; « banques » gardé avec D-67 tant que la liste est vide).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e0 et e1 ne rend aucun écart non expliqué.

## Hors périmètre

- Les préréglages par banque (D-67).

## Notes d'implémentation

_(à remplir par implementing-specs)_
