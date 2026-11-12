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
depends_on: [TCK-2674, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
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

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2675.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- L'import guidé avec aperçu (approche A) et la validation en pile (approche B), non retenus.
- Les préréglages de banques (D-67).
- L'entrée « Rapprochement » dans le menu (famille 3).

## Notes d'implémentation

**2026-11-12 — implémenté (terrain-5), branche `feat/audit-ux-app-lot-2`.** Front seul : le contrat de TCK-2674 suffisait.

**Reste à rapprocher** — `src/components/admin/reconciliation/reste/` (`ResteARapprocher.tsx`, `pieces.tsx`, `ChercherUneLigne.tsx`, `FenetreAdaptee.tsx`, `fournisseurs.ts`) ; la page monte `ResteARapprocher` (`ReconciliationClient` supprimé : ses trois blocs vivent dans l'écran, l'import et les réglages en fenêtres).
- Le mois vient de `?period=YYYY-MM` (le mois courant sinon) ; au bureau, le sélecteur de « Argent » (`SelecteurDeMois`). Fil « Argent › Rapprochement bancaire » dès `md`, « ← Rapprochement » (en-tête de la coque) au téléphone.
- **Compteurs lus de `…/overview`, chaque phrase calculée** : « Confirmés tout seuls » (par fournisseur, `by_provider`), « À rapprocher » (par moyen, `by_method`), la jauge et « {mois} · N paiements · P % déjà rapprochés » — `confirmed_automatically + reconciled_manually` sur `payments_total` ; « , sans relevé » seulement si tout le rapproché l'a été par une passerelle. Sans fournisseur ce mois-ci : « Aucun ce mois-ci », aucun nom inventé. Le sous-titre de la maquette (« Ce que Wave et Orange Money ont confirmé… Il reste les espèces et les virements ») devient une phrase sans données : elle serait fausse sur la démo (aucun règlement de passerelle, 30 paiements Wave à rapprocher).
- **Pastilles filtrées côté serveur** : Tout · Avec suggestion (`filter[has_suggestion]=1`, compte = `meta.total` d'une page d'un élément) · Sans ligne de banque (bureau, comme la maquette) · une par moyen compté (`filter[payment_method]=<moyen>`). Les comptes sont ceux de l'API.
- **Liste** : 20 paiements, les montants les plus élevés d'abord (tri de l'API) ; « Afficher les N autres » lit toutes les pages (100 par appel) jusqu'à `meta.total`. Téléphone : une carte par paiement (payeur, bien, montant, moyen et date ; la ligne proposée « Sur le relevé {banque} · {jour} », libellé, confiance ; « Confirmer », « Autre ligne ») ou « Aucun dépôt en banque ne correspond encore à ce paiement. » et « Chercher ». Bureau : le tableau de la maquette (la confiance rejoint la ligne sous 1440), « Confirmer », « Délier » et « Chercher » ; pied « N lignes affichées sur T · les montants les plus élevés d'abord ».
- **« Confirmer les N »** : lit TOUTES les suggestions du filtre (`has_suggestion=1`, toutes pages), ne retient que les lignes à 90 % et plus (règle « montant et référence exacts », 95 — d'où « même montant, même référence »), sans doublon, 200 au plus ; un seul `confirm-batch`. Aucun retrait anticipé : la liste se relit après la réponse, et après un refus (`relireSurErreur`) — un 422 `reconciliation.batch_not_confirmable` dit que l'écran a vieilli, et le message de l'API s'affiche.
- **Chercher une ligne** (`ChercherUneLigne`) : `GET …/bank-statement-lines` — crédits des relevés ouverts, au montant (± 1, modifiable), les plus récents d'abord ; « Rapprocher » sur une ligne libre ou proposée, l'état des autres sans geste.
- **Aucun relevé** : « Il ne manque que le relevé de la banque », puis, tirés du point du mois, « Tout ce qui est passé par {fournisseurs} est déjà rapproché. » (seulement s'il y en a) et « Pour les N paiements qui restent, importez le relevé de votre banque. » ; « Importer un relevé » ; « CSV ou OFX de votre banque » (D-67). **Ni « Banques prises en charge », ni « on vous montre ce qu'on a lu avant d'importer »** (rien de cela n'existe). Rien à rapprocher du mois : « Rien à rapprocher en {mois} » — l'import reste offert (en-tête, section « Relevés », colonne de droite).
- **Paiements en ligne** (colonne de droite dès `xl`) : les intégrations ACTIVES d'un fournisseur de paiement, lues côté serveur (`fournisseursConnectes`), « Connecté », et « N confirmés en {mois} » d'après `by_provider`. Lecture des intégrations en échec : la carte n'est pas rendue (rien n'est affirmé).
- **Relevés** : `StatementsList` en cartes (banque et statut, période et « X / Y rapprochées », jauge, lignes non lues signalées) — colonne de droite du bureau ; au téléphone, section « Relevés » : « Importer un relevé bancaire », « Réglages de l'import », deux relevés puis « Voir les N relevés ».

**Import et réglages** — en fenêtres (feuille du bas au téléphone, dialogue au bureau). Le sélecteur de fichier est un bouton traduit (« Choisir un fichier », « Aucun fichier choisi », puis le nom du fichier) ; le champ natif reste dans le formulaire, masqué. « Réglages de l'import » (et non « Colonnes par banque ») : séparateur, en-tête, **format de date choisi sur l'exemple du 25 novembre 2026** (« 25/11/2026 », « 2026-11-25 »… ; un jour au-delà de 12 départage jour/mois — l'option porte une clé neutre, le format PHP n'est écrit qu'à l'envoi ; un format enregistré hors de la liste reste proposé, « Autre forme : … »), colonnes en français (« Date », « Montant », « Libellé », « Référence », « Contrepartie », « Devise », « Sens »), signe, séparateur décimal obligatoire et expliqué, milliers. Les noms de colonnes PAR DÉFAUT de l'API (`date`, `amount`, `label`, `reference`, `counterparty`, `CsvDriver::DEFAULT_MAPPING`) s'affichent vides, à indiquer : « Date » et « Montant » sont exigés avant l'envoi, l'erreur sur le champ.

**Détail d'un relevé** — au téléphone, une carte par ligne (date · sens, montant, libellé, référence et contrepartie, doublon, rapprochement et confiance, puis Valider · Chercher · Ignorer · Délier) ; dès `md`, le tableau d'avant. Un relevé inconnu (404) ou d'une autre agence (403) : « Ce relevé n'existe pas », une phrase, « Retour au rapprochement » — plus de « Réessayer » ; une panne (5xx, réseau) le garde.

Restes, notés pour la suite :
- **« Ignorer » un paiement** (maquette, rangée sans ligne de banque) : aucune route ne le permet (`ignore` porte sur une LIGNE de relevé) ; la rangée offre « Chercher » à la place.
- **Une colonne réellement nommée `date`, `amount` ou `label`** dans le fichier d'une banque se relit vide après l'enregistrement (le front ne distingue pas « jamais réglé » de « réglé avec ces noms ») et redemande le champ : l'API devrait dire si le paramétrage est celui par défaut.
- Au téléphone, le mois suit `?period=` (la maquette n'y a pas de sélecteur) ; le lien de « Argent » ne le transmet pas encore.
- « Délier » n'est offert qu'au bureau (la carte du téléphone suit la maquette : « Confirmer », « Autre ligne »).
