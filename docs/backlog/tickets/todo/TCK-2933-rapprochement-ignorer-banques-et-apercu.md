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

**Livré (2026-11-15, front seul ; API de TCK-2932).** Toutes les routes sont sous `/api/agencies/{agency}/…`
(le contrat du ticket les abrège).

- **« Ignorer »** (`reste/Ignorer.tsx`) : bureau, bouton discret « Ignorer » + loupe « Chercher » sur la rangée d'un
  paiement SANS ligne proposée (maquette `:337`) ; téléphone, menu « ⋯ » (« Autres gestes pour … ») de la carte sans
  ligne. Le motif se choisit en puces (`cash_kept` « Espèces gardées à l'agence », `other_account` « Versé sur un autre
  compte », `other` « Autre ») ; « Autre » ouvre un texte exigé (500 car., `note` envoyée pour `other` seulement). Un
  refus (422 `payment_not_pending`, `payment_already_ignored`) se dit dans la fenêtre, qui reste ouverte. Succès : toast
  « Paiement ignoré. » 6 s avec « Annuler » → `DELETE …/ignored-payments/{id}` (l'`id` rendu par le POST). Le geste vit
  au niveau de la PAGE (`ResteARapprocher`) : ignorer le dernier paiement remplace la liste par « Tout est rapproché »,
  le toast doit survivre au démontage. Invalidation de la racine `['reconciliation']` : la rangée part et « À rapprocher »
  décroît d'après l'API, jamais d'un recomptage local.
- **Décision (mineure, tranchée)** : après le toast, un paiement ignoré par erreur ne se retrouvait nulle part. Sous la
  liste, « N paiements ignorés ce mois-ci · Voir » (rendu seulement si `overview.ignored` > 0) ouvre la liste
  `GET …/ignored-payments?period=` (lue à l'ouverture seulement) avec « Rétablir ». Les ignorés ne comptent PAS dans
  « déjà rapprochés » (jauge et phrase inchangées) : ils ne le sont pas.
- **`ReconciliationOverview.ignored`** déclaré (requis) ; types `PaiementIgnore`, `ApercuDuReleve`,
  `FormatsPrisEnCharge`, `MotifDIgnorer`.
- **« Banques prises en charge »** (écran « Il ne manque que le relevé », téléphone en puces arrondies sous une
  rubrique, bureau en grille dans la carte sous un filet, titre `sr-only` comme la maquette) : une puce par
  `supported-formats.banks` (icône téléphone pour Wave/Orange/Free, banque sinon) ; liste vide (D-67, aujourd'hui), la
  phrase « L'import lit vos relevés par leur format, quelle que soit la banque : » et une puce par `formats`
  (« CSV — colonnes réglables », « OFX »). Rien n'est rendu pendant la lecture ni sur une erreur. La ligne sous le
  bouton dit désormais « CSV ou OFX · on vous montre ce qu'on a lu avant d'importer » (clé neuve
  `vide.formatsEtApercu` ; `vide.formats` garde ses deux autres usages).
- **Aperçu avant import** (`ImportStatementForm`) : choisir un fichier lance `POST …/bank-statements/preview`
  (fichier + `source_format` déduit) ; changer le format relit ; seule la lecture la plus récente s'affiche. L'aperçu
  dit « N lignes lues · M lignes non lues · Du … au … », les 5 premières lignes non lues avec leur raison (six codes
  traduits, repli « raison non précisée ») puis « et N autres lignes », et les 10 premières lignes (date, libellé,
  ± montant). « Importer » n'est actif qu'après un aperçu lu, non vide et pas `already_imported` (l'import le
  refuserait : `reconciliation.duplicate_file`) ; il envoie le même fichier. « Changer de fichier » oublie le fichier
  et rouvre le sélecteur, sans aucune écriture. 422 `preview_unreadable` : la prose de l'API, rien d'importable.
- **Fiche TCK-2675** (AC-F1) : écart « Ignorer » et alias « on vous montre… » retirés ; écart « banques » gardé
  (D-67) et resserré aux noms de banque ; deux écarts neufs (menu « ⋯ » du téléphone, ignorés du mois).
- **Non mesuré** : AC4 et AC-F2 demandent un navigateur, interdit par la consigne du lot (le front servi tourne sur un
  autre arbre). Les phrases « Confirmés tout seuls … par Wave et Orange Money » et « Tout ce qui est passé par Wave et
  Orange Money est déjà rapproché » sont tenues en vitest avec `by_provider` renseigné
  (`ResteARapprocher.test.tsx`, « lit les compteurs… » et « dit ce qui manque… ») ; aucune correction n'était due.

**Mesures** : `ResteARapprocher.test.tsx` 36 verts (13 neufs : AC1 avec serveur à états, « Autre » exigé, 422 dans la
fenêtre, menu du téléphone, ignorés du mois et « Rétablir », aucun ignoré, AC2 ×3, AC3 ×2, déjà importé, 422 illisible), avec
`rapprochement.test.tsx` et `reconciliation.test.ts` : 64 verts. `tsc` 0, ESLint 0, `check:i18n` et les `check:*` du
front verts, gardes racine vertes ; `AuditTrail.test.tsx -t TCK-2676` (libellés `payment_ignored`/`payment_unignored` déjà posés), `gardes.test.tsx` et les deux tests de la page Finances verts. **Ablations** (une à une, md5 restauré) toutes rouges : id du toast remplacé par
l'id du paiement, note non exigée, note envoyée hors `other`, liste des ignorés lue sans être ouverte, formats rendus
malgré des banques, banque ajoutée hors API, rubrique rendue sur erreur, promesse retirée, aperçu non lancé au choix,
garde `already_imported` retirée, « Changer de fichier » qui écrit.
