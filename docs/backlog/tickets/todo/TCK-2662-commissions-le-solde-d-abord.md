---
id: TCK-2662
title: "Commissions : le solde d'abord — « On vous doit » pour l'agent, un solde par agent pour l'admin"
status: todo
phase: P1
family: front
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2661, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#85-commissionentry-"
tags: [front, commissions, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent voit au téléphone combien on lui doit et ce qu'on lui a payé, bien par bien ; l'admin voit ce qu'il doit à chaque agent et le solde en un geste, avec une preuve.

## Contrat de données

- Lignes : `GET /api/commissions` avec `include=beneficiary,lease.property`, filtres `status`, `beneficiary_id`, `earned_*` / `paid_*` (TCK-2661).
- Agrégats : `GET /api/commissions/summary?year=&month=` (TCK-2661).
- Gestes : `POST /api/commissions/{id}/mark-paid`, `POST /api/commissions/settle`, `POST /api/commissions/{id}/cancel` avec leurs champs (TCK-2661).
- Relevé : `GET /api/export/commissions?from=&to=` (ouvert au bénéficiaire par TCK-2661).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-commissions&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Vue agent », « Vue admin par agent », « Solder un agent », « Registre par ligne », « Annuler (motif) », téléphone et bureau.
- **Agent, téléphone** : titre « Mes commissions » ; carte « On vous doit » (montant, nombre de baux, plus ancienne) ; « Payé cette année » et « Relevé » ; pastilles Dues · Payées · Annulées · Toutes ; une carte par ligne : le bien (titre et quartier, jamais la référence du bail) en titre, le montant en premier, « 40 % de 725 000 F », le rôle, la date (« bail activé le 30 oct. », « payée le 5 sept. · Wave », « annulée · {motif} »).
- **Agent, bureau** : dès `lg`, deux colonnes — à gauche la carte et les derniers paiements reçus, à droite le tableau Bien · Rôle · Base · Taux · Montant · Statut · Date, filtres de statut et d'année.
- **Admin, téléphone** : « {total} dus à {n} agents · payé en {mois} » ; une carte par agent (montant dû, nombre de lignes, « Solder ») ; le toucher ouvre ses lignes.
- **Admin, bureau** : bascule « Par agent / Par ligne ». Par agent : Agent · Dû · Lignes · Payé ce mois · Payé dans l'année · Dernier paiement · « Solder », ligne de total. Par ligne : le registre, filtre par bénéficiaire, menu « … » par ligne : « Marquer payée » (date, moyen, référence), « Voir le bail », « Annuler la commission… ».
- **Solder** : plein écran au téléphone, dialogue large au bureau ; lignes dues cochées (on peut en décocher), total recalculé et collant en bas, moyen, date, référence ; bouton « Confirmer le paiement de {montant} ».
- **Annuler** : dialogue qui dit la conséquence (« ne pourra plus être payée, l'agent verra le motif »), motif obligatoire en liste, bouton destructif « Annuler {montant} », secondaire « Garder la commission ».

## Contraintes strictes (métier)

Fonctions existantes à garder (`commissions/page.tsx`, `CommissionsLedger.tsx`) :

- Accès de tout le personnel (`assertCanReachAgencyStaffArea`) ; l'agent voit ses lignes, l'admin toutes (l'API tranche) ; une même route, deux lectures selon ce que l'API rend.
- Filtre de statut dans l'URL ; totaux Reste dû, Payé, Annulé ; part en clair (« 40 % de 725 000 F CFA ») ; origine (négociateur / collaborateur) ; pagination ; état vide expliqué.
- « Marquer payée » et « Annuler » réservés à `payouts.approve` ; **plus jamais en un clic** : l'un demande date, moyen et référence, l'autre un motif et une confirmation.
- Le module reste masquable par l'agence (« Menu de l'équipe »).
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement ; montants via `useFormatteurs()`.

## Delta à produire

- [ ] Vue agent (téléphone et bureau).
- [ ] Vue admin par agent, bascule vers le registre par ligne, menu « … ».
- [ ] Parcours « Solder », dialogue « Marquer payée », dialogue « Annuler » avec motif.
- [ ] API — retirer la transition de TCK-2661 (« TCK-2661 — transition, retiré par TCK-2662 ») : le corps vide de `mark-paid` et `cancel` (trait `App\Http\Requests\Api\Commissions\TransitionalEmptyBody`, ses deux usages dans les `FormRequest`, la branche de `CommissionEntryController::markPaid`) et son test `CommissionTransitionalEmptyBodyTest` ; le front n'envoie plus de corps vide.
- [ ] Tests : vue choisie selon l'appelant ; solde envoyé avec les seules lignes cochées ; annulation impossible sans motif ; aucun geste visible sans `payouts.approve`.

## Critères d'acceptation

- [ ] AC1 — À 390 px, la carte « On vous doit » et la première ligne due sont visibles sans défiler, et le montant de chaque carte est à l'écran (aucun défilement horizontal).
- [ ] AC2 — Une ligne s'intitule par le bien (« Appartement 3 ch. · Mermoz ») ; la référence `LS-…` n'apparaît pas sur la carte.
- [ ] AC3 — Décocher une ligne sur trois dans « Solder » envoie `entry_ids` à deux éléments (vu au réseau) et le bouton annonce la somme des deux.
- [ ] AC4 — Le bouton « Annuler {montant} » reste inactif tant qu'aucun motif n'est choisi ; le motif « Autre » exige un texte.
- [ ] AC5 — Un admin sans `payouts.approve` ne voit ni « Solder », ni le menu « … ».
- [ ] AC6 — « Relevé » télécharge le fichier de l'agent connecté sans 403.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2662.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La mention du montant dû dans le menu de l'agent (« Mes commissions · 1 240 000 F à percevoir ») : coque, famille 3.
- Le relevé mensuel (approche B) et la prévision (approche C), non retenus.

## Notes d'implémentation

**Une route, deux lectures.** `Commissions.tsx` choisit la vue par les capacités de l'appelant : `reports.view_agency` ou `payouts.approve` → vue admin, sinon vue agent (l'API reste le juge : un agent ne reçoit que ses lignes). Les gestes (« Solder », menu « … ») exigent `payouts.approve` et ne s'affichent jamais sur une ligne dont l'admin est lui-même le bénéficiaire. L'état vit dans l'URL (`src/lib/commissions/vue.ts`, patron de TCK-1732) : `status` (`toutes` explicite), `page`, `annee`/`periode` (agent), `mois`/`vue`/`agent`/`solder` (admin).

**Décisions de la session (2026-11-12)** : 1 a, 2 a, 3 (conditionnelle : cas a), 4 b, 5 a, 6 a, 7 b.
1. L'icône « relevé » d'un agent ouvre « Par ligne » filtré sur lui (l'export n'a pas de filtre par bénéficiaire).
2. « Dernières payées » : les trois dernières.
3. **Cas « a » : quatre moyens** (Wave, Orange Money, Espèces, Virement), ceux de la maquette. L'écran d'avant
   (`CommissionsLedger.tsx` au commit de base) ne proposait **aucun** moyen : « Marquer payée » partait en un clic, corps
   vide (`markPaid.mutateAsync({ id })`). Il n'y a donc pas de Free Money à perdre, et pas de régression. L'API accepte
   toujours `free_money`, et une ligne payée ainsi l'affiche.
4. **« Dues » par défaut, à toute largeur** ; un `status` de l'URL l'emporte toujours, `toutes` compris. Le rendu
   serveur ne connaît pas la largeur : un défaut qui en dépendrait ferait sauter la liste après l'hydratation, ou
   donnerait deux résultats au même lien. Le « Toutes » de la maquette du bureau est un écart déclaré (fiche de
   fidélité).
5. Deux colonnes de la vue agent dès `xl` (la maquette), pas `lg`.
6. « Marquer payée » reprend la preuve du solde via `mark-paid`. Au téléphone, le registre de l'admin est en cartes avec
   menu, et la pagination reste.
7. **« Annulé : X F » à côté des puces, à toute largeur** : du texte secondaire (`text-ui`, encre muted), sans carte,
   absent tant que la sélection n'a aucune ligne annulée. Le montant est sommé sur les lignes annulées de la sélection,
   avec les filtres des puces (bénéficiaire, année) : `useAnnulees`, une lecture de 100 lignes sur deux colonnes, qui
   remplace le compte d'une ligne. `meta.totals` couvre toute la portée sans filtre et aurait contredit la puce « Annulées
   N » à côté. Au-delà de 100 lignes, le texte dit « au moins ».

**Contraintes gardées.**
- Accès du personnel (layout inchangé).
- Part en clair (« 40 % de 725 000 F »), origine négociateur / collaborateur, pagination (pied « 1 à 20 sur N » au bureau, `Pagination` au téléphone), état vide expliqué.
- « Marquer payée » demande date, moyen et référence ; la référence est facultative en espèces, comme à l'API.
- « Annuler » demande un motif et une confirmation ; « Autre » exige un texte.
- Montants par `useFormatteurs()`.
- Totaux : « On vous doit » / « Payé cette année » (agent), « dus · payé en {mois} » (admin), et « Annulé : X F » à côté
  des puces (décision 7 b).

**Les appelants de `mark-paid` et `cancel`** (relevé du 2026-11-12, avant le retrait du corps vide) :

| Appelant | Ce qu'il envoie |
|---|---|
| `takussan-web` `useMarkCommissionPaid` (`lib/queries/commissions.ts`), seul appelé par `MarquerPayee` (`Payer.tsx`) | `paid_at`, `payment_method`, `payment_reference` (`preuveAEnvoyer`) ; bouton inactif tant que la preuve est incomplète |
| `takussan-web` `useCancelCommission`, seul appelé par `AnnulerLaCommission` (`gestes.tsx`) | `reason_code`, et `reason` pour « Autre » ; bouton inactif sans motif complet |
| `takussan-web` `useSettleCommissions` (`Solder`) | route neuve `settle` : `beneficiary_id`, `entry_ids`, la preuve |
| `takussan-web` `CommissionsLedger.tsx` (corps vide, en un clic) | **supprimé** par ce ticket, avec ses deux tests |
| `takussan-web` route handlers BFF, server actions | aucun : seul `api/export/[entity]` relaie `commissions`, une lecture |
| `takussan-api` `CommissionSeeder` | le SERVICE (`markPaid($ligne, $admin)`, `cancel(...)`), sans HTTP ni `FormRequest` : le service garde son chemin sans détails, pour le seeder seul |
| `takussan-api` commandes, jobs, écouteurs | aucun |

Aucun corps vide ne part plus vers ces routes : le 422 ne peut atteindre personne. Le step-up 2FA de `mark-paid` reste
résolu sur place par `useApiMutation` (TCK-589).

**API.**
- Transition de TCK-2661 retirée : le trait `TransitionalEmptyBody` et son test sont supprimés, ainsi que les deux usages et la branche de `markPaid`.
- Un corps vide rend désormais 422 (`CommissionMarkPaidDetailsTest`, `CommissionCancelReasonTest`).

**Front.**
- `CommissionsLedger.tsx` et ses deux tests sont remplacés par `src/components/commissions/{Commissions,VueAgent,VueAdmin,Payer,gestes,listes,pieces}.tsx`.
- La sémantique d'URL de TCK-1732 a migré dans `vue.tck-2662.test.ts`.
- `scripts/check-status-labels.mjs` lit désormais l'union `CommissionEntryStatus` dans `components/commissions/pieces.tsx`.
- Clés : environ 120 neuves sous `commissions.*`, dont `annule` et `annulePlancher` (7 b) (wo = fr). Les huit clés mortes de l'ancien écran sont supprimées : `title`, `subtitle`, `filterAll`, `totals.*`, `leaseFallback`, `beneficiaryFallback`, `cancel`, `tableCaption`.
- Valeurs de la maquette par les jetons (`check-valeurs-arbitraires-app`) :
  - `text-affiche-22` ;
  - `text-3xl` / `text-4xl` (30 et 36 px exacts au téléphone) ;
  - `tracking-titre`, `tracking-surtitre`, `size-icone` ;
  - rangées de 56 / 60 px en `rem` (`min-h-[3.5rem]`, `min-h-[3.75rem]`), comme `PointDuMois`.
- Un titre de bien qui nomme déjà son quartier ne le répète pas (vu sur la démo : « … – Hann Maristes 1 · Hann Maristes 1 »).

**Tests.**
- `commissions.tck-2662.test.tsx` (21) couvre :
  - la vue selon l'appelant ;
  - AC5 ;
  - AC3 : corps `entry_ids` à deux éléments, bouton à la somme des deux ;
  - AC4 : « Annuler » inactif sans motif, « Autre » sans texte ;
  - « Dues » par défaut au bureau comme au téléphone, un `status` explicite qui l'emporte (4 b) ;
  - « Annulé : X F » aux deux largeurs, absent sans annulée (7 b) ;
  - « Marquer payée » en espèces ;
  - AC2 : le bien en titre, jamais `LS-…` ;
  - le quartier non répété ;
  - AC6 : le lien de relevé ;
  - l'URL.
- `vue.tck-2662.test.ts` (7).
- Ablations, chacune restaurée au md5 près :
  - le quartier non répété : le test rougit sans le correctif ;
  - `MontantAnnule` neutralisé : le test 7 b rougit ;
  - le défaut rendu à `null` au bureau : le test 4 b rougit.

**Preuves au navigateur (2026-11-12, base de démo, aucune écriture).**
- AC3 : `POST /api/commissions/settle` intercepté avant le réseau. Corps `entry_ids` [26, 63] après décoche de la 2e ligne sur 3. Bouton « Confirmer le paiement de 910 000 F ». Mesuré au bureau 1280 et au téléphone 390.
- AC6 : `GET /api/export/commissions?format=csv&from=…&to=…` rend 200, `text/csv`, en pièce jointe, pour l'agent.
- AC-F6 : débord 0 à 1280, 1024, 768 et 390 sur les cinq routes.
- Fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2662.json` (résultats, éléments ignorés, écarts acceptés).

**Reprise après vérification (2026-11-12, `$S/impl/verif/TCK-2662-verif.json`).**
- **Hydratation** : `Commissions.tsx` rend le squelette tant que l'arbre n'est pas hydraté (instantané serveur de
  `useSyncExternalStore`, patron de `messages/espaceActif.ts`), puis tant que les capacités se lisent. Le serveur et le
  premier rendu client rendent donc le même squelette, que la coque ait amorcé les capacités ou non (la vérification
  relevait 3 chargements sur 24 avec la vue de l'agent au client contre le squelette du serveur). Une navigation douce,
  qui n'hydrate rien, rend la vue dès le premier rendu. Test : rendu serveur (même avec un cache amorcé : squelette),
  puis `hydrateRoot` avec les capacités amorcées, sans erreur d'hydratation.
- **Une même URL, un même résultat à toute largeur** (décision du team-lead) : la vue agent borne ses lignes et ses
  puces à l'année de l'URL (`annee`, l'année en cours par défaut) au téléphone comme au bureau ; `periode=tout` la lève
  partout. Le téléphone affiche la période (« Depuis janvier » / « Toutes les dates ») sous les puces, avec son menu.
  « Dernières payées » (téléphone) suit la période de l'URL ; la carte « Payé cette année » (bureau) reste de l'année.
  Test : mêmes comptes à 390 et à 1440 sur la même URL, avec et sans `periode=tout`.
- **G6 et G7 gardés** : 150 annulées, 100 lues → « Annulées 150 » (`meta.total`) et « Annulé : au moins 1 000 000 F ».

