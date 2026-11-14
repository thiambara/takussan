---
id: TCK-2651
title: "« Loyers » : le bailleur lit d'abord ce qui reste à lui verser, puis chaque bien, et les opérations sans identifiant technique"
status: done
phase: P1
family: front
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-14
depends_on: [TCK-2649, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691, TCK-2760]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#101-ownerstatementsnapshot-"
tags: [front, payments, payouts, owners, mobile, audit-ux, app]
---

## Objectif utilisateur

Le bailleur, souvent dans la diaspora, ouvre ses revenus et lit sans appeler l'agence :

- ce qui reste à lui verser, et quand ;
- comment son encaissé se décompose ;
- où en est chacun de ses biens ce mois-ci.

Il télécharge son relevé et son attestation annuelle.

## Contrat de données

- `GET /api/owner-statements?period=` avec `next_payout` et `properties[]` enrichi (TCK-2649), et **`balance.remaining_to_pay`**, le solde cumulé au jour (TCK-2760). Exports `/pdf` et `/csv`, existants.
- **Le reste à verser est le solde cumulé**, décidé par le porteur le 2026-11-12 ([ADR-0100](../../../adr/0100-une-page-paiements-par-public.md), amendement du 2026-11-12) : tout le net dû moins tout le versé, arrêté au jour, quel que soit le mois choisi. `totals.remaining_to_pay` est l'écart **du mois** (net du mois moins versé du mois). Sur la démo, il vaut le net du mois moins le versement du mois précédent (1305 reversements sur 1305 versés le mois suivant) : ce n'est pas ce que l'agence doit au bailleur.
- Le registre, les factures et les reversements : les endpoints existants de `PaymentsTabs`, inchangés.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-paiements&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écran « Bailleur — Mes revenus », au téléphone et au bureau.
- **Titre** : **« Loyers »** (décidé par le porteur le 2026-11-10, [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md) § 3), le même mot que l'onglet et l'entrée de menu (TCK-2618), avec le sélecteur « Novembre 2026 ▾ » en français. La maquette titre « Mes revenus » : ce n'est pas une référence de libellé. « Mes revenus » ne subsiste qu'en carte de tête (« Ce qui vous revient en novembre »).
- **Carte de tête** : « Reste à vous verser », le montant (le solde cumulé au jour, qui ne change pas avec le mois choisi), puis « Prochain versement prévu le … par … » quand un reversement est programmé.
- **Ventilation** : Encaissé · Commission (taux) · Interventions · Déjà versé — **ceux du mois choisi**. Elle ne se soustrait pas en tête : « Reste à vous verser » n'est pas Net − Déjà versé du mois (ADR-0100, amendement du 2026-11-12, § 7).
- **Documents** : « Relevé PDF », « Attestation annuelle », et le CSV, gardé.
- **« Par bien »** : bien, locataire, loyer, état du mois (« Payé ✓ », « En retard de 6 j »).
- **« Toutes les opérations › »** : le registre actuel, où le bien et le locataire sont nommés.
- **Bureau (≥ 1280 px)** :
  - deux colonnes dès `lg` : le relevé à gauche, le tableau par bien à droite ;
  - onglets « Revenus · Versements · Factures · Opérations ».
- **Téléphone (360-390 px)** : le reste à verser et sa date dans le premier écran. Les onglets défilent avec un indice visible.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md).

**Rien ne se perd** (audit famille 4, § 5, *Fonctions existantes* 4-6, lues dans `PaymentsTabs.tsx` et `OwnerStatementPanel.tsx`), pour le bailleur :

- registre filtrable (statut, du / au) ;
- factures et leur détail ;
- reversements et leur détail ;
- relevé au mois ou « Toute l'année (attestation annuelle) » : Encaissé, Commission, Interventions, Net, Déjà versé, pénalités dues ;
- **PDF et CSV** ;
- le rectificatif d'un relevé déjà envoyé (TCK-2321), tel qu'il est servi aujourd'hui.

Autres contraintes :

- **Le reste à verser est `balance.remaining_to_pay`**, jamais `totals.remaining_to_pay` (l'écart du mois), jamais une soustraction faite dans le front. Aucun écran de ce ticket n'affiche `totals.remaining_to_pay` sous un libellé « Reste à verser ».
- **Aucun identifiant technique visible** dans les quatre onglets :
  - pas de « #8 » pour un bailleur (`PayoutsTable.tsx:88`) ;
  - pas de « Bail #63 » ;
  - les filtres « Type d'entité » et « ID entité · Ex: 42 » disparaissent pour le bailleur, remplacés par bien et locataire nommés.
- **Sélecteur de mois** : un composant de l'application, jamais `<input type="month">`. Il affiche « Interventions 0 F », jamais « -0 F CFA ».
- **Décision famille 4 n° 4a** (une page par public) : `/app/payments` sert le locataire (TCK-2650) et le bailleur (ce ticket). Le personnel garde son accès actuel tant que la page Argent de la famille 6 n'a pas repris les factures, les reversements et les factures de prestataires. La redirection du personnel est portée par TCK-2677.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, montants par `useFormatteurs()`.

## Delta à produire

- [x] Page « Loyers » pour le profil bailleur : carte de tête, ventilation, documents, « Par bien ».
- [x] Onglets « Revenus · Versements · Factures · Opérations ». Le registre sans identifiants techniques.
- [x] Sélecteur de mois localisé.
- [x] Tests :
  - reste à verser lu sur `balance`, avec une réponse où `balance.remaining_to_pay` ≠ `totals.remaining_to_pay` ;
  - « Par bien » égal à `properties[]` ;
  - aucun « #n » ni « ID entité » rendu ;
  - mois localisé ;
  - exports présents.

## Critères d'acceptation

- [x] AC1 — owner1, novembre : le montant de « Reste à vous verser » est exactement `balance.remaining_to_pay` de la réponse réseau, **et diffère** de `totals.remaining_to_pay` de la même réponse. Sur la démo, ils diffèrent puisque l'agence verse le mois suivant. Sinon, le test du front le prouve sur une réponse simulée où ils diffèrent. Choisir octobre ne change pas ce montant, alors que la ventilation change.
  - **Preuve** : démo, `GET /api/owner-statements` de `proprietaire` (owner1), le 2026-11-14 : novembre `balance.remaining_to_pay` = 12 058 360, `totals.remaining_to_pay` = 3 117 369 ; octobre : `balance` 12 058 360 inchangé, `totals` 220 751, encaissé 6 435 000 contre 11 437 597. Front : `src/components/payments/bailleur/__tests__/LoyersDuBailleur.tck-2651.test.tsx` « AC1 » (réponse simulée où les deux diffèrent ; octobre ne change pas le montant de tête, la ventilation change) ; ablation A1 (lire `totals.remaining_to_pay`) → rouge.
- [x] AC2 — « Par bien » rend une ligne par élément de `properties[]`, avec son titre et son locataire. Un bien en retard dit « En retard de N j ».
  - **Preuve** : `src/components/payments/bailleur/__tests__/LoyersDuBailleur.tck-2651.test.tsx` « AC2 » (trois `properties[]` → trois lignes au téléphone et trois `tr` au bureau, titre, locataire, « En retard de 6 j ») ; ablations A4/A5 → rouges.
- [x] AC3 — Dans les quatre onglets, le DOM ne contient ni « ID entité » ni un motif `#\d+` pour désigner un bailleur, un bail ou une facture.
  - **Preuve** : `src/components/payments/bailleur/__tests__/LoyersDuBailleur.tck-2651.test.tsx` « AC3 » × 4 onglets, détail de facture et de versement ouvert ; aucun `#\d+`, ni « ID entité », ni « Type d'entité » ; « Opérations » nomme « bien · locataire ». Ablations A2, A3 (dialogues), A6 (`filter[landlord_id]`), A7 (entité nommée) → rouges.
- [x] AC4 — Le sélecteur affiche « novembre 2026 » en `fr`, et le changer recharge le relevé avec `period=2026-11`. `grep 'type="month"'` ne rend rien dans les écrans touchés.
  - **Preuve** : `src/components/payments/bailleur/__tests__/LoyersDuBailleur.tck-2651.test.tsx` « AC4 » (« novembre 2026 », `period=2026-11` relu, changement par l'adresse, `input[type="month"]` absent) ; `grep -rn 'type="month"' src/components/payments/bailleur` ne rend qu'un commentaire.
- [x] AC5 — À 390 px, le reste à verser et la date du prochain versement sont visibles sans défiler. « Relevé PDF » et « Attestation annuelle » rendent leur fichier.
  - **Preuve** : relevé à 390 × 844 (`fidelite releve`, `proprietaire`, 2026-11-14). « Reste à vous verser 12 058 360 F » est à y ≈ 165 px, dans le premier écran (mesuré). La démo ne sert pas de `next_payout` : la position de la date n'est pas mesurée, elle est **déduite**. `LoyersDuBailleur.tck-2651.test.tsx` « AC1 » rend la phrase dans la carte de tête, au-dessus de la ventilation, et la carte se termine vers y ≈ 250 sans elle. Avec ses deux lignes, elle resterait sous les 844 px. Fichiers sur la démo : relevé PDF 200 `application/pdf`, CSV 200, attestation annuelle 200 `application/pdf`. Le test « les exports » vérifie les URL et le jeton.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [x] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2651.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
  - **Preuve** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2651.json`. L'écran a-4 y est listé avec ses trois références gelées le 2026-11-11, la persona `proprietaire`, la route, l'état reproduit, l'alias « Mes revenus » → « Loyers », dix écarts acceptés avec leur motif et deux écarts ouverts (hauteur des onglets au téléphone, qui relève de TCK-2804 ; trait des icônes de la coque).
- [x] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [x] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [x] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [x] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [x] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.
  - **Preuve** : `fidelite balayer --url /app/payments --persona proprietaire` à 390, 768, 1024 et 1280 : débord 0, aucune coupe, aucune ellipse hors du rail de la coque à 768. La grille ne pose ses colonnes que dès `lg`, en `minmax(0,…)`. La table « Par bien » tient dans sa carte à 1280 et à 1440, même avec un titre et un nom de locataire de 80 caractères (scrollWidth = clientWidth, relevé sous verrou). Sous 1280, elle défile dans son conteneur (`overflow-x-auto`).

## Hors périmètre

- La vue argent de l'agence (TCK-2659) et la redirection du personnel (TCK-2677).
- Le versement programmé et son avis (ambition de l'audit).
- La fiche du bailleur vue par l'agence (TCK-2641).
- L'étiquette de l'onglet et du menu (« Loyers », TCK-2618).

## Notes d'implémentation

- **Routage** (`src/app/(dashboard)/app/payments/page.tsx`) : « Loyers » est rendu à la persona `bailleur` du **profil actif lié** (`resoudrePersona`), jamais à l'union des rôles. Le profil actif est lu **sans attente** dans `active_profile_id` de `/api/auth/me`, que l'API résout depuis le cookie transmis en `X-Active-Profile-Hint`. Un `await getActiveProfileId()` faisait perdre à la page son exemption de repli : TCK-2677, `app/__tests__/etats-de-route.test.ts`, 3 tests rouges. Un agent aussi bailleur, sous son profil d'agent, garde `PaymentsTabs` ; l'hôte (agence individuelle) garde l'écran d'aujourd'hui (ADR-0100 § 5). Titre d'onglet du navigateur : « Loyers ». Tests : `page.loyers.tck-2651.test.tsx` ; ablations P1 (hôte) et P2 (profil actif) rouges.
- **Composants** : `src/components/payments/bailleur/` (`LoyersDuBailleur`, `RevenusDuBailleur`, `SelecteurDuReleve`, `OngletsDesLoyers`, `FiltresDesOperations`, `adresse.ts`, `useTelechargerLeReleve.ts`). La période et l'onglet vivent dans l'adresse (`?period=YYYY-MM|YYYY`, `?tab=`). Les anciens liens `?tab=payouts|invoices|history` mènent à l'onglet qui les remplace.
- **Décisions prises sur recommandation, validées par team-lead le 2026-11-14** :
  1. « Toute l'année YYYY » est une entrée du sélecteur (l'attestation annuelle, `period=YYYY`).
  2. Le taux de commission ne s'affiche que s'il est unique sur les pièces de la période (`tauxUnique`). Il n'est jamais déduit des montants.
  3. « Opérations » borne le registre par `filter[landlord_id]=<lecteur>` : un bailleur aussi locataire n'y lit pas son propre loyer.
     Ce filtre ne fait que restreindre. Le périmètre de lecture reste jugé par l'API (`BailleurDuBien::restreindre` sur le bail, et sur le bien pour une réservation). `takussan-api/tests/Feature/Api/PaymentHistoryFiltreDuBailleurTest.php` épingle ce point : le `landlord_id` d'un autre bailleur de la même agence ne rend ni ligne ni total. Le témoin vérifie que son propre `landlord_id` rend ses deux opérations. Ablation de la garde du bail : rouge. Ablation de la garde du bien sur la réservation : rouge.
- **Sans identifiant technique** : `PayoutsTable`, `InvoicesTable`, `InvoiceDetailDialog` et `PayoutDetailDialog` prennent `sansIdentifiants`. `PaymentsHistoryTable` prend `bailleur={{ id }}` : bien et locataire nommés (`include=property,payer`), filtres bien / locataire à la place de « Type d'entité » et « ID entité ». Le personnel ne voit aucun changement.
- **API inchangée.** Les dix gardes de lecture que l'écran traverse ont été ablatées une à une, et chacune rougit un test existant : `OwnerStatementPolicy`, `properties()` (biens possédés, baux du bailleur), `PaymentHistory` (bail et réservation, `BailleurDuBien::restreindre`), `PayoutController@index`, `PayoutPolicy::view`, `InvoiceController@index`, `InvoicePolicy::view`.
- **Table « Par bien » au bureau** : à 1280 avec les 72 biens d'owner1, la table débordait de sa carte. Les colonnes de texte (bien, locataire) peuvent désormais se rétrécir : `max-w-0` sur la cellule, parts de 30 % et 20 %, deux lignes au plus (`line-clamp-2`, césure `[overflow-wrap:anywhere]`), texte entier dans le DOM et en `title`. Les montants gardent leur largeur et `whitespace-nowrap` (U+00A0). La pastille du mois passe à la ligne. L'écart reste le `gap-3` de la maquette. Preuve, relevé sous verrou le 2026-11-14 avec un titre et un nom de locataire de 80 caractères : scrollWidth = clientWidth (527 à 1280, 687 à 1440), et « Net pour vous » est entier. À 1024, la table défile de 5 px dans sa carte, ce qu'ADR-0106 § 4 admet. Les onglets de 44 px au téléphone relèvent de TCK-2804.
- **Au téléphone**, les actions de l'en-tête (`sr-only`) sont `hidden md:contents`. Sans cela, des boutons invisibles restaient atteignables au clavier. Le sélecteur (pastille de la coque) et les documents (carte « Relevé de novembre ») y ont leur place visible.
- **Sélecteur au bureau** : « ‹ Novembre 2026 ▾ › » comme la maquette. Le « ‹ » est un mois précédent, pas un retour. Une entrée « periode » à la liste fermée de `fleche-de-retour-unique.tck-2617.test.ts` l'admet, validée par team-lead le 2026-11-14, sur le même motif que `FicheDuBailleur` (TCK-2641). Si l'on retire cette entrée, la garde rougit.
- **Décision 18 (a) du porteur, 2026-11-14 — loyer échu remboursé**, précisée par team-lead le même jour :
  - avant, il se lisait « Payé ✓ » : `refunded` est hors de `CollectedPayments::OWED_STATUSES`, donc la période passait pour soldée ;
  - désormais, `RentMonthStatus::of()` rend `refunded` quand rien ne reste dû, qu'aucune échéance n'est payée et que l'une est échue. La pastille est neutre et dit « Reçu puis remboursé » ;
  - **le retard prime** : un mois en retard ET remboursé se lit « en retard » ;
  - remboursée et pas encore échue, l'échéance reste « À venir » (règle de TCK-2820) ; si une échéance de la période est payée, le mois reste « Payé ».
  - **Une seule définition** : le relevé (« Par bien ») et l'occupation d'un bien (TCK-2637 : liste `/app/properties`, carte et bloc « Ce mois » de la fiche, ligne d'échéance de la carte « Loyers ») disent le même libellé. Il n'y a rien à encaisser ni à relancer (`amount_due` = 0), et le bien sort du filtre `rent_late`.
  - **Jamais compté reçu** : ni dans « Reste à vous verser » (`balance`), ni dans l'encaissé du mois, ni dans « Par bien ». Deux gardes de `PayoutCalculator` le tiennent : le statut `paid` et `montant − refund_amount`. Chacune ablatée seule laisse le test vert, puisque l'autre suffit ; les deux ensemble le font rougir. Ce test est épinglé par `OwnerStatementPropertiesTest::test_decision_18_un_loyer_rembourse_n_est_pas_compte_recu_dans_le_reste_a_verser`.
  - Preuves : `OwnerStatementPropertiesTest` (trois tests « decision_18 »), `PropertyOccupancyTest::test_decision_18_…`, `LoyersDuBailleur.tck-2651.test.tsx` « décision 18 », `etat-locatif.test.ts`, `FicheDuBien.tck-2639.test.tsx` « décision 18 ».
  - Ablations, faites une à une et md5 restaurés, toutes rouges : borne d'échéance retirée ; cas mixte compté remboursé ; `refunded` avant le retard ; front sans `case 'refunded'` (relevé, occupation) ; ligne d'échéance sans `refunded`.
- **Hors écran bailleur** : `OwnerStatementPanel` (personnel, `type="month"`) n'est pas touché.
- **Démo, 2026-11-14** (`proprietaire`) : relevé PDF du mois 200 `application/pdf`, CSV 200 `text/csv`. Attestation annuelle (`period=2026`) : 200 `application/pdf` (83 438 octets). Un premier essai, juste après le PDF du mois, avait rendu 500 `CouldNotGeneratePdf` (« Rate limit exceeded » du pilote Cloudflare) : c'est une limite du service externe, pas l'écran.
- **Fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2651.json`, relevés à 390 et 1280 seulement (1440 non relevé).

- 2026-11-14 : relevés de clôture au HEAD 928e9c810 (fiche de fidélité à jour), AC-F validés par le porteur sur le rideau (« je valide tout ») ; tableau par écran et appareil dans la PR #1671. Ticket clos.
