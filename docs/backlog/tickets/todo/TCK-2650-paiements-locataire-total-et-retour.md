---
id: TCK-2650
title: "Paiements du locataire : un total, un geste, le prochain loyer — et un retour de paiement qui ne dit jamais « confirmé » sans le serveur"
status: todo
phase: P1
family: front
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2649, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
tags: [front, payments, mobile, bug, audit-ux, app]
---

## Objectif utilisateur

Le locataire ouvre « Paiements » et lit sans défiler :

- combien il doit, pénalités comprises ;
- où il le paie : en ligne, ou à l'agence ;
- quand tombe son prochain loyer.

Il ne lit jamais « à jour » au-dessus d'une dette, ni « Paiement confirmé » quand son paiement n'est pas confirmé.

## Contrat de données

- `GET /api/me/rent-summary` (TCK-2649) : `total_due`, `parts`, `items`, `next_rent`, `schedule_state`, `lease`, `offline_payment`.
- `GET /api/payments/history` : l'historique et la quittance par ligne, existants. `payment_type=deposit` nomme la caution, le champ existe.
- Paiement en ligne : les endpoints existants (choix parmi les seuls fournisseurs activés par l'agence, montant figé à l'ouverture).
- Retour de passerelle : l'endpoint de vérification existant, interrogé par `PaymentReturnClient`.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-paiements&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Locataire — quelque chose est dû », « Locataire — payer, choix du moyen », « Locataire — à jour », « Locataire — échéancier pas encore émis », et les cinq écrans « Retour — … ». Au téléphone et au bureau.
  - Les montants de la maquette ont été recalculés par son auteur (rapport maq-f4b) : ils ne font pas foi.
- **Carte de tête, selon `schedule_state`** :
  - **`due`** : « À régler » et le **total**, en grand, puis le détail (« 2 pénalités de retard (oct. et juil.) — à régler à l'agence Dakar Immo »). Un lien « Comment payer à l'agence › » montre les moyens hors ligne et le téléphone de l'agence ;
  - **`up_to_date`** : « Vous êtes à jour ✓ · Prochain loyer : … le … », avec « Payer d'avance » quand l'échéance suivante est payable ;
  - **`none`** : carte neutre, pas verte. « Votre premier loyer n'est pas encore programmé », le bail, « {agence} prépare votre échéancier », et « Contacter l'agence ».
- **Carte « Prochain loyer »** : montant et date, avec « Payer maintenant ». Le bouton est secondaire quand le dû se règle à l'agence.
- **« Payer »** : feuille (téléphone) ou panneau (bureau) pour choisir le moyen parmi les fournisseurs activés.
- **Historique en cartes** :
  - « Novembre · 1 355 000 F · Payé le 10 nov. · Quittance » ;
  - une sous-ligne « Pénalité 67 750 F due » quand c'est le cas ;
  - « Caution · … · versée le … ».
- **Retour de paiement** :
  - **en cours** : « Paiement en cours de confirmation », le fournisseur et le montant, « Vous recevrez un SMS. Vous pouvez fermer cette page. » ;
  - **confirmé** : seulement sur un statut serveur payé, avec « Quittance disponible » et « Télécharger » ;
  - **non abouti** : « Aucun montant n'a été débité », avec « Réessayer » et « Payer à l'agence » ;
  - **remboursement** : TCK-596, l'écran existe ;
  - **lien invalide** : « Ce lien de retour ne correspond à aucun paiement », avec « Voir mes paiements ».
- **Téléphone (360-390 px)** : le total et le geste tiennent dans le premier écran.
- **Bureau (≥ 1280 px)** : colonne centrale de 720 px, et à droite une carte « Mon bail » dès `lg` (bien, loyer, échéance, agence et contact). Le retour en carte centrée de 480 px.

## Contraintes strictes (métier)

- **Les charges** (décision du porteur du 2026-11-10, point 7 b ; TCK-2679) : une échéance de charges est une ligne nommée du détail (« Charges de novembre »), comptée dans le total servi par l'API ; la page ne l'additionne pas elle-même.
- **Décisions d'architecture à respecter** : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md).

**Rien ne se perd** (audit famille 4, § 5, *Fonctions existantes* 1-3 et 7, lues dans `CustomerPayments.tsx` et `PaymentReturnClient.tsx`) :

- **le montant dû est celui de l'API**, et la page n'additionne rien : le total vient lui aussi de l'API ;
- « Payer en ligne », avec le choix du fournisseur parmi ceux que l'agence a activés ;
- détail loyer + pénalité incluse, ou « à régler auprès de l'agence » ;
- historique en cartes, avec la **quittance PDF par ligne** et le rappel de pénalité ;
- horizon de 6 mois, retards compris (TCK-2169) ;
- retour :
  - « Vérification… » au moins 800 ms ;
  - interrogation toutes les 15 s pendant 2 min ;
  - quatre issues ;
  - « Retour aux paiements ».

Autres contraintes :

- **Le retour de paiement ne croit plus l'URL** (P1 de l'audit, `bucketFor`, `PaymentReturnClient.tsx:20-37`) :
  - **seul un statut serveur payé affiche « confirmé »** ;
  - un statut serveur `pending`, `partially_paid` ou absent affiche « en cours », et l'interrogation continue, quel que soit `status=` dans l'URL ;
  - un paiement introuvable affiche « lien invalide » ;
  - l'indice d'URL peut seulement choisir le texte d'attente (« en cours » plutôt qu'« échoué »), jamais une issue terminale positive.
- **« Vous êtes à jour » n'apparaît que pour `schedule_state=up_to_date`.**
- **Couleurs et icônes** : « Payé » en `--success`. L'icône de reçu ne porte aucun symbole monétaire (P3 de l'audit : « $ »).
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, montants et dates par `useFormatteurs()`.

## Delta à produire

- [x] Fonction de décision du retour, réécrite : statut serveur d'abord, l'URL jamais pour un succès. Écrans « en cours », « non abouti » et « lien invalide ». — `components/payments/retour/issue-du-retour.ts`, `CarteDuRetour.tsx`.
- [x] Carte de tête selon `schedule_state`, total et détail, « Comment payer à l'agence ». — `locataire/TeteDesPaiements.tsx`, `CommentPayerALAgence.tsx`.
- [x] Carte « Prochain loyer », choix du moyen, historique avec la caution nommée. — `TeteDesPaiements.tsx` (`CarteDuProchainLoyer`), `PayerUneEcheance.tsx`, `HistoriqueDuLocataire.tsx`.
- [x] Carte « Mon bail » au bureau. — `locataire/MonBail.tsx` (dès `lg`, à côté de la colonne dès `xl`).
- [x] Tests (`issue-du-retour.tck-2650.test.ts`, `CustomerPayments.tck-2650.test.tsx`, `PaymentReturnClient.serveur.tck-2650.test.tsx`) :
  - table de décision du retour (statut serveur × indice d'URL × paiement introuvable) ;
  - trois états de tête ;
  - total lu sur l'API ;
  - caution nommée ;
  - icône.

## Critères d'acceptation

- [x] AC1 — `/app/payments/return?payment_type=lease-payments&payment_id=999999&status=success` n'affiche jamais « Paiement confirmé ». Un paiement `pending` côté serveur, avec `status=success` dans l'URL, affiche « en cours de confirmation » et continue d'interroger. Test de la fonction de décision, chaque statut serveur croisé avec chaque indice.
  - *Preuve (r2, 2026-11-13)* : relevé en direct à 390 (locataire-f4, vraie API, aucune doublure) : « Ce lien de retour ne correspond à aucun paiement » et « Voir mes paiements », « Paiement confirmé » absent. Table : `issue-du-retour.tck-2650.test.ts` (7 indices × `paid`, `pending`, `partially_paid`, `late`, absent, vide, inconnu, `failed`, `cancelled`, 404, 403, 5xx, réseau) ; à l'écran : `PaymentReturnClient.serveur.tck-2650.test.tsx`. Ablations r1 A1 à A4, rouges (journaux relus en r2).
- [x] AC2 — `locataire-f4` : la carte de tête affiche « À régler », le total servi par l'API (135 500 F sur la démo) et « à régler à l'agence ». Le texte « Vous êtes à jour » n'est pas dans le DOM.
  - *Preuve (r2)* : relevé en direct à 390 et à 1280 (utilisateur 78, bail 22) : « À régler », « 135 500 F », « 2 pénalités de retard (octobre et juillet), à régler à l’agence Dakar Immo. » ; « à jour » absent des deux relevés. DOM : test `AC2 — due` (`queryByText` nul), ablations r1 B2 (total additionné) et B3 (lieu non nommé), rouges.
- [x] AC3 — `locataire-vrai` (bail actif, aucune échéance) : « Votre premier loyer n'est pas encore programmé », sans « à jour ».
  - *Preuve (r2)* : prouvé sur l'utilisateur 76 (décision de team-lead, cf. notes) : relevé en direct à 390, « Votre premier loyer n’est pas encore programmé », « Bail LS-FC-MT5YXV · 500 000 F / mois. Dakar Immo prépare votre échéancier… », « Contacter l’agence » ; « à jour » absent. Test `AC3 — none`, ablation r1 B1 (`none` rend « à jour »), rouge.
- [x] AC4 — À 390 px, le total et son geste sont visibles sans défilement.
  - *Preuve (r2)* : relevé à 390 × 844 de locataire-f4 : le total occupe y 127-167, « Comment payer à l’agence » y 360-404 ; la barre d'onglets commence à y 780.
- [x] AC5 — La caution de la démo s'affiche « Caution · … », et jamais « Loyer du 1 juil. 2026 au 1 juil. 2026 ».
  - *Preuve (r2)* : la démo sert à locataire-f4 une ligne `deposit` du 2026-07-01 au 2026-07-01. Le relevé à 1280 la rend « Caution · LPY-JMQLQ0 · Versée le 1 juil. · Reçu PDF », et « Loyer du » n'apparaît dans aucun relevé. Test `AC5`, ablation r1 B5.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [x] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2650.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
  - *Preuve (r2)* : la fiche liste les neuf écrans implémentés (a-0 à a-3, a-5 à a-9 ; a-4 est le bailleur, TCK-2651), leur référence gelée du 2026-11-11, la persona, la route et l'état reproduit, 28 écarts acceptés et 1 écart ouvert. Rôles et zones : ceux de la coque (`roles-coque.json`) ; aucun alias (la maquette vouvoie déjà, aucun renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
  - *État (r2)* : relevé final, 27 relevés (9 écrans × 3 appareils, `r2-2650/cmp4…cmp6`) : 1 194 conformes, 1 686 écarts et 608 absents (des deux côtés), contre 859, 2 025 et 635 en r1 ; les écrans du retour au téléphone passent de 5-10 % à 0,2-1,7 % de pixels (a-8 : 5,2 %). Les groupes d'écarts restants (coque, translation de +8 px de l'enveloppe, données de démo, primitives, trait, titres en bloc) ont été relus et rapprochés des entrées de la fiche, sans contrôle mécanique ligne à ligne ; un écart reste ouvert (« Appeler », « WhatsApp » : couleur de bordure lue absente, cause non établie), et « Payer maintenant » de la carte est un arbitrage téléphone contre bureau. Ouvert jusqu'à la lecture du porteur au rideau (AC-F5).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
  - *État (r2)* : non tenu. L'en-tête de la coque est à 0,94 % au téléphone sur a-0 à a-3 (les icônes de recherche et de cloche à `rgb(76,70,65)` contre `rgba(31,24,17,0,8)` : encre opaque de la coque, TCK-2617), et la barre d'onglets à 13,99 % sur a-1 (le voile de la feuille la couvre). Ni l'un ni l'autre n'est de ce ticket.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [x] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.
  - *Preuve (r2)* : `balayer` à 390, 768, 1024, 1280 et 1440 sur `/app/payments` (locataire-f4) et sur le retour (`payment_id=999999`) : débord 0, aucune coupe ; seules ellipses, les libellés du rail replié de la coque à 768. Sous `xl`, « Mon bail » passe sous la colonne (`flex-col`), aucun panneau ne reste à côté du contenu ; à 1280, la page suit la maquette « bureau 1280 » (colonne et « Mon bail » à leurs cotes).

## Hors périmètre

- La page « Loyers » du bailleur (TCK-2651).
- La page de paiement par lien `/pay/[token]` (famille 1, TCK-2505).
- La relance automatique graduée (ambition).

## Notes d'implémentation

_(terrain-8, 2026-11-13 — front ; le delta API `verify` → `payment` est de back-4.)_

**Personas des critères** (décision de team-lead, 2026-11-13). AC2 se prouve sur `locataire-f4`
(utilisateur 78, bail LS-0DPA75TK : `due`, 135 500 F = deux pénalités de 67 750 F, à l'agence).
**AC3 ne se prouve plus sur `locataire-vrai`** : son bail LS-EC-IEJWXT est désormais `expired`, son
résumé dit `up_to_date`. Il se prouve sur l'utilisateur 76 (bail LS-FC-MT5YXV, Dakar Immo, actif, sans
échéance : `none`), en lecture seule. Écart consigné dans la fiche de fidélité.

**Le retour de passerelle** (`components/payments/retour/issue-du-retour.ts`). L'issue se décide sur le
statut SERVEUR seul, selon cet ordre :

- `refund_pending` ou `refunded` → remboursement ;
- `paid` → confirmé ;
- `failed` ou `cancelled` → non abouti, définitif ;
- 404 ou 403 → lien invalide ;
- 5xx ou réseau → en cours.

L'indice d'URL `status=failed|cancelled` (l'adresse d'annulation, TCK-1291) affiche « non abouti » quand
le serveur dit encore `pending`, **mais l'interrogation continue** : un `paid` tardif l'emporte.
`status=success` ne change jamais l'issue. L'adresse n'entre dans un chemin d'API qu'une fois lue :
`lireLeLien` filtre les trois types connus et un identifiant `^\d{1,18}$`, entier sûr et positif.
`1e3`, `0x1F` et `%2012` sont refusés, alors que `Number()` les accepterait.

**La carte du retour** ne nomme que ce que `verify` sert dans `payment` : montant, période, fournisseur,
référence, `paid_at`, et pour les loyers seulement `lease_id`. Tant que le delta de back-4 n'est pas
fusionné, elle dit l'issue seule. Le disque du remboursement est `bg-muted text-accent`, pas
`bg-accent/15` : `check-valeurs-arbitraires-app` réserve l'aplat d'accent aux badges *featured*.

**La page du locataire**. La tête, le prochain loyer, l'historique, les échéances à venir et « Mon bail »
se lisent sur `GET /api/me/rent-summary` (TCK-2649). Aucun montant n'y est additionné :

- le total est `total_due` ;
- le lieu (« à l'agence Dakar Immo », « en ligne », « dont … en ligne et … à l'agence ») se déduit
  des deux `parts` ;
- la composition (« 2 pénalités de retard (octobre et juillet) ») compte les `items`, sans les
  sommer.

Un client sans bail (`schedule_state` nul) ou un résumé illisible garde la tête d'avant
(`ProchainPaiementHerite`) : rien ne se perd pour la réservation.

**« Payer »** (`locataire/PayerUneEcheance.tsx`). Le paiement s'ouvre dans une feuille au téléphone et un
panneau à droite dès `md` (`FeuilleDuBas`).

- Seuls les fournisseurs que le serveur ouvre à CE paiement sont proposés
  (`GET /api/lease-payments/{id}/providers`, TCK-602). L'ancienne vue passait `undefined` au
  sélecteur, c'est-à-dire toutes les passerelles de la devise.
- L'initiation et ses adresses de retour et d'annulation (TCK-1291) sont extraites dans
  `useLancerLePaiement`, lu aussi par `PaymentProviderPicker` : une seule écriture.
- `PayOnlineButton` est inchangé.

**Historique**. La caution se nomme « Caution · Versée le … » et son justificatif est un « Reçu », le
même PDF que la quittance (AC5). La caution rendue et la réservation n'ont pas de justificatif. La
pénalité née d'un loyer se rappelle sous lui, due ou réglée. L'icône est `ReceiptText`, sans symbole
monétaire.

**`?moyen=agence`** est le « Payer à l'agence » de la page de retour. Il ouvre « Comment payer à
l'agence » dès l'arrivée, avec les moyens que l'agence déclare (`offline_payment`) et rien d'autre.


### Delta API — le paiement lu en base au retour (2026-11-13, back-4)

`GET /api/{paymentType}/{paymentId}/verify` (`PaymentGatewayController::verify`) rend en plus `data.payment`, lu en
base APRÈS la vérification, à la forme que le front consomme (`PaiementVerifie`, `hooks/useInitiatePayment.ts`,
fixée avec terrain-8) : `amount` (nombre, montant de LA LIGNE en unités de la devise ; `total_amount` pour une
facture), `checkout_amount` (ci-dessous), `currency`, `payment_type` (`null` pour une facture), `reference_number`, `provider` (code du dernier
checkout, `metadata.gateway.provider`, rendu seulement s'il est un `PaymentProvider`), `paid_at` (ISO 8601) ; pour
`lease-payments` SEULEMENT, `lease_id`, `period_start`, `period_end` (`AAAA-MM-JJ`). Pas de statut dans le bloc :
le statut serveur reste `data.status`, que le front lit. Liste fermée : ni `metadata` (le fournisseur y laisse le
numéro du payeur), ni payeur, ni téléphone, ni e-mail. Les clés existantes (`status`, `provider_status`,
`transaction_id`, `refund_pending`) ne changent pas.

L'autorisation existait (`authorize('update', …)` des trois policies, `findOrFail`) : un autre locataire → 403 sans
`data`, un id inconnu → 404. Fixé par test, pas réécrit.

Tests : `tests/Feature/Payments/VerifyPaiementLuEnBaseTest.php` (8) — échéance en cours puis payée (`paid_at` rendu),
sans checkout le fournisseur est `null`, un code inconnu n'est pas rendu, ni téléphone ni e-mail dans le corps (clés
du bloc comparées à la liste exacte), autre locataire 403, id inconnu 404, acompte de réservation et facture sans
champ de bail. Ablations 9/9 rouges : bloc retiré, champs de bail pour tout type, fournisseur sans liste blanche
(deux formes), montant du checkout au lieu de la ligne, `metadata` ajouté, `authorize` retiré, `findOrFail`
contourné, `paid_at` nul. Voisins (8 classes qui appellent `verify`) : 79 verts.

**`checkout_amount`** (ajouté le même jour, demandé par terrain-8, recommandation de team-lead — le porteur n'a pas
encore tranché, point aa) : quand l'agence encaisse la pénalité en ligne, le checkout demande la ligne PLUS la
pénalité (157 500 pour 150 000) ; la carte « en cours » ne doit pas dire 150 000. Le bloc rend donc, à côté
d'`amount` (la ligne), `checkout_amount` : le montant FIGÉ du dernier checkout émis (`metadata.gateway_expected_amount`,
écrit par `recordInitiation()`), `null` sans checkout (paiement saisi par l'agence). Les trois types le portent (même
écriture pour tous). Tests : avec pénalité (157 500 contre 150 000), sans checkout (`null`) ; ablation : `checkout_amount`
lu sur la ligne → rouge.

**`checkout_late_fee_amount`** (décision 6a du porteur, 2026-11-13 ~18:50 : « montant payé + dont pénalité ») : la part
de pénalité du checkout courant, lue telle que `recordInitiation()` l'a figée (`late_fee_amount` de l'entrée de
`metadata.gateway.transactions` dont le `transaction_id` est celui de la ligne, la dernière émise à défaut ; `0` si
elle n'en porte pas) ; `null` sans checkout, comme `checkout_amount`. Le front peut donc dire « dont pénalité de
retard : 7 500 » sans la déduire d'une soustraction. Tests : avec pénalité (157 500 dont 7 500), checkout sans
pénalité (`0`), sans checkout (`null`). Ablation : la part forcée à `0` → rouge. Démo (lecture seule, échéance
payée la plus récente de l'agence 1) : saisie par l'agence, donc `checkout_amount` et `checkout_late_fee_amount`
à `null` — la démo ne porte aucun paiement en ligne.

**Côté front (terrain-8)** : sur la page de retour, le grand montant est `checkout_amount` quand il est présent,
`amount` sinon. Quand le premier dépasse le second, une ligne « dont pénalité de retard : <écart> » s'ajoute. Sans
`checkout_amount`, aucune pénalité n'est déduite et aucun texte n'est inventé (`CarteDuRetour.tsx`). Tests : deux
cas dans `PaymentReturnClient.serveur.tck-2650.test.tsx` (157 500 dont 7 500 ; `null` → 150 000 sans ligne).
Ablations 3/3 rouges : grand montant lu sur `amount`, ligne de pénalité tue, pénalité déduite sans `checkout_amount`.

**Pour TCK-2625** (demandé par team-lead le 2026-11-13) :
- `useDusDuLocataire()` (`src/lib/queries/dus-du-locataire.ts`) porte `STATUTS_DUS` et l'horizon de six mois, avec la même clé de cache et les mêmes paramètres qu'avant ; « Paiements » l'adopte.
  - Il vit dans un module à part : les tests de la page doublent `@/lib/queries/payments` en entier, et le hook passe par SON `usePaymentsHistory`. Ces tests restent donc inchangés et verts.
- `useInitiatePayment` relit `['me', 'rent-summary']` et `['payments', 'history']` sur erreur (`relireSurErreur`) : un 409 « déjà payée » recharge le résumé et l'historique.
  - Test : `useInitiatePayment.relire-409.tck-2650.test.tsx`.
  - Ablations, 3/3 rouges : sans `relireSurErreur`, sans l'historique, sans le résumé.

### r2 (2026-11-13, tck-2650-r2) — la pénalité figée, les cotes de la maquette, les preuves

**Décision 6a, côté front.** « dont pénalité de retard » se lit sur `checkout_late_fee_amount`, la part que
le serveur a figée pour CE checkout (`PaiementVerifie`, `CarteDuRetour.tsx`) — plus jamais sur l'écart
`checkout_amount − amount`. Une part à `0`, `null` ou absente (API d'avant) ne dit rien. Tests :
`PaymentReturnClient.serveur.tck-2650.test.tsx` (157 500 dont 7 500 ; checkout au-dessus de la ligne avec
une part à 0 : aucune ligne ; part absente : aucune ligne ; sans checkout : 150 000). Ablations 2/2 rouges :
la soustraction remise, la ligne tue.

**Fidélité (ADR-0106, ADR-0107 § 3-4).** r1 avait converti les largeurs fixes de la maquette en pas de
4 px (`max-w-180`, `w-85`, `w-68`, `w-60`, `max-w-120`), que la densité du bureau rend à 90 % : 648 px au
lieu de 720, 306 au lieu de 340, etc. Ce sont des gabarits en px, hors de l'échelle ×0,9 : ils passent en
`rem` calculés (`xl:max-w-[45rem]`, `xl:w-[21.25rem]`, `lg:w-[16.875rem]`, `lg:w-[15rem]`,
`max-w-[30rem]`), et abscisses et largeurs de la colonne, du tableau et de « Mon bail » deviennent
conformes. Les gestes pleine largeur que la maquette dessine en « Bouton taille grand » passent en
`size="xl"` (48 px, TCK-2686) : la carte du retour, « Payer d'avance », « Payer maintenant » de la carte,
« Contacter l'agence » ; « Télécharger la quittance » est primaire et pleine largeur. « Comment payer à
l'agence » occupe sa ligne ; les icônes de la note de pénalité du tableau passent à `size-3` ; la carte du
retour au téléphone prend la marge de la maquette (x 20, 40 px sous l'en-tête). Chaque écart restant est
consigné à la fiche, avec son exception.

**Personas.** Les jetons de `locataire_f4` et `locataire_76` (outil de terrain-8, fichier de jetons
privé) répondaient 200 au relevé : ils n'ont pas été renouvelés — `locataire_f4` est le compte de
`locataire2` (utilisateur 78), un renouvellement aurait révoqué le jeton des autres agents.
`locataire_76` n'existe pas dans `scripts/fidelite/personas.json`.
