---
id: TCK-2660
title: "Impayés : relancer sur WhatsApp avec le lien de paiement de l'échéance"
status: done
phase: P1
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-14
depends_on: [TCK-2657, TCK-2658, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2624, TCK-2682, TCK-2818, TCK-2822]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#84-leasepaymentlink-"
tags: [front, finances, relance, whatsapp, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin qui voit un loyer en retard relance le locataire en deux touches, sur WhatsApp, avec le montant et le lien pour payer, et sait qui a déjà relancé.

## Contrat de données

- Impayés par échéance : `GET /api/payments/history` avec `filter[status]=late,partially_paid`, `filter[days_late_min|max]`, tri `-days_late`, `include=payer,property,landlord,reminders` (TCK-2657, TCK-2658).
- Groupements existants : `GET /api/agencies/{agency}/finance/aging?group_by=tenant|landlord`.
- Lien de paiement : `POST /api/lease-payments/{payment}/payment-link` → `{url, expires_at}` (409 si l'échéance n'est plus payable).
- Relance : `POST /api/lease-payments/{payment}/reminders {channel: whatsapp|call}` et `GET …/reminders` (TCK-2658).
- Encaissement manuel existant : `POST /api/lease-payments/{payment}/mark-paid`.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-argent&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Impayés et relance » et « Relancer (feuille, panneau) », téléphone et bureau.
- **Téléphone** : total dû et cautions détenues, bascule « Par locataire / Par bailleur », pastilles de retard (Tous · Plus de 30 j · 8–30 j · Moins de 8 j) ; une carte par impayé (locataire, bien, montant, « en retard de 34 j », dernière relance) avec deux boutons pleine largeur : « Relancer sur WhatsApp » (primaire) et « Appeler ». « Relancer » ouvre une feuille : montant, période et retard ; le message prérempli, modifiable ; le lien de paiement de l'échéance, à copier ; la dernière relance ; « Ouvrir WhatsApp ».
- **Bureau** : tableau Locataire · Bien · Bailleur · Montant dû · Retard · Dernière relance · actions, trié par retard ; un clic sur une ligne ouvre un panneau latéral « dossier de l'impayé » : échéances dues, pénalité, caution détenue, lien de paiement, historique des relances (manuelles et automatiques), « Appeler », « Encaisser un paiement », « Relancer ».
- Le message est au vouvoiement : « Bonjour {prénom}, le loyer de {mois} ({montant}) du {bien} reste à régler depuis le {date}. Vous pouvez le payer en ligne ici : {lien} ». Il ne nomme un moyen de paiement que s'il est proposé sur le lien.
- `md` n'est pas le bureau : le panneau latéral et le tableau commencent à `lg`.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md).
- Décision 13 (a) : la relance part **du WhatsApp de l'admin** (`https://wa.me/<numéro E.164 sans « + »>?text=<message encodé>`), Takussan n'envoie rien. L'ouverture de WhatsApp enregistre la relance (`channel: whatsapp`) ; « Appeler » (`tel:`) enregistre `channel: call`.
- Sans numéro de téléphone du locataire, « Relancer sur WhatsApp » est désactivé **avec sa raison à côté** (« Aucun numéro pour ce locataire ») et un lien vers la fiche client.
- Le lien de paiement est celui de l'échéance (TCK-602) ; un 409 dit que l'échéance ne se paie plus en ligne, sans ouvrir WhatsApp.
- N'afficher aucun « Lu le … » : rien ne le mesure (la maquette l'imagine).
- **Un seul composant Impayés** (décision du porteur du 2026-11-10, point 14 a) : l'onglet Impayés de Rapports (TCK-2629) et l'écran Impayés d'« Argent » (TCK-2660) sont **le même composant**, mêmes données, mêmes filtres, même relance unitaire et en lot (TCK-2682) — pas deux écrans qui se ressemblent. Ce qui diffère (en-tête, place dans la page) passe par ses propriétés. Ce ticket l'écrit ; TCK-2629 le monte dans Rapports.
- Fonctions existantes à garder (`OverduePaymentsTable`) : regroupement par locataire et par bailleur, tranches de retard, total, cautions détenues, lien vers la fiche client.
- i18n `fr` / `en` / `wo` (`wo` = texte français) ; montants via `useFormatteurs()`.

## Delta à produire

- [x] Liste des impayés par échéance, mobile en cartes, bureau en tableau, pastilles de retard filtrées côté serveur.
  - Preuve (2026-11-13, HEAD 7641542ea) : cartes à 360 et 768 (16), tableau à 1024 et 1280 dans un conteneur `overflow-x: auto` (mesure navigateur, lecture seule) ; filtre de retard côté serveur prouvé par AC3 (test + ablation).
- [x] Feuille / panneau de relance : message prérempli et modifiable, lien de paiement, ouverture de WhatsApp, enregistrement de la relance.
  - Preuve (2026-11-13, HEAD 7641542ea) : `impayes.tck-2660`, `impayes.verif.tck-2660` et `actions/__tests__/relance.tck-2660` verts ; ablation `noterLaRelance('whatsapp')`→`'call'` : 2 rouges.
- [x] Panneau « dossier de l'impayé » au bureau, avec l'historique des relances.
  - Preuve (2026-11-13, HEAD 7641542ea) : `impayes.tck-2660` vert ; ablations du pied du dossier (AC2) et de « Lu le » injecté dans `DossierDImpaye` (AC5) : rouges ; panneau de 480 px relevé à 1280 dans la fiche de fidélité.
- [x] Tests : URL `wa.me` construite (numéro, texte encodé, lien de l'API) ; relance enregistrée ; bouton désactivé et sa raison sans numéro ; 409 du lien.
  - Preuve (2026-11-13, HEAD 7641542ea) : `impayes.tck-2660`, `impayes.verif.tck-2660`, `relance.tck-2660` verts (wa.me, note, bouton désactivé et sa raison, 409) ; API : `LeasePaymentReminderTest` et `LeasePaymentLinkTest` verts.

## Critères d'acceptation

- [x] AC1 — « Ouvrir WhatsApp » ouvre `https://wa.me/221771234567?text=…` dont le texte décodé contient l'URL rendue par `POST …/payment-link` (vue au réseau), et un `POST …/reminders` part avec `channel: whatsapp` ; la carte affiche « relancé aujourd'hui » sans rechargement.
  - Preuve (2026-11-13, HEAD 7641542ea) : URL `wa.me` avec le lien de l'API et `channel: whatsapp` prouvés par `impayes.tck-2660` + ablation `'whatsapp'`→`'call'` (2 rouges). **Réserve** : la requête n'a pas été vue au réseau — les POST `payment-link` et `reminders` étaient bloqués par la règle de lecture seule.
- [x] AC2 — Une échéance payée n'a pas de bouton « Relancer ».
  - Preuve (2026-11-13, HEAD 7641542ea) : `impayes.tck-2660` ; ablation `{payee ? null : etat.relancer ?…}`→`{false ?…}` dans `Impayes.tsx` : AC2 rouge.
- [x] AC3 — La pastille « Plus de 30 j » envoie `filter[days_late_min]=31` et le nombre de cartes égale `meta.total` de la réponse.
  - Preuve (2026-11-13, HEAD 7641542ea) : `impayes.tck-2660.test.tsx:225` (`filter[days_late_min]=31`, cartes = `meta.total`) ; ablation `plus30` `min: 31`→`30` : 2 rouges.
- [x] AC4 — À 360 px, les deux boutons d'une carte mesurent au moins 44 px de haut et la carte ne déborde pas.
  - Preuve (2026-11-13, HEAD 7641542ea) : mesure navigateur à 360 (fr, admin, lecture seule) : « Relancer sur WhatsApp » 44 × 175 et « Appeler » 44 × 111, aucune carte ne déborde, `scrollWidth = innerWidth`.
- [x] AC5 — La chaîne « Lu le » n'apparaît nulle part dans le DOM de la page.
  - Preuve (2026-11-13, HEAD 7641542ea) : `impayes.tck-2660` ; ablation « Lu le 12 » injecté dans `DossierDImpaye` : AC5 rouge ; absent du DOM à 360 et 768.
- [x] AC6 — Avec un locataire sans téléphone, le bouton WhatsApp est désactivé et `aria-describedby` pointe vers la phrase qui dit pourquoi.
  - Preuve (2026-11-13, HEAD 7641542ea) : `impayes.tck-2660` ; ablation `aria-describedby={undefined}` dans `CarteDImpaye` : AC6 rouge.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [x] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2660.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
  - Preuve (2026-11-13, HEAD 7641542ea) : `docs/qa/audit-ux-2026-11/fidelite/TCK-2660.json` présent (a1/a2, téléphone, bureau 1440 et 1280).
- [x] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [x] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
  - Preuve AC-F2/F3 (2026-11-14, après 38bac668d et 7ed7f3073) : écran a-2 re-relevé à 390 (feuille ouverte PAR L'ADRESSE,
    `?tab=impayes&relance=602`, telle qu'ouverte) et à 1280 (dossier tel qu'ouvert), comparé aux références gelées ; classes
    d'écarts diffées contre la passe du 2026-11-12, chaque classe nouvelle nommée dans la fiche. Le lien de l'aperçu (ou son
    repère) prend le dessin de la maquette (15 px, 500, vert, souligné, même y). Les écarts nés de décisions du porteur
    postérieures au gel (repère et « Créé à l'envoi », « De la part de {agence}. », carte par échéance, ni SMS ni e-mail,
    panneau sans voile, pages de 20, « Ancienneté du dû », « Interventions », « Sélectionner ») ne sont plus motivés « décision
    produit » : ils sont portés par TCK-2822 (maquette retouchée, références regelées, ADR-0106 § Conséquences).
    1440 non re-mesuré (2026-11-12).
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [x] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.
  - Preuve (2026-11-13, HEAD 7641542ea) : mesure navigateur : `scrollWidth − innerWidth = 0` à 768, 1024 et 1280 ; table de 898 px (1024) et 946 px (1280) dans un parent `overflow-x: auto` ; dossier ouvert à 1024 : surcouche modale pleine largeur (`fixed`, `aria-modal`), `main` inchangé à 752 px — aucun panneau de 480 px à côté du contenu sous 1280 ; 1280 comparé à la maquette « bureau 1280 » dans la fiche (a1/a2).

## Hors périmètre

- La relance en lot (« Relancer la sélection » de la maquette) : **dans le lot** (décision du porteur du 2026-11-10), portée par TCK-2682 comme une file guidée ([ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md), amendement du 2026-11-10).
- La relance par SMS ou e-mail envoyée par Takussan (options b et c de la décision 13).
- Les relances automatiques graduées réglées par l'agence (ambition de l'audit).

## Notes d'implémentation

Mesuré le 2026-11-12 (base de démo, agence 1, lecture seule) : 16 échéances échues sur 14 baux, 33 715 000 F
— l'âge des créances rend le même total ; 7 à plus de 30 j, 0 de 8 à 30 j, 9 à moins de 8 j ; toutes des
loyers, toutes payables ; chaque payeur a un téléphone et un prénom ; aucun n'a de langue ; aucune relance.

**La règle *Impayé* est celle de TCK-595, partagée** : la liste lit `GET /api/payments/history` avec
`filter[days_late_min]=1` (et `days_late_max` pour les pastilles), **jamais `filter[status]`** — le
§ Contrat de données citait `filter[status]=late,partially_paid`, qui laisse dehors une échéance `pending`
échue. Un test le garde (« lit la règle *Impayé* partagée… une échéance `pending` échue y est »).
Les pastilles : Plus de 30 j = `days_late_min=31` (AC3) ; 8–30 j = 8 à 30 ; Moins de 8 j = 1 à 7
(`impayes/tranches.ts`) ; leurs comptes sont trois requêtes `per_page=1` en parallèle (`meta.total`),
« Tous » leur somme ; une requête en échec laisse sa pastille sans chiffre, rien d'autre.

**Deux découpages des tranches coexistent sur l'écran, délibérément** (relevé à la vérification du
2026-11-12) : les pastilles de « Par locataire » coupent en **1–7 / 8–30 / 31+ jours** (la maquette,
`impayes/tranches.ts`, pour choisir qui relancer d'abord), alors que les tuiles de « Par bailleur » et
l'« Ancienneté du dû » du dossier gardent la balance âgée en **1–30 / 31–60 / 61–90 / 90+** (celle de
`OverduePaymentsTable`, `GET agencies/{id}/finance/aging`, la même que la comptabilité). Les deux ne
se recoupent pas : « 8–30 j » chevauche « 1–30 », « 31+ » couvre trois tuiles. Un total se compare
d'un écran à l'autre (les deux comptent les mêmes échéances), une tranche non.

**Une carte par échéance** (pas par locataire, décision 2) : compteur = `meta.total`, « Voir plus » par 20.
Les autres échéances dues du locataire sont dans son dossier (« Échéances dues », même règle, `payer_id`).

**Qui lit `/api/payments/history`** (relevé avant d'y ajouter `first_name` et `locale` au payeur) : le
personnel de l'agence, le bailleur du bail ou du bien (`BailleurDuBien`), le locataire lui-même
(`customer.user_id`) et le créateur de la réservation. Le bailleur et le locataire recevaient déjà le nom
et le téléphone du payeur ; ils reçoivent en plus sa langue — admise par la décision 4 — et son prénom — accepté par le chef d'équipe le 2026-11-12 : le prénom est une partie du nom (`name`) qu'ils lisaient déjà, rien de neuf n'est exposé.
`locale` = la langue du compte lié (`preferredLocale()`), sinon celle de la fiche client, sinon `null`
(la règle de `ContactSansCompte`, sans le repli `fr`) — `PaymentHistoryNamedRowsTest`.

**Le message** est composé côté serveur (`app/actions/relance.ts`) dans la langue du **locataire**
(ADR-0105 § 1), celle de l'écran en repli, `fr` sinon ; un locataire `wo` reçoit le français (wolof en
pause — test « wolof en pause »). Il ne nomme aucun moyen de paiement et n'est jamais stocké. Il reste
modifiable avant l'envoi.

**Ce que montrait l'ancien âge des créances par locataire (`OverduePaymentsTable`) et où chaque chose vit
désormais** — le composant est gardé, monté dans « Par bailleur » (`regroupement="landlord"`,
le bailleur cliquable → `filter[landlord_id]`, son résumé total + cautions gardé) ; aucun de ses six fichiers de tests n'est
supprimé (`AdminFinancesTabs.capacites` adapté par un double de `Impayes`) :

| Information | Où elle vit |
|---|---|
| Les 4 tuiles de tranches de l'agence (1–30, 31–60, 61–90, 90+ ; montant et compte) | « Par bailleur », inchangées |
| Les colonnes de tranches par bailleur, et le lien vers chaque bailleur | « Par bailleur » ; le nom filtre « Par locataire » sur ce bailleur |
| Total dû (montant et compte) | en-tête : « 33 715 000 F dus sur 16 échéances » (âge des créances) ; « Par bailleur », tuile « Total des impayés » |
| Cautions détenues (total) et leur nombre de bailleurs | en-tête : « cautions détenues : … » ; « Par bailleur », tuile « Cautions détenues · N bailleurs » ; par bail, dans le dossier (« Caution détenue ») |
| Une ligne par locataire avec son total | une carte (ou rangée) par échéance ; le dossier liste toutes ses échéances dues avec leur échéance |
| Lien vers la fiche client | nom de la carte ; « Fiche client » du dossier ; lien sous le bouton désactivé sans numéro |
| Le dû d'UN locataire par tranche (1–30, 31–60, 61–90, plus de 90 jours) | dossier, « Ancienneté du dû » (balance âgée par locataire, même cache que l'en-tête), au bas du dossier |

**La relance n'écrit que sa note** (ADR-0105 § 3) : `POST …/reminders {channel}` à l'ouverture de wa.me
(« Ouvrir WhatsApp ») ou de `tel:` (« Appeler »), par `impayes/useNoterLaRelance.ts`, qui DIT un échec par
un toast (P228.06) posé sur la mutation elle-même (`useNoterUneRelance({ onError })`), pas sur l'appel : il ne dépend pas du geste qui l'a lancée (le test « après Ouvrir WhatsApp » prouve le toast sur ce chemin ; il ne distingue pas les deux poses, le crochet qui porte la mutation restant monté) ; la ligne prend la relance de la réponse, sans relire la liste (AC1). Le lien de
paiement se demande à l'ouverture de la feuille ou du dossier ; un 409 le dit et « Ouvrir WhatsApp »
reste un bouton désactivé (`aria-describedby`), sans wa.me.

**Tests** : `impayes.tck-2660.test.tsx` (15 : règle partagée, AC1, AC2, AC3, AC5, AC6, 409, comptes des
pastilles et échec d'un compte, « Voir plus », dossier et son « Ancienneté du dû », lien non répété, « Par bailleur »
(tranches, cautions et leur nombre de bailleurs, filtre), note refusée depuis « Appeler » et depuis « Ouvrir WhatsApp »), `relance.tck-2660.test.ts`
(6 : langue du locataire, repli, `wo` → français, sans prénom ni bien, période nommée), et côté API
`PaymentHistoryNamedRowsTest` (9). **Ablations**, une à la fois, md5 vérifié avant restauration : 409 →
`echec` (rouge) ; langue du locataire ignorée (2 rouges) ; encaissement sans `status: paid` (AC2 rouge) ;
toast retiré de la note (rouge) ; « Ancienneté du dû » retirée du dossier (rouge) ; côté API, règle du compte lié retirée (rouge).

**Fidélité** : fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2660.json` (a-1 et a-2, trois appareils,
largeurs 360 · 768 · 1024 · 1280). Aucun relevé n'écrit : `POST …/payment-link` intercepté (URL fictive)
et `POST …/reminders` refusé dans la page, journal dans `perturbation.interceptions`, aucun POST dans
`meta.reseau` ; wa.me et `tel:` jamais suivis. AC1 est prouvé par les tests, pas par un relevé.

**Reprise après vérification (2026-11-12)** — `impayes/__tests__/impayes.verif.tck-2660.test.tsx` (5)
tient ce que la vérification avait trouvé vert sous mutation : les « Échéances dues » du dossier sont
celles du seul locataire (`filter[payer_id]`, F9) ; « Appeler » du dossier au bureau note la relance
(`call`), plus après encaissement (F10) ; le lien de paiement ne part qu'à l'ouverture, jamais au rendu de
la liste ni d'une relance montée fermée (F7, par le crochet `useRelanceDUnImpaye`) ; les trois comptes
des pastilles sont sans `include` (F11). Ablations : les cinq mutations rougissent.

Hors du ticket, laissés ouverts dans le produit : les coches et la barre de sélection (TCK-2682 — la
première colonne est celle du locataire, une coche s'ajoutera devant), la bascule SMS / E-mail, « Lu le ».

**2026-11-12, soir — décisions 1 et 3 du porteur.** Elles remplacent « le lien de paiement se demande à l'ouverture »
ci-dessus.

- **Décision 1 (a) : le lien n'est créé qu'à l'ENVOI**, jamais à l'ouverture de la feuille, du dossier ou d'une échéance
  de la file, parce qu'une lecture n'écrit pas. Mécanisme retenu (E, signalé à team-lead) :
  - le message est composé avec un **repère** à la place du lien, `admin.finances.impayes.message.repereDuLien`
    (« [lien de paiement ajouté à l'envoi] »), et le cadre du lien dit « Créé à l'envoi de la relance »
    (`relancer.lienACreer`) ;
  - « Ouvrir WhatsApp » devient un **bouton**. Ajustement de team-lead : au clic, il ouvre d'abord un onglet VIDE, de
    façon synchrone, dans le geste (`window.open('', '_blank')`, sans `noopener`, qui ferait rendre `null`). Il coupe
    ensuite l'`opener` à la main. Puis viennent `POST …/payment-link` et le remplacement du repère par l'URL : un
    repère effacé par l'agent laisse son texte tel quel. Enfin `onglet.location.href = wa.me…`, et la relance est
    notée ;
  - un 409 à l'envoi, ou un échec, **referme l'onglet** et ne note rien : le bouton se désactive, et la file saute
    l'échéance (« ne se paie plus en ligne ») ;
  - « Copier » du lien crée le lien. « Appeler » n'en crée jamais ;
  - si le navigateur bloque l'onglet malgré tout (`window.open` rend `null`), une ancre `wa.me` prête remplace le
    bouton, « Touchez encore pour ouvrir WhatsApp » (`gestes.retoucherWhatsApp`). C'est le second appui qui ouvre et
    qui note.
  - **Non mesuré au navigateur réel (Safari iOS)** : l'onglet vide ouvert dans le geste, puis redirigé, et le repli.
    Tout est éprouvé en test, avec de fausses fenêtres (`location`, `close`).
  - Garde contre le double-clic : un second clic pendant la création du lien, ou dans les 500 ms qui suivent
    l'ouverture (`DELAI_D_ARMEMENT`), ne crée, n'ouvre ni ne note rien.
  - Envoi abandonné : si l'agent quitte l'échéance pendant la création du lien (« Passer », « Arrêter », feuille
    refermée), le lien revenu n'ouvre rien et ne note rien, et l'onglet vide est refermé. Deux gardes : le bouton démonté, et la relance devenue
    inactive dans `useRelanceDUnImpaye`.
  - **ADR-0105, amendement du 2026-11-10, point 4** disait « le lien est demandé… au moment où elle s'affiche ». Il
    est remplacé par l'amendement du 2026-11-12 (« le lien de paiement n'est créé qu'à l'envoi, et le message nomme
    l'agence », 150e016e1).
- **Décision 3 (a) : le message nomme l'agence du profil actif** (`useMyProfiles`, déjà en cache dans le sélecteur
  d'espace). Les gabarits `message.loyer` et `message.autre` finissent par « De la part de {agence}. » (en : « On
  behalf of {agence}. »). Sans agence connue, ni ligne vide ni formule. L'aide est unique : 2660, la file de 2682 et
  la fiche du bien de 2639 (`FeuilleDeRelance`) la suivent. **TCK-2644 n'a pas encore de relance d'impayé** :
  `LeaseDetail` n'a que la relance de signature. Il la suivra en réutilisant `useRelanceDUnImpaye`.
- Tests :
  - `relance.tck-2660.test.ts` (9) : agence nommée dans la langue du locataire ; sans agence ; repère ;
  - `impayes.tck-2660.test.tsx` (19) : AC1 au clic (onglet vide dans le geste, `opener` coupé), texte modifié,
    onglet bloqué, 409 à l'envoi (onglet refermé), échec 500 (onglet refermé), feuille refermée pendant la création
    du lien ;
  - `impayes.verif.tck-2660.test.tsx` (5) : F7, aucun lien à l'ouverture, seul l'envoi le crée ;
  - `impayes-en-lot.tck-2682.test.tsx` (17).
- Ablations (une à la fois, md5 vérifié) :
  - **f1 — POST à l'ouverture** : 14 rouges sur les trois fichiers ;
  - **f2 — agence retirée** : 2 rouges ;
  - **f3 — repère jamais remplacé** : 4 rouges ;
  - **f4 — garde des 500 ms retirée** : 1 rouge (d1) ;
  - **f5 — repli de l'onglet bloqué retiré** : 2 rouges ;
  - **g1 — l'onglet ouvert après l'attente** (plus dans le geste) : 1 rouge (deux clics pendant la création) ;
  - **g2 — l'onglet jamais refermé sur un refus** : 6 rouges ;
  - **g3 — `opener` non coupé** : 1 rouge (AC1) ;
  - **f6 — verrou « en vol » retiré** : 1 rouge (deux clics pendant la création du lien) ;
  - **f7 — garde du bouton démonté retirée** : 1 rouge (« Passer » pendant le lien) ;
  - f5, f6 et f7 ont été rejouées sur le code de l'onglet synchrone, avec les mêmes rouges.
  - Fiche de fidélité `TCK-2660.json` : l'écart « repère au lieu de l'URL » est inscrit comme décision du porteur
    (décision 1).
  - **f8 — garde de la relance inactive retirée** : vert seule, car le démontage couvre ces cas dans jsdom. Elle
    existe pour la feuille encore montée pendant son animation de fermeture. **f7 + f8 ensemble** : 3 rouges (feuille
    refermée, « Passer », « Arrêter »).

**2026-11-13 — décision 7 (a) : le prénom du payeur est servi au bailleur et au locataire.** `include=payer` de
`GET /api/payments/history` garde son bloc de cinq clés (`id`, `name`, `phone`, `first_name`, `locale`) pour tout
lecteur du cercle : le personnel de l'agence, le bailleur du bail (ou du bien, pour une réservation), le locataire
lui-même, et l'auteur d'une réservation encore membre de l'agence. Le bailleur lisait déjà le nom et le téléphone du
locataire, par ce bloc (`AFaireBailleur`) comme par le bail (TCK-2637). Le prénom n'expose donc rien de neuf. Aucun
code ne change : le relevé n'a trouvé aucun lecteur hors du cercle qui reçoive le bloc.

`PaymentHistoryPrenomDuPayeurTest` (4 tests) garde le cercle :

- dans le cercle, le prénom est servi, le bloc a exactement ses cinq clés, et aucun e-mail n'y paraît ;
- hors du cercle, aucun prénom, nom de famille, téléphone ni e-mail du payeur ne paraît dans la réponse brute. Les
  lecteurs éprouvés sont l'autre bailleur et l'autre locataire de l'agence, un propriétaire de l'agence sans ce
  bail, le client d'une réservation, le personnel d'une autre agence, un inconnu, l'opérateur `viewer`, et l'auteur
  d'une réservation qui n'est plus membre. Pour ce dernier, un témoin le remet en activité, et il lit alors le
  prénom.

Six ablations de `PaymentHistory`, une à la fois, ont toutes rougi et ont été restaurées sur md5 :

| Ablation | Ce qu'elle retire |
|---|---|
| a1 | bailleur quelconque |
| a2 | tout locataire ayant un compte |
| a3 | membre de l'agence au lieu du personnel |
| a4 | e-mail ajouté au bloc |
| a5 | bailleur de tout bien |
| a6 | auteur de réservation sans condition de membre |

- 2026-11-14 : clôturé — jugé au HEAD 0053d0bbd, tous les AC tenus avec preuve (verdict de clôture 2026-11-14-b).
