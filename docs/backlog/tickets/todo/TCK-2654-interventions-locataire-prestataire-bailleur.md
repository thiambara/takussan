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
