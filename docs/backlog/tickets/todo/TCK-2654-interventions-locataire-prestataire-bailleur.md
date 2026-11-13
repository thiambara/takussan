---
id: TCK-2654
title: "Interventions côté locataire, prestataire et bailleur : signaler photo d'abord, « C'est réparé ? », « Ma semaine », devis à approuver"
status: todo
phase: P1
family: front
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2652, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#77-serviceproviderbill-"
tags: [front, maintenance, camera, mobile, audit-ux, app]
---

## Objectif utilisateur

- Le locataire qui voit une fuite la signale en vingt secondes, photo d'abord, puis sait quand c'est pris en charge. Il confirme la réparation d'un geste.
- Le prestataire voit sa semaine : ce qu'il doit accepter, où il va et à quelle heure, et ce qu'il a à facturer.
- Le bailleur approuve ou refuse un devis en connaissant le seuil qu'il a fixé.

## Contrat de données

- `POST /api/maintenance-requests`, puis `POST …/photos` : signalement. `description` devient facultative (TCK-2652).
- `GET /api/maintenance-requests` avec `filter[file]=a_accepter` et `filter[scheduled_from|to]` (TCK-2652).
- `POST …/accept` et `…/decline`, pour le prestataire : `can_accept` corrigé (TCK-2652).
- Rapport de fin, photos avant / après, kit d'accès : les endpoints existants.
- `GET /api/service-provider-bills` : les factures du prestataire (existant).
- `POST …/quote/approve` et `…/quote/reject` : bailleur au-dessus du seuil (existant, ADR-0037).
- Confirmation du locataire : « C'est réparé » / « Le problème persiste » (existant). Le coût n'est pas servi au locataire (TCK-2652).

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-interventions&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Locataire — signaler », « Locataire — demande envoyée », « Locataire — mes demandes, « C'est réparé ? » », « Bailleur — devis à approuver » et « Prestataire — Ma semaine ». Au téléphone et au bureau.
- **Locataire, signaler** :
  - le logement est rappelé en tête ;
  - **« Prendre une photo »** en premier, puis les vignettes ;
  - « C'est quoi ? » : tuiles à pictogramme Lucide et mot (Eau, Électricité, Porte / serrure, Nuisibles, Électroménager, Autre) ;
  - « C'est urgent ? » : deux grandes tuiles, « Oui, ça ne peut pas attendre » et « Ça peut attendre quelques jours » ;
  - « En deux mots (facultatif) » ;
  - bouton collé « Envoyer à l'agence ».
- **Locataire, demande envoyée** : « {agence} a reçu votre demande · Vous serez prévenu quand un artisan est choisi ».
- **Locataire, mes demandes** : la demande terminée en tête, avec « Le problème est-il réglé ? », « C'est réparé » / « Le problème persiste » et le délai de clôture. Ni coût, ni devis.
- **Bailleur** :
  - le devis détaillé ;
  - le rappel « au-delà de {seuil}, votre accord est demandé » ;
  - « Approuver » / « Refuser » (motif).
- **Prestataire, « Mes interventions »** :
  - « À accepter (n) », avec « J'accepte » / « Je refuse » ;
  - « Cette semaine », par jour, avec l'adresse visible après acceptation et « Itinéraire » ;
  - « À facturer (n) » ;
  - « Mes factures » **en cartes** au téléphone, avec le total « À percevoir ».
- **Téléphone (360-390 px)** : un formulaire de signalement qui tient sans champ natif non stylé. Le bouton d'envoi est collé.
- **Bureau (≥ 1280 px)** :
  - signalement en carte centrée de 640 px ;
  - prestataire avec la semaine à gauche, et « À accepter / À facturer » à droite, dès `lg`.

## Contraintes strictes (métier)

**Rien ne se perd** (audit famille 4, § 7, *Fonctions existantes* 3-4, 8-10, lues dans `MaintenanceForm.tsx`, `MaintenanceNewLauncher.tsx` et `MaintenanceDetail.tsx`) :

- **signalement** :
  - choix du bien, prérempli pour le locataire qui n'en a qu'un ;
  - titre et description ;
  - catégorie ;
  - **priorité** ;
  - **jusqu'à 20 photos** ;
- prestataire :
  - le bandeau d'acceptation (« acceptez-la pour voir l'adresse… ») ;
  - photos avant / après **à l'appareil** ;
  - kit d'accès ;
  - rapport de fin avec coût et photos ;
  - « Mes factures d'intervention » (référence, intervention, montant, statut) ;
- locataire : « C'est réparé » / « Le problème persiste » (avec photos), clôture à 7 jours ;
- devis : soumettre (prestataire, pièce jointe), approuver ou refuser par le bailleur au-dessus du seuil.

Autres contraintes :

- **Photo à l'appareil** : l'entrée du signalement porte `capture="environment"`, comme les trois autres entrées de la maintenance (P1 de l'audit, `MaintenanceForm.tsx:176`). Plus de champ natif « Choose Files ».
- **Catégories du locataire** : les 6 tuiles se projettent sur l'énumération existante :

  | Tuile | Catégorie |
  |---|---|
  | Eau | `plumbing` |
  | Électricité | `electrical` |
  | Porte / serrure | `locksmith` |
  | Nuisibles | `pest_control` |
  | Électroménager | `appliance` |
  | Autre | `other` |

  Le formulaire du personnel garde les 9 catégories.
- **Urgence du locataire** : « Oui, ça ne peut pas attendre » donne `urgent`, « quelques jours » donne `normal`. Les quatre priorités restent au personnel (« Changer la priorité »).
- **Titre** : sans saisie, il se déduit de la catégorie (« Problème d'eau ») et se lit dans la langue de l'écran.
- **Coût** : le locataire ne voit aucun montant ([décision famille 4 n° 6a](../../../qa/audit-ux-2026-11/04-patrimoine-et-location.md)). L'écran ne masque pas un champ servi : il n'est pas servi (TCK-2652).
- **« J'accepte »** n'est jamais rendu sur une demande terminée : `can_accept` vient de l'API.
- **États vides** :
  - le locataire sans demande lit un texte qui parle de **son logement** (« Un souci dans votre logement ? Signalez-le ici »), pas celui d'un filtre sans résultat (P3 de l'audit) ;
  - au téléphone, l'écran ne dit jamais « Cliquez ».
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Delta à produire

- [ ] Signalement du locataire, photo d'abord, avec l'écran « demande envoyée ».
- [ ] Liste « mes demandes » du locataire, avec la confirmation de résolution, et son état vide.
- [ ] Écran du bailleur : devis à approuver, seuil rappelé.
- [ ] « Mes interventions » du prestataire : à accepter, semaine, à facturer, factures en cartes et total.
- [ ] Tests :
  - `capture` présent ;
  - catégorie et priorité envoyées depuis les tuiles ;
  - envoi sans description ;
  - aucun coût rendu au locataire ;
  - pas de « J'accepte » sur une demande terminée ;
  - factures sans débordement à 390 px.

## Critères d'acceptation

- [ ] AC1 — Le signalement du locataire porte une entrée photo avec `capture="environment"`, placée **avant** tout autre champ dans le DOM.
- [ ] AC2 — Toucher « Eau », « Oui, ça ne peut pas attendre » puis « Envoyer » sans texte envoie `category=plumbing`, `priority=urgent`, un `title` non vide, et pas de `description`. Réponse 201.
- [ ] AC3 — Le locataire de la #44 ne voit aucun montant sur sa fiche (DOM sans « F CFA » dans le bloc de la demande).
- [ ] AC4 — Le prestataire de la #32 (terminée) ne voit pas « J'accepte ».
- [ ] AC5 — À 390 px, « Mes factures » ne déborde pas : statut et montant sont visibles sur chaque carte. Le total « À percevoir » égale la somme des factures non payées rendues par l'API.
- [ ] AC6 — Le bailleur d'un bien dont le plafond est de 150 000 F voit le rappel du seuil sur un devis de 485 000 F, et « Approuver » envoie `POST …/quote/approve`.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2654.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les files et la fiche de l'agence (TCK-2653).
- La note vocale (maquette : « Message vocal ») : elle demande le stockage d'un audio, et un ticket.
- La note du prestataire par le locataire au moment de « C'est réparé » (§1.8 la prévoit ; ambition de l'audit).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

### Prémisse re-mesurée (démo, lecture seule, 2026-11-13)

- AC3 : #44 est `completed`, demandée par l'utilisateur 78 (persona `locataire2` de l'outil de fidélité, ajoutée pour ce ticket). AC4 : #32 est `closed`, assignée à 18 (persona `prestataire`).
- AC6 : **aucune donnée de démo** — aucun `owner_profiles.works_approval_threshold` posé, aucune demande avec `quote_amount`. AC2 et AC6 écrivent : prouvés en vitest sur le corps envoyé, écart écrit ici (décision du 2026-11-13).

### Décisions (porteur de session, 2026-11-13)

1. **Seuil du bailleur** : servi par un delta API de ce ticket (`owner_approval_threshold` sur la demande), au bailleur du bien et au personnel de son agence seulement ; tests de fuite (locataire, prestataire, autre bailleur, autre agence) et ablation.
2. **Aucun texte inventé** : chaque phrase de la maquette sans source (« répond d'ordinaire dans l'heure », « a consulté deux autres artisans », la note ★ du prestataire, « Depuis janvier », « Changer le créneau », « Relevé de mes factures ») devient un écart « donnée » motivé de la fiche de fidélité.
3. **« En deux mots »** est la `description`, absente quand rien n'est écrit ; le titre se déduit de la catégorie, dans la langue de l'écran.
4. **Le formulaire se choisit par le PERSONA de la coque**, pas par bail (`formulaireDuSignalement`, `resoudrePersona` au serveur dans `new/page.tsx`) : le persona `locataire` n'a ni profil bailleur, ni agent, ni admin dans son espace, donc `MaintenanceRequestPolicy::isPrincipalFor` ne lui est jamais vrai et l'API ne lui exige pas de description. Tout autre persona garde le formulaire du personnel (titre, description, neuf catégories, quatre priorités) — un agent ou un bailleur qui loue aussi n'y reçoit jamais de 422.
5. **« Demande envoyée »** a son URL (`/app/maintenance/{id}/envoyee`), rendue au seul demandeur ; tout autre lecteur est renvoyé à la fiche par `router.replace` côté client, sur `requester_id` — un `redirect` serveur dans la page ou un layout sous `[id]/loading.tsx` casse la garde des états de route (le rendu en flux est déjà parti). Route à part plutôt que `?envoyee=1` sur `[id]/page.tsx`, que TCK-2653 tient.

### Lot 1 — signalement du locataire et « demande envoyée »

- `src/lib/maintenance/signalement.ts` (tuiles → énumération, urgence → priorité, corps sans description vide, photos AJOUTÉES sous la borne de 20, étapes du locataire), `src/lib/queries/maintenance-signalement.ts` (même POST, même idempotence que `useCreateMaintenanceRequest`, sans description exigée).
- `src/components/maintenance/acteurs/SignalementDuLocataire.tsx` : bannière du logement (« Quel logement ? » d'abord quand il y en a plusieurs, puis « Changer », un bouton) ; entrée `capture="environment"` premier champ du formulaire (AC1), tuile « + » pour la galerie ; six tuiles et deux tuiles d'urgence en radios natives `sr-only` ; barre collante au téléphone (`BarreDAction`, `form=`), pied « Annuler / Envoyer » de la carte de 640 px au bureau. `MaintenanceForm` et `MaintenanceNewLauncher` inchangés.
- `src/components/maintenance/acteurs/DemandeEnvoyee.tsx` : agence du bien, résumé, quatre étapes ; « Appeler l'agence » seulement si le résumé du loyer (`/api/me/rent-summary`) porte le MÊME bail et un numéro. Hors périmètre : note vocale (« Message vocal », « 1 message vocal »).

- Fidélité : au téléphone, les deux écrans adoptent la pleine largeur (`PagePleineLargeur`, TCK-2691) et portent la marge de la maquette (16 px pour le signalement, 20 / 40 px pour « demande envoyée ») ; l'en-tête de page n'y est pas rendu (la barre du haut de la coque porte le titre). Au bureau, les cartes ont les gabarits fixes de la maquette, hors de l'échelle ×0,9 (ADR-0107 § 3) : `w-[40rem]` (640 px) et `w-[30rem]` (480 px).

### Lot 2 — « mes demandes » du locataire

- `src/lib/maintenance/mes-demandes.ts` : les colonnes lues (`CHAMPS_DES_DEMANDES_DU_LOCATAIRE`, aucune de coût ni de devis), la répartition en « à confirmer » (la plus récente d'abord) / « en cours » / « closes », le jour relatif (aujourd'hui, hier, demain). `useDemandesDuLocataire()` dans `src/lib/queries/maintenance-signalement.ts` : `include=property,assignee`, 50 par page, `-created_at`.
- `src/components/maintenance/acteurs/MesDemandesDuLocataire.tsx` : la carte « L'intervention est terminée — {titre} : le problème est-il réglé ? » en tête, rendue seulement quand la fiche sert un geste (`abilities.can_confirm_resolution|can_contest_resolution`, lus sur `GET …/{id}`, la liste ne les sert pas) ; « C'est réparé » (`confirm-resolution`), « Le problème persiste » ouvre dans la carte le mot (≥ 3 caractères) et les photos à l'appareil (≤ 5, `capture="environment"`) ; le délai vient d'`auto_close_at` (TCK-2652). « En cours » : « Urgente », « Signalée … », l'artisan et son passage, les quatre étapes (`EtapesDeLaDemande`, partagé avec « demande envoyée ») ; la carte entière mène à la fiche. « Terminées » : trois, puis « Tout voir » → `/app/maintenance?status=closed,cancelled`, la liste complète (recherche et filtres conservés). État vide : « Un souci dans votre logement ? Signalez-le ici. »
- `(liste)/page.tsx` : le persona locataire de la coque ouvre « mes demandes », sauf `?status=` ; le bailleur et le prestataire gardent `MaintenanceList` (lots 3 et 4).
- Écarts de donnée, rien d'inventé (décision 2) : le métier de l'artisan (« plombière ») et la fenêtre du créneau (« entre 9 h et 11 h ») ne sont pas servis ; « Changer le créneau » n'a pas de route pour le locataire ; « Écrire à l'agence » est le fil de la fiche (`conversation_id`, servi au détail) ; la note « Les réparations de votre logement sont prises en charge selon votre bail » n'est pas sourcée (qui paie dépend du bail et du mandat) ; « close le » devient « terminée le » (`completed_at` : la date de clôture n'est pas servie).

### Lot 3 — l'API du plafond (décision 1a)

- `MaintenanceRequestResource` sert `owner_approval_threshold` (le plafond de travaux du bailleur, ADR-0037, `OwnerApprovalThreshold`) au DÉTAIL et au seul donneur d'ordre : le bailleur du bien et le personnel de son agence. La clé est ABSENTE pour le locataire, le prestataire, un autre bailleur de l'agence et une autre agence, et jamais présente sur une liste (`MaintenanceOwnerThresholdVisibilityTest`). Pour l'autre bailleur et l'autre agence, la policy refuse déjà la fiche (403/404) : le test accepte « refusé ou servi sans la clé ».
- L'écran du devis du bailleur : lot 3 ci-dessous ; « Mes interventions » du prestataire : lot 4 ci-dessous.

### Fidélité (lots 1 et 2)

- `docs/qa/audit-ux-2026-11/fidelite/TCK-2654.json` : écrans a-3, a-4 et a-5 d'`app-interventions`, relevé v6 du 2026-11-13, avec ses écarts acceptés.
- Balayage aux largeurs 390, 768, 1024, 1280 et 1440 sur les trois routes : aucun débord, aucune coupe. Seules ellipses : celles du rail replié de la coque, à 768.

### Lot 3 — l'écran du bailleur (AC6)

- `src/lib/maintenance/devis-du-bailleur.ts` : le statut à décider (`awaiting_owner`), les statuts « en cours » (ni terminé, ni clos, ni le devis qui attend), les colonnes d'une ligne (celles d'une carte de file, plus le coût et la décision du devis), le montant d'une ligne (coût réel, sinon devis, sinon estimation) et `plafondARappeler` (servi ET fixé, jamais recalculé : c'est l'API qui met le devis en `awaiting_owner`). `useDevisAttendantLeBailleur()` et `useEnCoursDuBailleur()` dans `src/lib/queries/maintenance-signalement.ts` : les deux listes FILTRÉES par l'API (`filter[status]`), `include=property,requester,assignee`.
- `src/components/maintenance/acteurs/InterventionsDuBailleur.tsx` : une carte par devis à décider — « Votre accord est attendu · depuis … », le bien et le demandeur, jusqu'à deux photos (à gauche des lignes dès `xl`), les lignes du devis et son total (`quote_amount`, pas la somme des lignes), le rappel « Au-dessus de {seuil}, votre mandat prévoit votre accord. » seulement quand la fiche sert un plafond, « Approuver {montant} » (`POST …/quote/approve`) et « Refuser » (`QuoteRejectionModal`, motif exigé) seulement quand la fiche sert `abilities.can_decide_quote`. À droite au bureau, « En cours sur vos biens » : le titre mène à la fiche, le bien et l'artisan, le passage, le montant et « Devis approuvé le … » ; « Tout voir » au-delà de cinq. État vide : « Aucune intervention sur vos biens ».
- `(liste)/page.tsx` : le persona bailleur de la coque ouvre cette vue, sauf `?status=` (« Tout voir ») qui garde la liste complète.
- AC6 est prouvé en vitest (`interventions-du-bailleur.tck-2654.test.tsx`) : plafond de 150 000, devis de 485 000, le rappel est rendu et « Approuver » envoie `POST /api/maintenance-requests/42/quote/approve` — la couche réseau est doublée, pas les hooks.
- Écarts de donnée, rien d'inventé (décision 2) : « a consulté deux autres artisans (…) et recommande ce devis », la note ★ et le métier de l'artisan, « l'agence vous proposera une autre solution », « Fin prévue … », « Sous le seuil : sans accord » (le plafond n'est servi qu'au détail), la carte « Depuis janvier ». Le lien « Devis … (PDF) » : l'export de `QuotePdfButton` (`QuoteActions.tsx`) est accepté, livré avec le hunk de `QuoteActions` après le commit de TCK-2653 lots 2 et 3.
- Fidélité : écran a-6, relevé v9 (refait en v12 après L3b, ci-dessous) (tailles de texte sur les jetons `text-corps` 15 et `text-ui` 13 de la maquette ; comparés texte à texte, les textes communs ont le x, l’y, la taille et la graisse de la maquette). La démo n'a ni devis en `awaiting_owner` ni plafond fixé, et un relevé n'écrit pas : les trois GET de la vue sont doublés dans la page par les exemples de la maquette (déclaré dans la fiche) ; le relevé mesure la mise en page, les tests mesurent les données. Balayage 390 à 1440 sans débord ni coupe.

### Lot 4 — « Mes interventions » du prestataire (AC4, AC5)

- API : `ServiceProviderBillResource` sert, sur demande (`include=maintenanceRequest,property`), le titre de l'intervention et celui du bien d'une facture (`ServiceProviderBillNamesItsWorkTest`) : la carte de facture nomme le travail, pas sa seule référence.
- `src/lib/maintenance/semaine-du-prestataire.ts` : la semaine (lundi → dimanche à Dakar, bornes de `filter[scheduled_from|to]`), le genre d'un créneau (à accepter tant qu'il n'est pas accepté, fait une fois rendu, prévu sinon), la grille (lundi → samedi, le dimanche s'il porte un créneau ; 8 h → 17 h élargie au besoin ; un créneau d'une heure, l'API ne servant que son début), la tournée (« Cette semaine » : les passages acceptés et non rendus d'aujourd'hui au samedi, puis « rien de prévu ») et « À percevoir ».
- `src/components/maintenance/acteurs/InterventionsDuPrestataire.tsx` : « À accepter » (la file `a_accepter`) — « J'accepte » et « Je refuse » (motif ≥ 3) ne naissent que des drapeaux de la FICHE (`abilities.can_accept|can_decline`) : AC4 est prouvé en vitest sur une fiche terminée qui ne sert pas ces drapeaux — ce que la #32 de la démo, close, sert au prestataire 18 (`can_accept` et `can_decline` faux, relevé en lecture le 2026-11-13) —, sans geste quoi que dise la liste ; « Cette semaine » — l'adresse, « Itinéraire » et « Kit d'accès » viennent du bloc `access` de la fiche, que l'API n'ouvre qu'après acceptation ; « Mes factures » en cartes (titre, montant, référence et bien, statut) et « Toutes » vers `/app/maintenance?factures=toutes`, le registre complet (`ServiceProviderBillsTable`).
- « À percevoir » (décision 2 a) : la somme des factures `pending_validation` et `validated`, FILTRÉES par l'API (`filter[status]`), sur au plus 100 lignes (`PER_PAGE_MAX`) ; quand `meta.total` dépasse ce qui a été lu, aucun montant (il serait faux), le compte reste (« 101 factures »).
- Mise en page (décision 3 a) : deux colonnes et la grille de la semaine dès `xl`, comme la maquette ; sous `xl`, la semaine en liste par jour, comme au téléphone. Le ticket disait `lg` : écart écrit dans la fiche.
- `(liste)/page.tsx` : le persona prestataire de la coque ouvre cette vue, sauf `?status=` (la liste complète et ses factures) ; `?factures=toutes` ouvre le registre de ses factures.
- Écarts de donnée, rien d'inventé (décision 1 a) : « À facturer » et « Facturer » (la facture naît seule à `completed`, `MaintenanceRequestObserver`, et le prestataire n'a aucun `POST` : choix produit renvoyé au porteur), la fenêtre du passage (« 9 h – 11 h », l'API ne sert que son début), « Relevé de mes factures », « Calendrier », le moyen et la date de paiement d'une facture.
- Fidélité : écran a-7, relevé v11 (17 h 42) — téléphone 25 conformes · 21 écarts · 11 absents (1,96 % de pixels) ; bureau 1440 56 · 92 · 34 (4,88 %) ; bureau 1280 56 · 92 · 34 (5,1 %). La démo n'a, pour le prestataire 18, rien à accepter ni rien de prévu cette semaine, et un relevé n'écrit pas : la file `a_accepter`, la semaine et les fiches sont doublées dans la page par les exemples de la maquette, l'horloge avancée au mardi 10 novembre (déclaré dans la fiche) ; les factures sont les vraies. Le relevé mesure la mise en page, les tests mesurent les données. Balayage 390 à 1440 sans débord ni coupe (à 390, statut et montant de chaque facture entiers : AC5).

### Lot 3b — une seule décision du devis, le seuil sourcé

- `src/components/maintenance/acteurs/DecisionDuDevis.tsx` : la décision d'un devis qui attend le bailleur (le prestataire, les lignes et le total `quote_amount`, le rappel du plafond, « Approuver {montant} » et « Refuser » sous `abilities.can_decide_quote`, l'erreur, le motif du refus chargé à l'ouverture par `next/dynamic`) vit en UN endroit : la carte de la liste du bailleur et la feuille de son accueil (`FeuilleDuDevis`, TCK-2624) la montent. Rappels `onApprouve`, `onRefuse` (403 au geste) et `onRejete` (motif envoyé : `QuoteRejectionModal` gagne `onRejected`). `RappelDuSeuil.tsx` porte le rappel du plafond, partagé avec la fiche (`QuoteActions`, livraison suivante).
- Relevé dans le code pour la réserve du porteur de session (2026-11-13) :
  - « Sous le seuil : sans accord » est SOURCÉ : `MaintenanceQuoteWorkflow::approveQuote` ne fait passer l'approbation de l'agence en `awaiting_owner` que si `OwnerApprovalThreshold::exceeds` (STRICTEMENT au-delà, `bccomp === 1` ; égal = dans l'accord, ADR-0037 § 2), sinon le devis est `approved` directement. La mention s'affiche donc quand `quote_amount ≤ plafond` (`sousLeSeuil`, test à l'égalité). Le plafond n'étant servi qu'au détail (décision 1a), chaque ligne « en cours » lit sa fiche (au plus cinq, en parallèle, aucune lecture quand la liste est vide) ; un échec de lecture ne masque que la mention.
  - « l'agence vous proposera une autre solution » n'est PAS sourcé : la machine d'état (`MaintenanceStateMachine`) mène `rejected → quote_submitted | cancelled`, sans rien qui engage l'agence. Le produit écrit ce que la transition garantit : « Un refus demande un motif ; un nouveau devis pourra vous être soumis. »
- Fidélité a-6 refaite après L3b, relevé v12 (17 h 49) — téléphone 20 · 11 · 7 (28,33 %) ; bureau 1440 44 · 82 · 31 (9,08 %) ; bureau 1280 45 · 81 · 31 (9,8 %) ; « Sous le seuil : sans accord » à la place de la maquette (x 1266, y 248). Balayage 390 à 1440 sans débord ni coupe.
