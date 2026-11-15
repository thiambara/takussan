---
id: TCK-2760
title: "Le reste à verser au bailleur est un solde cumulé arrêté au jour : `balance` dans le relevé, le même chiffre sur la fiche et au carnet"
status: done
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-12
updated: 2026-11-14
depends_on: []
blocks: [TCK-2651, TCK-2753]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#101-ownerstatementsnapshot-"
tags: [back, payments, payouts, owners, audit-ux, app]
---

## Objectif utilisateur

Le bailleur lit en tête de sa page ce que l'agence lui doit **aujourd'hui**, que l'agence verse dans le mois ou le mois suivant.

## Contrat de données

Décision : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md), **amendement du 2026-11-12** (décision 4 (a) du porteur).

Relevé du 2026-11-12 (0bec981e2) :

- `totals.remaining_to_pay` = `net − paid_out` **de la période** (`OwnerStatementService::figures`, `remainingToPay`).
- Sur la base de démo, 1305 reversements au bailleur sur 1305 sont versés le mois suivant leurs pièces (contre-sonde de verif-patrimoine, lecture seule). Le reste de novembre y est donc le net de novembre moins le versement des loyers d'octobre.

À servir :

- **`GET /api/owner-statements?period=`** gagne `balance: { remaining_to_pay: number, as_of: "YYYY-MM-DD" }`.
  - C'est le solde cumulé **au jour**, quelle que soit la période demandée.
  - `as_of` est la date du jour à Dakar.
- **La fiche bailleur** (`GET /api/owners/{id}`, servie par `OwnerDirectory`) gagne le même `balance`, à côté de `figures`, qui reste le bloc du mois.
- **Le carnet** (`GET /api/owners`) : le solde cumulé au jour remplace le reste du mois dans quatre lecteurs :
  - `remaining_to_pay` de chaque ligne ;
  - le filtre qui le lit (`OwnerProfile`, `OwnerDirectory::remainingToPayIn`) ;
  - le tri `sort=-remaining_to_pay` (`OwnerRemainingToPaySort`) ;
  - `summary.remaining_to_pay` / `with_remaining` (`OwnerDirectory::summary`).
- **Le PDF et le CSV du relevé** n'impriment pas `remaining_to_pay` (relevé du 2026-11-12 : aucune occurrence dans `resources/views` ni dans `lang/`). Ils ne changent pas.
- **`totals.remaining_to_pay`** et **`figures.remaining_to_pay`** restent, inchangés : ce sont les écarts **de la période**. Les instantanés envoyés les portent figés.

## Contraintes strictes (métier)

- **Un seul calcul.** Le solde est `OwnerStatementService::remainingToPay()` appliqué aux totaux de `figures()` sur la fenêtre `[origine, aujourd'hui]`. L'origine est une constante, antérieure à toute donnée.
  - Pas de seconde formule : ni somme SQL du net et du versé, ni soustraction dans le front.
  - Une méthode pour un bailleur, une pour plusieurs. Le nombre de requêtes de la seconde ne dépend pas du nombre de bailleurs, comme `totalsFor` (TCK-2640).
- **Arrêté au jour.** Le solde ne dépend pas de `period`.
- **Hors instantané.** `OwnerStatementSnapshots::record()` retire `balance` du payload, comme `next_payout`. `served()` le sert au jour. Les totaux d'un mois envoyé ne changent pas (TCK-2321).
- **Le signe.** Le solde est rendu tel quel, négatif compris. `summary.remaining_to_pay` ne somme que les soldes positifs, et `with_remaining` ne compte qu'eux, comme aujourd'hui.
- **Portée.** Le solde est celui du bailleur **dans l'agence** du relevé, et les pièces d'une autre agence n'y entrent pas : c'est la règle de `figures()`.
- **Le droit de lire** ne change pas : `OwnerStatementPolicy`, et la policy de la fiche et du carnet.

## Delta à produire

- [ ] `OwnerStatementService` :
  - [ ] la constante d'origine ;
  - [ ] `balances(Agency $agency, array $landlordIds): array` (par bailleur : `remaining_to_pay`, `as_of`) et `balance(Agency, User)`, sur `figures()` ;
  - [ ] `statement()` rend `balance`.
- [ ] `OwnerStatementSnapshots` : `record()` retire `balance`, `served()` sert celui du calcul du jour.
- [ ] `OwnerDirectory` : `balance` sur la fiche ; la ligne du carnet, la somme de tête et le tri lisent `balances()`. `monthFigures()` garde `collected` du mois.
- [ ] `OwnerRemainingToPaySort` : trie sur le solde.
- [ ] Docblocks : `remainingToPay`, `monthFigures` et `summary` disent quel chiffre ils rendent.
- [ ] Tests : `OwnerStatementBalanceTest` (nouveau). `OwnerStatementRemainingTest`, `OwnerListSummaryTest`, `OwnerProfileListFiguresTest`, `OwnerDetailMoneyTest` et `OwnerStatementSnapshotUnchangedTest` sont mis à jour là où ils lisaient le reste de période sous le nom du carnet.

## Critères d'acceptation

Fixture commune : un bailleur L d'une agence A, commission de 10 %.

- Loyer d'octobre de 100 000 encaissé le 5 octobre.
- Reversement de 90 000 versé le **3 novembre**.
- Loyer de novembre de 100 000 encaissé le 5 novembre, pas encore reversé.
- Date simulée : le 20 novembre.

- [ ] **AC1 — Le cas qui discrimine.**
  - `period=2026-11` : `totals.remaining_to_pay` = 0 (90 000 − 90 000) et `balance.remaining_to_pay` = 90 000.
  - `period=2026-10` : `totals.remaining_to_pay` = 90 000, et `balance.remaining_to_pay` reste 90 000. Le solde ne dépend pas de la période.
  - `balance.as_of` = `2026-11-20`.
  - Ablation : servir `totals.remaining_to_pay` à la place du solde rend le test rouge.
- [ ] **AC2 — L'invariant.** Le bailleur M a six mois d'histoire :
  - une reprise (ADR-0039) **imputée** sur un reversement terminé ;
  - une facture d'intervention imputée ;
  - un reversement qui porte des pièces de deux mois.

  La somme des `totals.remaining_to_pay` des six relevés mensuels est égale à `balance.remaining_to_pay`, à 0,01 près par mois. Ablation : compter le versé sans `clawback_amount` dans le seul calcul du solde (une seconde formule) rend le test rouge.
- [ ] **AC2 bis — La reprise ne change pas le solde.** Une reprise datée et **non imputée** ne change pas `balance.remaining_to_pay` : même valeur avant et après le remboursement qui la crée. `PayoutClawbacks::outstanding` la rend.
- [ ] **AC3 — Le relevé envoyé.**
  - Le relevé d'octobre de L est enregistré (`record`) avant le reversement du 3 novembre.
  - Le 20 novembre, `served(octobre)` rend les `totals` figés à l'envoi, et `balance.remaining_to_pay` = 90 000, au jour.
  - Le payload en base ne contient pas la clé `balance`.
  - `rectification` est nul : le solde, vivant, ne fait pas naître de faux rectificatif.
- [ ] **AC4 — Un chiffre, trois lecteurs.**
  - Pour L, `balance.remaining_to_pay` du relevé, `balance.remaining_to_pay` de la fiche et `remaining_to_pay` de sa ligne au carnet sont égaux, le 20 novembre.
  - Le reste **de période** de la fiche (`figures.remaining_to_pay`) vaut 0. Le test échoue si le carnet ou la fiche lisent le reste de période.
- [ ] **AC5 — Le tri et la somme.**
  - Deux bailleurs, dont l'ordre selon le reste de période est **l'inverse** de l'ordre selon le solde : `sort=-remaining_to_pay` suit le solde.
  - Un troisième, trop versé (solde négatif), n'entre ni dans `summary.remaining_to_pay` ni dans `with_remaining`. Son solde est rendu négatif sur sa ligne. Le trop-versé se construit par un reversement terminé dont le net dépasse celui de ses pièces, inséré directement : aucun geste de l'application ne le produit.
- [ ] **AC6 — Les requêtes.** Le carnet d'une page de 2 bailleurs et celui d'une page de 6 émettent le même nombre de requêtes.
- [ ] **AC7 — Le coût, mesuré.**
  - Le temps de `GET /api/owners?sort=-remaining_to_pay` (agence d'owner1) et de `GET /api/owner-statements?period=2026-11` (owner1) est relevé sur la base de démo, avant et après le ticket, avec les trois moyennes d'`uptime` et `sysctl -n hw.ncpu`. Les chiffres vont dans les Notes.
  - S'il dépasse une seconde, le ticket le signale au porteur. Le report du solde (ADR-0100, amendement, Conséquences) est la suite prévue, et ce ticket ne l'implémente pas.

## Hors périmètre

- Les écrans :
  - la page « Loyers » lit `balance` (TCK-2651) ;
  - la fiche bailleur du front (`FicheDuBailleur`) lit encore `figures.remaining_to_pay`. Elle doit lire `balance.remaining_to_pay` sous le libellé « Reste à verser » : à porter par le ticket de la fiche (TCK-2641) ou par un correctif d'une ligne ;
  - le carnet du front lit `remaining_to_pay` de la ligne, dont seule la valeur change : rien à faire.
- Le solde reporté (instantané plus mois courant), si la mesure de l'AC7 le demande.
- Les exports PDF et CSV du relevé : ils restent ceux de la période.

## Notes d'implémentation

### Prémisse re-mesurée (2026-11-12)

Dans `figures()`, `net = net_calculé − reprises datées` et `paid_out = Σ(net_amount + clawback_amount) − reprises datées`. Le reste `net − paid_out` vaut donc `net_calculé − Σ(net_amount + clawback_amount)` : les reprises s'annulent, imputées ou non. Une reprise ne rend pas le solde négatif (note de redac-1 confirmée, AC2 bis). Tous les postes de `figures()` sont additifs d'un mois à l'autre, donc la somme des restes mensuels rejoint le reste de la fenêtre cumulée (AC2).

### Ce qui est fait

- `OwnerStatementService` :
  - `BALANCE_ORIGIN = '2000-01-01'` ;
  - `balances(Agency, array)` et `balance(Agency, User)` : `remainingToPay()` sur les totaux de `figures()` de la fenêtre `[origine, aujourd'hui à Dakar]`, avec `as_of` = ce même jour (`OverdueInstalment::TIMEZONE`) ;
  - `statement()` rend `balance`. Son paramètre `withBalance: false` l'omet : l'instantané ne le calcule pas.
- `OwnerStatementSnapshots` : `record()` appelle `statement(…, withBalance: false)`, et `served()` sert `balance` depuis le calcul du jour. `rectification()` ne compare que `totals` et `lines`, donc le solde ne fait naître aucun rectificatif.
- `OwnerDirectory` :
  - `remainingToPay()` lit `balances()`, une passe par agence (helper `byAgency`), ce qui couvre le filtre `has_remaining`, le tri et la somme de tête ;
  - `monthFigures()` garde `collected` du mois (`servedTotals`) et prend `remaining_to_pay` du solde ;
  - la fiche gagne `balance`, `null` sans la règle d'argent (`readsMoney`), comme `figures`.
- Docblocks : `remainingToPay` (les deux), `monthFigures`, `summary`, `remainingToPayIn`, l'en-tête d'`OwnerDirectory`, `OwnerRemainingToPaySort`, et le filtre et le tri d'`OwnerProfile`.

### Tests

- `tests/Feature/Payout/OwnerStatementBalanceTest.php` (nouveau, 7 tests). AC1 à AC6, en plus :
  - `has_remaining=1` suit le solde (AC4) ;
  - le solde servi avec un mois envoyé bouge quand un encaissement arrive, les totaux non (AC3).
- La fixture d'AC2 passe par les gestes de l'application :
  - `POST /api/payouts` pour les reversements ;
  - une facture imputée par le reversement ;
  - un remboursement par webhook, qui crée la reprise imputée au reversement suivant.
- `OwnerProfileListFiguresTest::test_le_reste_a_verser_est_celui_du_releve_servi` : la moitié « la ligne est figée par l'instantané » contredit la décision 4 (a). Elle est réécrite : la ligne suit le solde du jour (+180 000), et les totaux du mois envoyé restent figés.
- `OwnerDetailMoneyTest` : `balance` est nul sans `payouts.create` (GET et PATCH) et rendu à l'admin qui tient le relevé.
- Tests verts :
  - les 5 classes du delta et `OwnerStatementBalanceTest` ;
  - `OwnerStatementTest`, `OwnerStatementSnapshotTest`, `PayoutClawbackTest`, `PayoutLateFeeTest`, `OwedRemainderTest`, `PenalitesARecouvrerTest`, `NomsVidesDesLecteursTest`, `LandlordCompanyNameTest`, `OwnerProfileShowTest`, `DocumentVaultOwnerTest`, `DocumentVaultPrimedVaultParityTest`, `EffacementBailleurReversementTest`, `ReleveDeGeranceMoisTest`, `OwnerStatementPropertiesTest`, `OwnerStatementBeneficiaryTest`.

### Ablations, une à une, toutes rouges

| Mutant | Rouge |
|---|---|
| m1 : `balance` = `totals.remaining_to_pay` | AC1, AC2, AC3, AC4 |
| m2 : versé sans `clawback_amount` dans le seul solde | AC2 (225 000 contre 180 000) |
| m3 : la ligne du carnet lit le reste du mois | AC4, AC5, AC6, `OwnerProfileListFiguresTest` (2) |
| m4 : `balance` de la fiche = reste du mois | AC4 |
| m5 : l'instantané garde `balance` | AC3 |
| m6 : m5, et `served()` garde le solde de l'instantané | AC3 (à la 1ʳᵉ assertion ; les suivantes, `as_of` et 108 000, non mesurées seules) |
| m7 : tri, filtre et somme lisent le reste du mois | AC4 (`has_remaining`), AC5 (tri) ; rejoué après avoir placé la somme de tête avant le tri : AC5 rouge sur la somme (90 000 contre 360 000) |

### AC7 — le coût, mesuré

Mesures sur la base de démo, machine **non au repos** (8 cœurs, `hw.ncpu` 8) :

- agence 1 (owner1@dakarimmo.sn), 12 profils de bailleur ;
- 4 appels par le noyau HTTP (`tinker --execute`), en lecture seule.

| | Avant (22:33, `uptime` 5,45 9,03 10,82) | Après (22:46 et 22:47, `uptime` 6,17 8,76 9,71, puis 5,54 8,27 9,49) |
|---|---|---|
| `GET /api/owners?sort=-remaining_to_pay` | 572 à 738 ms | 1035 à 1989 ms, puis 1961 à 2058 ms |
| `GET /api/owner-statements?period=2026-11` (owner1) | 207 à 281 ms | 133 à 174 ms, puis 163 à 252 ms (dans le bruit) |

**Le carnet dépasse une seconde : à signaler au porteur.**

- La page fait **trois passes cumulées** sur toute l'histoire de l'agence : le tri (`remainingToPayIn`), la ligne (`monthFigures`) et la somme de tête (`summary`). `filter[has_remaining]` en ajoute une **quatrième**. Avant, ces passes portaient sur un mois.
- `balances()` sur l'agence entière seule : 417 à 480 ms.
- Piste intermédiaire avant le report du solde : un mémo **par requête** des soldes par bailleur ramènerait les trois passes à une. Il n'est pas fait : le ticket réserve la suite au porteur, et un mémo mal borné (au processus) servirait un chiffre périmé.
- Plafond des paramètres liés de PostgreSQL (65 535) dans `payoutsCarrying()` : sur la démo, l'agence 1 (la plus fournie, 214 biens) lie 392 pièces de loyer et 89 acomptes. Loin du plafond, mais il croît avec l'histoire de l'agence, sans borne.

### Le solde sur la base de démo (lecture seule)

Pour les 12 bailleurs de l'agence 1, le solde a été confronté à la somme des restes annuels 2023 à 2026, sur le calcul du jour.

- **Il est égal pour 3 bailleurs.** Pour les 9 autres, l'écart vaut **exactement** le versé des reversements `completed` dont `processed_at` est **dans le futur** (du 1ᵉʳ au 5 décembre 2026). Exemple : le bailleur 17 a 9 reversements, soit 13 241 066 d'écart, au franc près.
- Le solde, arrêté au jour, ne les compte pas. L'attestation 2026 les compte.
- **Sur toute la base, 119 reversements sont dans cet état** : ils sont `completed` alors que leur date de versement n'est pas arrivée.
- C'est un défaut du jeu de démo, pas du calcul : un reversement ne peut pas être versé demain. Il est hors de ce ticket, car les seeders n'y sont pas touchés.
- Conséquence visible sur la démo : le reste de novembre d'un bailleur peut être négatif alors que son solde est de plusieurs millions. Exemple : le bailleur 16 a un reste de novembre de −2 700 683 et un solde de 29 138 357.

Inventaire des dates (`DateInventoryByValueTest`) :

- Il parcourt la fiche avec `readsMoney` vrai (`ResourceSubjects`, `OwnerProfileDetailResource`). Son assertion de forme (`$violations` vide), jouée **avant** la ligne rouge, passe : `balance.as_of` est conforme à ADR-0018.
- Le rouge de la ligne 241 est `PropertyResource::sponsored_until`, de TCK-2638 (1f281281a). Les deux planchers qui suivent cette ligne n'ont pas tourné.

### Hors périmètre, signalé

`takussan-web/src/components/owners/fiche/FicheDuBailleur.tsx:405` lit encore `figures.remaining_to_pay`, désormais l'écart **du mois**, sous « Reste à verser ». Elle doit lire `balance.remaining_to_pay` (TCK-2641, ou un correctif d'une ligne). Le type `OwnerDetail` de `src/lib/queries/owners.ts` n'a pas encore `balance`.

Le ticket dit « le carnet du front : rien à faire ». C'est vrai pour les valeurs, mais **un libellé ne l'est plus** :

- `owners.carnet.resume.bureau` dit « {montant} à verser **en {mois}** », alors que la somme de tête est désormais un solde cumulé au jour ;
- `owners.carnet.resume.telephone`, `colonnes.reste`, `triReste` et `vues.reste` ne nomment pas de mois.

Non corrigé : c'est le texte du front, pas le contrat de ce ticket.

### Suivi (2026-11-13) — une passe par requête, la fiche, le libellé, le jeu de démo

- **Une seule passe des soldes par agence et par requête** : `OwnerDirectory::soldesDeLaRequete()` garde les soldes déjà calculés dans les attributs de la requête courante (`OwnerDirectory::SOLDES_DE_LA_REQUETE`) et ne calcule que les bailleurs absents. `OwnerProfileController::index()` calcule d'abord le périmètre du résumé, le plus large, que le filtre `has_remaining`, le tri, la ligne et la somme relisent ensuite. La mémoire est bornée à la requête : pas d'instance `scoped`, qui aurait vécu d'une requête à l'autre d'un même test, ni de la requête factice de la console.
- **Épinglé** par `OwnerProfileListFiguresTest::test_les_soldes_se_calculent_une_fois_par_requete`. Le test compte les requêtes liées à `BALANCE_ORIGIN` et les compare à une passe directe de `balances()`. Trois ablations, toutes rouges :
  - sans mémoire : 25 requêtes contre 5 (compte du mutant, qui garde le calcul préalable du périmètre ; avant le suivi : 3 passes, 4 avec le filtre) ;
  - mémoire qui survit à la requête : 0 contre 5 ;
  - sans le calcul préalable du périmètre du résumé : 10 contre 5 avec une recherche.
- **Mesure** sur la démo, agence 1 (12 bailleurs, 392 loyers et 89 acomptes liés), 8 cœurs, `GET /api/owners?sort=-remaining_to_pay`, quatre appels chacun :
  - avant : 946-1301 ms (2026-11-13 00:04, charge 1,89 2,73 3,22) ;
  - après : 379-457 ms (00:06, charge 2,48 2,70 3,15) ;
  - pour comparaison, le carnet faisait 572-738 ms avant TCK-2760.
- **Front**
  - La fiche du bailleur (`FicheDuBailleur.tsx`, une ligne) lit `balance.remaining_to_pay` sous « Reste à verser ».
  - `OwnerProfileDetail` gagne `balance: OwnerBalance | null`.
  - `owners.carnet.resume.bureau` dit « {montant} à verser à ce jour » (en : « to pay out to date »).
  - `FicheDuBailleur.tck-2641.test.tsx` donne un solde distinct de l'écart du mois. Ablation où la fiche relit `figures` : rouge.
- **Jeu de démo** : `PayoutSeeder` ne crée plus de reversement `completed` à `processed_at` futur. Le mois en cours n'est pas encore reversé ; ce sont les 119 reversements du 1er au 5 décembre relevés plus haut. Épinglé par `PayoutSeederSansReversementFuturTest` (ablation : rouge).
- **Hors front de l'agence** : aucun écran du bailleur n'affiche encore « Reste à vous verser » (`OwnerStatementPanel` ne lit aucun reste ; seules les maquettes le montrent).

### Suivi (2026-11-13) — r1 de la contre-revue : la fiche ne présente plus le solde comme le résultat du mois

- Constat (contre-revue de 5f26092e4, r1) : le bloc « Relevé du mois » alignait Encaissé, − Commission et − Déjà versé **du mois**, puis « Reste à verser » = solde cumulé au jour. La soustraction affichée ne tombait plus juste, et le chiffre ne bougeait pas avec le mois.
- `owners.fiche.releve.reste` dit « Reste à verser à ce jour » (en : « Left to pay out to date »), comme le carnet.
- Les trois chiffres du mois forment un groupe nommé par son mois, `owners.fiche.releve.duMois` (« En novembre », en : « In November »), au téléphone comme au bureau. Le reste se tient hors de ce groupe. Au bureau, le groupe prend deux tiers de la largeur et le reste un tiers séparé par un filet, soit les mêmes largeurs qu'avant (3 : 1,5), sans valeur arbitraire ajoutée.
- Épinglé par `FicheDuBailleur.tck-2641` « « Reste à verser à ce jour » se tient hors des trois chiffres du mois… ». Quatre ablations, toutes rouges : l'ancien libellé, le reste rangé dans le groupe du téléphone, puis dans celui du bureau, et le groupe sans son mois.

### Suivi (2026-11-13) — t1, t2 et r2 de la contre-revue de 5f26092e4 (back-4)

- **t1** : `OwnerProfileListFiguresTest::test_le_meme_bailleur_dans_deux_agences_garde_deux_soldes`. Un même bailleur est servi par deux agences, avec 100 000 encaissés dans A et 300 000 dans B. Un second bailleur n'a rien à verser dans B. Le super-admin lit le carnet sans filtre d'agence : la lecture rend 90 000 et 270 000, la ligne de B à zéro reste à zéro, et l'ordre du tri `-remaining_to_pay` comme le filtre `has_remaining` suivent ces soldes. Ablation `$memo[0]` au lieu de `$memo[(int) $agency->id]` dans `soldesDeLaRequete()` : rouge, et seul ce test rougit.
- **t2** : `OwnerStatementBalanceTest::test_le_solde_ignore_ce_qui_est_date_apres_aujourd_hui`. Lu le 20 novembre, le solde vaut 90 000. Un reversement versé daté du 27 (30 000) et un loyer encaissé daté du 25 (200 000) n'y entrent pas, ni au relevé ni à la ligne du carnet. Le 28, ils comptent : 240 000, ce qui prouve qu'ils entrent bien dans la fenêtre le jour venu. Ablation `->endOfMonth()` au lieu de `->endOfDay()` dans `balances()` : rouge, à 60 000 au lieu de 90 000 dès l'étape du reversement. L'étape du loyer n'a pas été ablatée seule.
- **r2** : le docblock de `soldesDeLaRequete()` a été corrigé. Hors HTTP, c'est l'inverse : la requête factice d'une commande ou d'un worker vit tout le processus, alors que le worker oublie les instances `scoped` entre deux jobs. Le docblock nomme les seuls appelants d'aujourd'hui. Aucun code n'a changé.
