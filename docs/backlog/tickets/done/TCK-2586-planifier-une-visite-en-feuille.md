---
id: TCK-2586
title: "Planifier une visite : une feuille, le bien en une recherche, les créneaux libres en pastilles, préremplie d'où l'on vient"
status: done
phase: P1
family: front
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2582, TCK-2585, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2584, TCK-2587, TCK-2597]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [front, visits, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent planifie une visite en trois touches depuis la demande, la fiche du client, l'agenda ou une visite terminée : le bien et la personne sont déjà là, il ne choisit que le jour et une heure où il est libre.

## Contrat de données

- `GET /api/property-visits/slots?property_id=&date=&agent_id=` (TCK-2585) pour les pastilles d'heure.
- `POST /api/property-visits` (existant ; `contact_lead_id` et `create_customer` de TCK-2582) ; la réponse porte `sms_sent`.
- Recherche du bien et du client : endpoints existants de la planification actuelle (`PlanifierUneVisite.tsx`), une seule requête de recherche avec délai de frappe.

## Direction UX / Artistique

- Maquettes de référence : `/fr/playground/maquettes?p=app-visites&a=a` — écrans « Planifier » et « Planifier — confirmée » ; `?p=app-fil-commercial&a=a` — écrans « Proposer une visite » et « Visite confirmée » ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Bien : vignette non modifiable quand il est prérempli, lien « Changer » ; sinon **une** recherche avec vignettes (fin des deux contrôles recherche + liste).
- Client : prérempli, ou recherche, ou « Sans fiche » → nom + téléphone (+221 posé).
- « Quel jour ? » en pastilles (Aujourd'hui, Demain, trois jours suivants, Autre date) ; « Quelle heure ? » en pastilles des créneaux libres, les pris grisés ; « Autre heure… » ouvre la saisie libre (la console n'est pas bornée à la grille).
- Depuis une demande : case cochée « Créer la fiche client et y garder le message ».
- Bouton collant qui redit le choix : « Confirmer la visite · sam. 14 nov. 10:00 ».
- Succès : « Visite confirmée. <prénom> est prévenu par SMS. » (ou l'avertissement de SMS retenu), puis [Envoyer aussi sur WhatsApp] [Voir la visite] [Voir la fiche].
- **Téléphone (360-390 px)** : feuille plein écran, bouton collant. **Bureau (≥ 1280 px)** : panneau latéral droit de 480 px par-dessus la page.

## Contraintes strictes (métier)

- **Pas de régression** (`PlanifierUneVisite.tsx`, audit § 4) : bien fixé ou recherché, client fixé ou recherché ou « Pas de fiche » (nom + téléphone), date, heure de Dakar, type de visite, la visite naît **confirmée** et le client est prévenu ; les quatre points d'entrée actuels (fiche client, fiche d'un bien, agenda, en-tête des Visites) gardent l'action.
- Entrées préremplies : depuis une demande (bien + demandeur + `contact_lead_id`), depuis la fiche client (client), depuis la fiche d'un bien (bien), depuis l'agenda (jour et heure du créneau touché — l'audit relève qu'ils sont perdus aujourd'hui), depuis une visite terminée (« 2e visite » : bien + client).
- Les heures sont saisies et affichées en heure de Dakar ; une heure passée n'est pas proposée.
- Erreurs 422 sur leur champ ; i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Feuille / panneau de planification ; pastilles de jours et de créneaux ; recherche unique du bien.
- [ ] Les cinq préremplissages.
- [ ] Écran de succès avec WhatsApp et liens.
- [ ] Tests : créneau pris grisé (réponse de `slots`) ; corps envoyé depuis une demande (`contact_lead_id`, `create_customer`) ; préremplissage depuis l'agenda (jour et heure) ; avertissement de SMS retenu.

## Critères d'acceptation

- [ ] AC1 — Depuis l'agenda, toucher le créneau vide de 15:00 mercredi ouvre la feuille sur mercredi et 15:00 déjà choisis.
- [ ] AC2 — Avec une visite confirmée de l'agent à 10:00 ce jour-là, la pastille 10:00 est grisée et non sélectionnable ; « Autre heure… » permet 10:15.
- [ ] AC3 — À 360 px, depuis une fiche client, la planification se fait en trois touches (jour, heure, Confirmer) et le bouton reste visible.
- [ ] AC4 — Le succès propose « Voir la visite », qui ouvre la visite créée (l'audit relève qu'aucun lien n'y mène aujourd'hui).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2586.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les disponibilités déclarées de l'agent.
- La planification par le client (« Proposer un autre créneau », TCK-590) : inchangée.

## Notes d'implémentation

**Prémisse re-mesurée (2026-11-11)** : `PlanifierUneVisite.tsx` était un `Dialog` — recherche + `Select` pour le bien et le client, `input date`, `Select` de 20 heures (09:00 → 18:30), ni type de visite ni note ; aucun front n'envoyait `contact_lead_id` ; ni `WeekView` ni `DayView` n'ont de geste sur un créneau vide ; l'en-tête des Visites n'avait aucune action.

**Livré**
- `PlanifierDialog` sur `PanneauDroit` (nouveau mode `formulaire` : sous `xl`, plein écran, croix à gauche, ligne d'étape `sousTitre`, pied en barre collante ; dès `xl`, le panneau de 480 px inchangé).
- Pièces : `components/visits/planification/PiecesDeLaPlanification.tsx` (pastille de choix, bien en vignette ou recherche unique, client en carte / recherche / « Visiteur sans fiche », carte de la demande verrouillée, succès a-6 et a-2, gestes du succès). Règles pures : `lib/visites/planification.ts` (jours au jour de Dakar, un créneau dans le délai de prévenance de 30 min n'est pas proposé, un pris est barré et `aria-disabled`).
- `useCreneauxDeVisite` (`GET /property-visits/slots`) ; `PlanVisitPayload` porte `type`, `notes`, `contact_lead_id`, `create_customer`, `allow_duplicate`. Un 409 `customer.duplicate` propose « Utiliser cette fiche » ; un 422 `visit.slot_overlap` va sous « Quelle heure ? » et relit les créneaux ; les autres 422 sans champ vont au bas de la feuille.
- Préremplissages : fiche bien (bien + vignette), fiche client (client, téléphone, étape, et son **bien d'intérêt** — `fetchDashboardCustomer` demande désormais `include=interestedProperty`, AC3), visite terminée (bien + client + téléphone), agenda et demande par props (`jour`/`heure`, `demande`) ; l'en-tête des Visites porte l'action.
- Succès : « Voir la visite » (`/app/visits/<id>`), WhatsApp, « Planifier une autre visite » ; depuis une demande, la liste de ce qui a été fait et « Voir la fiche ».

**AC1 — prop testée, geste câblé par TCK-2597** (périmètre tranché par la session, 2026-11-11) : la feuille reçoit ses préremplissages en props, testées au composant ; le geste sur un créneau vide de l'agenda est porté par TCK-2597 (AC4), « Visite ▸ » de la boîte des demandes par TCK-2584 (AC3). Tous deux se branchent sur CETTE interface, sans en créer une seconde : `PlanifierDialog` / `PlanifierUneVisite` — `property` {id, libelle, photo?, detail?}, `customer` {id, libelle, telephone?, etape?}, `demande` {id, nom, prenom?, telephone?, ficheId?}, `jour` (`AAAA-MM-JJ`, Dakar), `heure` (`HH:MM`), `onClose`, `onPlanifiee`. Fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2586.json` (a-5/a-6 relevés ; a-1/a-2 avec TCK-2584).
- **Reprise contre-vérifiée (verif-patrimoine, 2026-11-11) : acceptée** — B1, m1 et m2 fermés (f39ae474d), AC1 à AC5
  tiennent ; ablations r1, r1b, r2, r2b et r3 rouges ; le focus de « Autre heure… » mesuré au navigateur 4 fois sur 4
  (390 toucher et souris, 1280 souris et clavier), sans écriture.
