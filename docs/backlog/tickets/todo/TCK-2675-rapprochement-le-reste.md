---
id: TCK-2675
title: "Rapprochement : le reste à rapprocher d'abord, l'import comme moyen"
status: todo
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2674]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#40-bankstatement-"
    - "docs/models-spec.md#41-bankstatementline-"
tags: [front, finances, reconciliation, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin voit l'ampleur réelle du travail (34 paiements, pas 846), confirme d'un geste les correspondances sûres, et sait quoi importer quand il manque le relevé.

## Contrat de données

- `GET /api/agencies/{agency}/reconciliation/overview`, `…/pending-payments`, `…/bank-statement-lines` (recherche), `POST …/bank-statement-lines/confirm-batch` (TCK-2674).
- Existants : import, liste et détail des relevés, mapping CSV, `match` (POST / DELETE), `ignore`, `finalize`, `payment-search` ; intégrations actives (`/app/agency/integrations`).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-rapprochement&a=c` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Reste à rapprocher » et « Aucun relevé », téléphone et bureau.
- **Téléphone** : deux compteurs (« 812 confirmés par Wave et Orange Money », « 34 à rapprocher · espèces et virements »), la phrase « Novembre · 846 paiements · 96 % déjà rapprochés, sans relevé » ; pastilles Tout · Avec suggestion · Espèces · Virements ; une carte par paiement déclaré (payeur, bien, montant, date, moyen) et la ligne de banque proposée (date, libellé, confiance) avec « Confirmer », ou « Aucun dépôt en banque ne correspond encore » et « Chercher » ; section « Relevés » : « Importer un relevé bancaire » et les relevés en cartes.
- **Bureau** : en-tête « Rapprochement bancaire » dans le fil « Argent › … », mois ; les deux compteurs et une barre de progression ; bandeau « 19 suggestions à plus de 90 % » et « Confirmer les 19 » ; tableau Paiement déclaré · Montant · Ligne de banque proposée · Confiance · actions (Confirmer, Délier, Chercher) ; à droite dès `lg`, « Paiements en ligne » (fournisseurs connectés et leurs comptes, lien Intégrations) et « Relevés importés » avec « Importer ».
- **Aucun relevé** : « Il ne manque que le relevé de la banque », ce qui est déjà rapproché, et le bouton d'import.

## Contraintes strictes (métier)

Fonctions existantes à garder (`reconciliation/page.tsx`, `[statementId]/page.tsx` et `layout.tsx`, `ReconciliationClient.tsx`, `ImportStatementForm.tsx`, `StatementsList.tsx`, `CsvMappingForm.tsx`, `StatementDetail.tsx`, `PaymentSearchDialog.tsx`, `PayableStatusBadge.tsx`) :

- Import CSV ou OFX (format, banque facultative, « Relevé reçu : l'analyse est en cours »).
- Liste des relevés (période, statut, avancement, lignes non lues signalées).
- Paramétrage CSV complet (séparateur, en-tête, format de date, sept colonnes, signe, séparateur décimal obligatoire et expliqué, milliers) — **déplacé en « Réglages de l'import »**, plus la première chose vue ; en français (« Date », « Montant », « Libellé »… et non `date`, `amount`, `label`), le format de date choisi sur un exemple (« 10/11/2026 ») et non `d/m/Y`.
- Détail d'un relevé : filtres, lignes, doublons, Valider · Chercher · Ignorer · Délier, « Finaliser le relevé », pagination ; **au téléphone, en cartes** (aujourd'hui un tableau à six colonnes).
- Identifiant mal formé → 404 ; relevé introuvable → « Ce relevé n'existe pas » et un retour vers la liste (plus « Réessayer » sur un relevé qui n'existe pas).
- Retour vers « Argent » depuis la page ; capacité `payments.reconcile`.
- **Ne rien promettre que le produit ne fait pas** : aucune liste de « banques prises en charge » (les préréglages n'existent pas, D-67 : « CSV ou OFX de votre banque ») ; aucun « on vous montre ce qu'on a lu avant d'importer » (l'aperçu n'existe pas).
- Le sélecteur de fichier est un vrai bouton traduit (plus le contrôle natif « Choose File »).
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement ; montants via `useFormatteurs()`.

## Delta à produire

- [ ] Page « reste à rapprocher » (téléphone et bureau) avec compteurs, pastilles, cartes / tableau, confirmation unitaire et groupée, recherche d'une ligne.
- [ ] État « aucun relevé ».
- [ ] Paramétrage CSV en réglages avancés, en français.
- [ ] Détail d'un relevé en cartes au téléphone ; relevé introuvable.
- [ ] Tests : compteurs lus de l'API ; « Confirmer les 19 » n'envoie que les lignes ≥ 90 % ; pastille Espèces filtrée côté serveur ; relevé introuvable ; aucun libellé de colonne en anglais.

## Critères d'acceptation

- [ ] AC1 — « Confirmer les 19 » envoie un seul `confirm-batch` à 19 identifiants, tous de confiance ≥ 90 % (vu au réseau), et les 19 cartes disparaissent.
- [ ] AC2 — La pastille « Espèces » envoie `filter[payment_method]=cash` ; le nombre de cartes égale `meta.total`.
- [ ] AC3 — `/app/agency/finances/reconciliation/999` (inexistant) affiche « Ce relevé n'existe pas » et un lien vers la liste, sans bouton « Réessayer ».
- [ ] AC4 — À 390 px, le détail d'un relevé n'a pas de défilement horizontal ; « Valider » d'une ligne est à l'écran.
- [ ] AC5 — Les réglages de l'import n'affichent ni `date`, ni `amount`, ni `label`, ni `d/m/Y` dans le DOM.

## Hors périmètre

- L'import guidé avec aperçu (approche A) et la validation en pile (approche B), non retenus.
- Les préréglages de banques (D-67).
- L'entrée « Rapprochement » dans le menu (famille 3).

## Notes d'implémentation

_(à remplir par implementing-specs)_
