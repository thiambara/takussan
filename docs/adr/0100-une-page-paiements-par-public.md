# ADR-0100 — L'argent a une page par public : « Paiements » pour le locataire, « Loyers » pour le bailleur, « Argent » pour l'agence

- **Statut** : Accepté le 2026-11-10 (décision 4 (a) de la famille 4, décision n° 12 (a) pour l'onglet « Argent », décision n° 8 (a) pour le total du locataire — recommandations validées par le porteur) — modalités : décisions de la session, à revoir ; § 3 et § 6 décidés par le porteur le 2026-11-10 (« Loyers » ; les charges du bail dans ce lot, TCK-2679) ; **§ 2 amendé le 2026-11-12** : le reste à verser est un solde cumulé, lu au jour (cf. § *Amendement du 2026-11-12 — le reste à verser est un solde cumulé*)
- **Date** : 2026-11-10
- **Tickets** : TCK-2649 (API : total dû, reste à verser), TCK-2650 (Paiements du locataire), TCK-2651 (page du bailleur), TCK-2657 et TCK-2659 (Argent de l'agence), TCK-2618 (onglets et entrées de menu), TCK-2677 (redirection du personnel), TCK-2679 (les charges, terme du bail), TCK-2760 (le reste à verser cumulé, amendement du 2026-11-12)
- **S'appuie sur** : [ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md) (persona du profil actif), [ADR-0064](0064-l-administration-d-agence-vit-dans-app.md) (l'administration d'agence vit sous `/app/agency/*`), [ADR-0039](0039-les-sorties-d-argent.md) (reversements, reprises)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `/app/payments` sert **trois publics sous une même adresse**. Le client seul (`isCustomerOnly`) reçoit `CustomerPayments` : ce qu'il doit, « Payer », son historique. Tous les autres, bailleur comme personnel, reçoivent `PaymentsTabs` : historique, factures, reversements. Le bailleur lit donc un écran d'encaissement d'agence, avec ses « ID entité » et ses « #8 ».
- L'agence a déjà sa page de finances, `/app/agency/finances` ([ADR-0064](0064-l-administration-d-agence-vit-dans-app.md)), avec ses onglets : encaissements, factures, reversements, à approuver, impayés.
- **Le total du locataire ment par omission.** Une pénalité restant due sur un loyer payé n'entre dans aucun dû (`CustomerPayments.tsx:31-33`). Rien ne distingue « aucune échéance émise » de « tout est payé ».
- **Le relevé du bailleur n'a pas de « reste à verser ».**
- **Le bail n'a aucune colonne de charges.** Le bien porte `monthly_charges` (§ 1.1), que la création du bail affiche sans l'écrire (TCK-2643).
- Deux familles nomment différemment la page du bailleur : « Loyers », en onglet et au menu (famille 3, TCK-2618, recommandation 2 c validée), et « Mes revenus », en titre de maquette (famille 4, TCK-2651).

## Décision

**Chaque public a sa page d'argent. L'adresse `/app/payments` reste, et rend la page de la persona du profil actif. Le personnel encaisse dans « Argent ».**

1. **Le locataire**, et le client qui paie : `/app/payments`, titre « Paiements ».
   - Un total, puis ce qui le compose.
   - **Les pénalités sont comptées dans le total à régler** (décision n° 8 (a)), y compris sur un loyer déjà payé. Ce qui ne se paie pas en ligne va dans la part « à régler à l'agence ».
   - Le montant encaissé en ligne ne change pas : il reste celui de `amountDue`, figé à l'ouverture (TCK-593).
   - C'est un amendement du § 1.4 de `docs/features.md` (« sinon la pénalité reste due et s'affiche à part »).
2. **Le bailleur** : `/app/payments`, page du bailleur.
   - Ce qui reste à lui verser d'abord, puis chaque bien, puis les opérations, sans identifiant technique.
   - Le reste à verser a **une seule source**, le calcul vivant d'`OwnerStatementService` (TCK-2649), lu tel quel par cette page, par la fiche bailleur et par « Argent ». Le front ne le calcule jamais par soustraction.
3. **Le mot du bailleur.** **Décidé par le porteur le 2026-11-10** : **« Loyers »** partout, pour l'onglet, l'entrée de menu et le titre de la page.
   - C'est le mot que la recommandation 2 c de la famille 3 a fait valider.
   - Il tient dans une case d'onglet à 360 px.
   - Le bailleur pense en loyers : il sait ce que son locataire paie, et apprend ici ce qu'il en reçoit.
   - « Mes revenus » reste le libellé de la carte de tête (« Ce qui vous revient en novembre »), pas celui de la page. **Un seul mot pour l'onglet et le titre** : « Loyers ».
4. **Le personnel de l'agence** (personas `agent` et `admin-agence`) : l'encaissement vit dans **« Argent »**, `/app/agency/finances` (TCK-2659), l'onglet de l'admin au téléphone (décision n° 12 (a)).
   - `/app/payments` **redirige** le personnel vers « Argent », en traduisant ses paramètres d'onglet et de filtre, **une fois qu'« Argent » sert tout ce que `PaymentsTabs` sert au personnel** : historique, factures, reversements, factures de prestataires.
   - D'ici là, le personnel garde l'écran d'aujourd'hui.
5. **L'hôte** (agence `individual`) garde l'écran d'aujourd'hui sous `/app/payments` jusqu'à une maquette qui le décrive. Ni le locataire, ni le bailleur, ni « Argent » ne le décrivent.
6. **Les charges du bail.** **Décidé par le porteur le 2026-11-10** (option b, *dans ce lot*) : les charges mensuelles deviennent un **terme du bail**, c'est-à-dire une colonne du bail, imprimée au contrat avec les termes de `Lease::CONTRACT_PRINTED_TERMS` ([ADR-0042](0042-preuve-de-consentement-a-la-signature-du-bail.md) § 1), et une ligne de l'échéance. Elles entrent alors dans le total du locataire.
   - **C'est dans ce lot** : [TCK-2679](../backlog/tickets/done/TCK-2679-charges-du-bail-terme-du-contrat.md) pose la colonne, l'impression et les échéances de charges ; l'[amendement du 2026-11-10 d'ADR-0042](0042-preuve-de-consentement-a-la-signature-du-bail.md#amendement-du-2026-11-10--les-charges-sont-un-terme-du-bail) en fixe les règles de contrat.
   - Les charges s'appellent par une échéance de type `charges` **à côté** de l'échéance de loyer, de même période et de même date. La pénalité de retard ne porte que sur le loyer, comme aujourd'hui.
   - Un bail sans charges (`monthly_charges` nul ou zéro) ne change pas. Les baux déjà signés ne changent pas : leur contrat n'imprimait aucune charge.
7. **Les liens profonds ne cassent pas.** Les cibles de notification et de courriel qui visent `/app/payments`, ou `/app/payments/return` pour le retour de paiement, restent valides. La page aiguille par persona.

## Conséquences

- **Une seule adresse pour trois pages.** L'aiguillage se fait côté serveur, sur la persona du profil actif ([ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md) § 2), et non plus sur `isCustomerOnly`, qui ignore le profil actif.
- **La redirection du personnel est portée par [TCK-2677](../backlog/tickets/done/TCK-2677-paiements-du-personnel-vers-argent.md).** Il fait l'inventaire de ce que `PaymentsTabs` sert au personnel et qu'« Argent » n'a pas, puis pose la redirection avec la traduction des paramètres. Relevé du 2026-11-10 : la section `/app/agency` est fermée à l'agent, qui garde donc `/app/payments` — décision du porteur du 2026-11-10 : « Argent » n'est pas ouvert à l'agent.
- **Le bailleur ne voit plus jamais l'écran d'encaissement d'agence.** Rien ne s'y perd pour lui : ses reversements, ses factures et ses relevés sont sur sa page.
- **Les relevés figés ne sont pas réécrits** (`OwnerStatementSnapshot`, TCK-2321). Le reste à verser s'ajoute au calcul vivant.
- `check-notification-target-paths` reste vert sans changement : le chemin existe toujours.

## Options écartées

- **(b) Une seule page à onglets par public** sous `/app/payments` : chaque public y verrait des onglets vides ou interdits, et l'agence aurait deux pages de finances.
- **Trois adresses neuves** (`/app/loyers`, …) : il faudrait réécrire chaque cible de notification et de courriel, et un lien ancien casserait.
- **Le reste à verser calculé à l'écran** (net moins versé) : trois écrans, trois soustractions, et une reprise ([ADR-0039](0039-les-sorties-d-argent.md)) qui ne serait comptée nulle part.

## Application

- Front : `app/(dashboard)/app/payments/page.tsx` aiguille par persona. Pages du locataire (TCK-2650) et du bailleur (TCK-2651). Redirection de l'admin d'agence (TCK-2677). Charges du bail (TCK-2679).
- API : `GET /api/me/rent-summary`, et `remaining_to_pay` dans le relevé (TCK-2649).
- Gardes :
  - un test d'aiguillage par persona sur `/app/payments` ;
  - le test « pénalité restant due sur un loyer payé comptée dans le total » ;
  - le test « `schedule_state=none` ≠ `up_to_date` » ;
  - le test de parité « reste à verser » entre le relevé et la fiche bailleur.

## Amendement du 2026-11-12 — le reste à verser est un solde cumulé (TCK-2760)

- **Décidé par le porteur le 2026-11-12** (décision 4 (a)) : « Reste à vous verser » est le solde **cumulé**, soit tout le net dû moins tout le versé. Les modalités ci-dessous (date d'arrêté, champ, lecteurs) sont des décisions de la session, à revoir.

### Contexte

Relevé sur `feat/audit-ux-app-lot-2` (0bec981e2) le 2026-11-12, en lecture seule :

- `totals.remaining_to_pay` (TCK-2649) vaut `net − paid_out` **de la période** (`OwnerStatementService::figures`, `remainingToPay`).
  - Le net suit les encaissements de la période (`paid_at`).
  - Le versé suit les reversements terminés dans la période (`processed_at`, P177.03).
- Une agence verse d'ordinaire le mois **suivant**. Mesuré sur la base de démo (lecture seule, 2026-11-12) : 1305 reversements au bailleur, tous terminés, et **1305 sur 1305** ont `processed_at` dans un mois postérieur à celui de leurs pièces, aucun dans le même mois. Le « déjà versé » de novembre est donc le versement des loyers d'octobre, et le reste de novembre ne dit pas ce que l'agence doit au bailleur.
- `features.md` § 1.5 écrivait « net moins déjà versé, **sur la période** » : la règle était dite, et c'est elle qui trompe.
- Le reste de période a **quatre lecteurs** :
  - la page « Loyers » (TCK-2651) ;
  - la fiche bailleur (`OwnerDirectory`, bloc `figures`) ;
  - le carnet des bailleurs : la ligne, le tri `-remaining_to_pay` (`OwnerRemainingToPaySort`) et la somme de tête (`OwnerDirectory::summary`) ;
  - l'instantané d'un relevé envoyé, qui le fige avec ses totaux (`OwnerStatementSnapshots`).

### Décision

**« Reste à verser » est le solde cumulé du bailleur dans l'agence, arrêté au jour : tout le net qui lui est dû depuis l'origine, moins tout ce qui lui a été versé. Il se calcule par le chemin du relevé, une fois, et se lit au même nom partout.**

1. **La formule est celle du relevé, sur une autre fenêtre.** Le solde vaut `OwnerStatementService::remainingToPay` appliqué aux totaux de `figures()` sur la fenêtre `[origine, aujourd'hui]`. L'origine est une borne basse fixe, antérieure à toute donnée.
   - Aucune seconde formule, aucune somme SQL à part.
   - Les frais imputés, les copies figées des pièces versées (TCK-2151) et les reprises ([ADR-0039](0039-les-sorties-d-argent.md)) y entrent comme dans le relevé.
   - **Une reprise ne change pas le solde.** Datée, elle diminue le net et le versé du même montant. Imputée, le versé compte le reversement avant reprise (`net_amount + clawback_amount`). Ce qui reste à reprendre au bailleur ne se lit pas dans le solde : on le lit par `PayoutClawbacks::outstanding`.
   - **Invariant** : sur une fenêtre fermée, la somme des restes de période des mois qui la composent est égale au solde de cette fenêtre, à l'arrondi au centime de chaque mois près. Le net et le versé s'additionnent mois par mois. C'est ce qui prouve que le solde n'est pas une seconde règle.
2. **Arrêté au jour, quelle que soit la période demandée.** Le solde est un **état**, comme `next_payout`, et non un fait du mois.
   - Le bailleur qui ouvre septembre lit le relevé de septembre, et en tête ce que l'agence lui doit **aujourd'hui**.
   - Un solde « à la fin de septembre » serait un chiffre d'histoire que personne ne demande, et qu'un instantané ne saurait pas figer honnêtement.
3. **Le champ.** Le relevé (`GET /api/owner-statements`) gagne `balance: { remaining_to_pay, as_of }`. `as_of` est la date de Dakar du calcul.
   - `balance` **n'entre pas dans l'instantané** (`OwnerStatementSnapshots::record` le retire, comme `next_payout`), et `served()` le sert au jour.
   - Un relevé envoyé garde donc ses totaux. Seul le solde est vivant.
4. **`totals.remaining_to_pay` reste**, inchangé, mais il ne s'appelle plus « reste à verser » à l'écran.
   - C'est l'écart **de la période** (net de la période moins versé de la période). Les instantanés envoyés le portent, figé : le retirer réécrirait des relevés envoyés, ce que TCK-2321 interdit.
   - Aucun écran ne l'affiche sous le libellé « Reste à vous verser » ou « Reste à verser ».
5. **Une seule source, quatre lecteurs** (le § 2 le voulait déjà) :
   - la page « Loyers » lit `balance.remaining_to_pay` ;
   - la fiche bailleur reçoit le même `balance` à côté de `figures` ;
   - le carnet : `remaining_to_pay` de la ligne, le tri `-remaining_to_pay` et la somme de tête deviennent le solde cumulé au jour.
   - **Un même libellé ne dit jamais deux nombres.**
6. **Le signe.** Le solde est rendu tel quel, négatif si le bailleur a reçu plus que le net de ses pièces (trop-versé). Une reprise en attente ne le rend pas négatif (§ 1). La somme de tête du carnet ne compte que les soldes positifs, comme aujourd'hui.
7. **La ventilation de la page ne s'additionne plus en tête.** « Encaissé · Commission · Interventions · Déjà versé » reste celle **de la période**. La carte « Reste à vous verser » n'est plus « Net − Déjà versé » du mois affiché, et le front ne la recompose jamais.

### Conséquences

- **Le bailleur lit ce qu'on lui doit**, quel que soit le rythme de versement de l'agence. Le cas mesuré (versement le mois suivant) ne fausse plus le chiffre de tête.
- **Le coût du calcul croît avec l'histoire.**
  - Le solde relit toutes les pièces du bailleur depuis l'origine.
  - Le carnet le calcule pour tous les bailleurs du périmètre. Le nombre de requêtes reste indépendant du nombre de bailleurs (TCK-2640), mais le volume lu croît avec les années.
  - Le ticket mesure ce temps sur la base de démo. S'il devient trop lourd, un solde **reporté** (le solde arrêté à la fin du dernier mois envoyé, plus le mois courant) est la suite naturelle : il demandera un amendement, puisqu'il ferait de l'instantané une source.
- **Le départ d'un bailleur** ([ADR-0108](0108-le-depart-d-un-bailleur.md)) se juge sur ce solde, et non sur un reste de période. Un reste de période nul ne prouve rien.
- `features.md` § 1.5 et l'AC1 de TCK-2651 sont réécrits en conséquence.

### Options écartées

- **Changer la valeur de `totals.remaining_to_pay`** : les instantanés envoyés le portent figé avec la valeur de période. Un même champ aurait deux sens selon l'âge du relevé.
- **Solde arrêté à la fin de la période demandée** : un chiffre d'histoire, que l'instantané figerait faux dès le premier reversement suivant (§ 2).
- **Une somme SQL de net et de versé** : une seconde règle, qui ignorerait les reprises, les copies figées et les taux retenus. C'est ce que le § 2 interdisait déjà au front.
- **Garder le reste de période et l'expliquer à l'écran** : le chiffre de tête resterait faux dans le cas courant mesuré.

### Application

- `OwnerStatementService` : la méthode du solde, sur `figures()`, pour un bailleur et pour plusieurs. `OwnerStatementSnapshots::record` retire `balance`, et `served()` le sert au jour.
- `OwnerDirectory` (fiche, ligne, somme), `OwnerRemainingToPaySort`.
- Gardes (TCK-2760) :
  - le cas discriminant : octobre reversé le 3 novembre, où le reste de novembre diffère du solde ;
  - l'invariant de la somme des mois ;
  - le relevé envoyé, dont les totaux restent figés et le solde vivant ;
  - la parité entre le relevé, la fiche et le carnet ;
  - chacun vérifié par ablation.
