---
id: TCK-2653
title: "Interventions de l'agence : files par état d'attente avec ancienneté, une fiche à un geste principal, « Autre action », et un carnet de prestataires qu'on peut appeler"
status: todo
phase: P1
family: front
estimate: L
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
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [front, maintenance, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin ou l'agent ouvre « Interventions » et voit d'abord ce qui attend l'agence : à dispatcher, en retard, chez le bailleur, à confirmer, chaque carte disant depuis quand. Il dispatche en un geste (prestataire suggéré, créneau), relance ou réassigne, et appelle un prestataire depuis le carnet.

## Contrat de données

- `GET /api/maintenance-requests` avec `filter[file]`, et `file`, `waiting_on`, `waiting_since`, `slot_overdue_days` sur chaque demande (TCK-2652).
- `GET /api/maintenance-requests/summary` pour les compteurs, en un appel (TCK-2652).
- `GET /api/maintenance-requests/{id}/suggested-providers` (TCK-2652).
- Fiche :
  - `abilities` et `abilities.transitions`, servis par le serveur (TCK-592) ;
  - assignation et créneau, devis (demander, approuver, refuser), annulation avec motif, statut : les endpoints existants.
- Carnet : `GET /api/agencies/{agency}/service-providers`, qui rend `average_rating`, `reviews_count`, le téléphone et `completed_interventions_count` (TCK-2652). Invitation, renvoi et révocation existants.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-interventions&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Agence — files », « Fiche — à dispatcher », « Fiche — Autre action » et « Agence — carnet des prestataires », au téléphone et au bureau.
  - La barre latérale de la maquette (`CoqueGestion`, groupe « Gestion locative ») est une copie locale : elle relève de la coque (famille 3).
- **Titre « Interventions »** dans la page. La fiche s'intitule « Intervention — {titre} ».
- **Téléphone (360-390 px)** :
  - pastilles défilantes comptées : « À dispatcher », « En retard », « Chez le bailleur », « En cours », « À confirmer », « Terminées » ;
  - cartes : titre ; bien · quartier · demandeur ; priorité ; l'**attente** (« Ouverte depuis 57 j » en ambre, « Créneau du 27 sept. dépassé de 44 j » en rouge) ; **un** geste.
- **Bureau (≥ 1280 px)** : colonnes par file, dès `lg`. Un clic ouvre la fiche en panneau latéral.
- **Fiche, un geste principal selon la file** :

  | File | Geste principal |
  |---|---|
  | À dispatcher | « Choisir un prestataire » : suggestions (nom, métier, zone, ★ note, nombre d'interventions), « Voir tout le carnet », créneau, puis « Envoyer à {prestataire} » |
  | En retard | « Relancer » (WhatsApp au prestataire, message prérempli) et « Réassigner » |
  | Chez le bailleur | « Relancer le bailleur » |
  | Devis à décider | « Approuver » / « Refuser » |
  | À confirmer | information « clôture automatique dans N j » |

- **« Autre action »** (feuille au téléphone, menu au bureau) :
  - les transitions que le serveur permet, chacune avec une phrase d'effet ;
  - « Demander un devis », « Prendre en compte », « Changer la priorité » ;
  - « Annuler la demande » en dernier, séparé, avec motif.
- **Journal** de la demande dans la colonne droite au bureau (« 10:12 — Signalée par … »).
- **Carnet** :
  - cartes au téléphone : nom, métiers, zones, ★ note, nombre d'interventions, Appeler / WhatsApp ;
  - tableau au bureau ;
  - les invitations en cours sont marquées.

## Contraintes strictes (métier)

**Rien ne se perd** (audit famille 4, § 7, *Fonctions existantes* 1-2, 5-8, 11-12, lues dans `components/maintenance/*` et `components/service-providers/*`) :

- filtres statut et priorité, gardés à côté des files ;
- « Nouvelle demande » ;
- carte : titre, métier, date, « Prévu … », bien · quartier · agence, priorité, statut ;
- fiche : titre, métier, création, priorité, statut, description ; bien et adresse, demandeur, assigné à, prévu le, coût réel (personnel) ;
- **« Prestataire et créneau »** : choix dans le carnet, créneau, « Inviter un nouveau prestataire » ;
- frise des étapes ;
- **devis** : demander, approuver ou refuser avec motif, PDF ;
- « Changer le statut », limité aux transitions permises, notes de résolution ;
- historique par bien ;
- **carnet** : nom, téléphone, métiers, zones, statut, « Ajouter un prestataire » (invitation), renvoyer et révoquer une invitation.

Autres contraintes :

- **La section « Urgences prioritaires » disparaît.** La priorité se lit en pastille sur la carte. Aucune demande `completed`, `closed` ou `cancelled` ne paraît hors de « À confirmer » et de « Terminées » (P1 de l'audit).
- **Les transitions viennent de l'API**, et l'écran n'en invente aucune. « Assignée » sans prestataire et « Terminée » sans rapport ne sont jamais proposées en bouton de premier rang.
- **La frise** a une étape par file : « Chez le bailleur » a la sienne (P2 de l'audit, quatre étapes pour douze statuts).
- **Téléphone du prestataire** : celui du compte, sinon celui de l'invitation. Le lien WhatsApp se construit par l'aide partagée de TCK-2644.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, dates relatives par `useFormatteurs()`.

## Delta à produire

- [ ] Liste de l'agence en files (pastilles au téléphone, colonnes au bureau), avec les compteurs de `summary`.
- [ ] Fiche à un geste principal, suggestions, créneau, « Autre action », journal, et panneau latéral au bureau.
- [ ] Frise alignée sur les files. Carnet en cartes et en tableau, avec la note et le nombre d'interventions.
- [ ] Tests :
  - aucune demande terminée hors de ses files ;
  - un geste principal par file ;
  - les transitions lues sur l'API ;
  - les suggestions ;
  - téléphone et WhatsApp du carnet ;
  - colonnes à 1280 px.

## Critères d'acceptation

- [ ] AC1 — Sur la démo, la première file de l'admin est « À dispatcher ». Elle contient la demande #8 avec « Ouverte depuis … j ». Aucune carte « Terminée » n'apparaît avant l'onglet « Terminées ».
- [ ] AC2 — Les compteurs des pastilles égalent la réponse de `GET /api/maintenance-requests/summary` (un appel au réseau).
- [ ] AC3 — Sur une demande « Ouverte, non assignée » :
  - le geste principal est « Choisir un prestataire » ;
  - « Autre action » ne liste que `abilities.transitions` ;
  - « Terminée » n'y figure pas.
- [ ] AC4 — Choisir le premier prestataire suggéré et le créneau « demain 9 h » envoie l'assignation existante avec `assigned_to` et `scheduled_at`. La carte passe en « En cours ».
- [ ] AC5 — Dans le carnet, chaque prestataire de la démo a un numéro affiché (`tel:`) et un lien `wa.me`, et sa note quand il en a une. À 390 px, statut et actions restent dans le cadre.
- [ ] AC6 — À 1280 px, les colonnes « À dispatcher · En retard · Chez le bailleur · En cours · À confirmer » sont visibles sans défilement horizontal.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2653.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les vues du locataire, du prestataire et du bailleur (TCK-2654).
- Le glisser-déposer entre colonnes (maquette : « cartes déplaçables ») : le geste se fait par la fiche.
- Le groupe de menu « Gestion locative » et le nom du menu (famille 3).

## Notes d'implémentation

### Lot 1 — les files (2026-11-13)

- **Qui voit quoi.** `/app/maintenance` rend `InterventionsDeLAgence` à l'agent et à l'admin (même partage que « Baux », TCK-2644) ; le locataire, le bailleur et le prestataire gardent `MaintenanceList` (TCK-2654).
- **Lectures.** Comptes des pastilles, des colonnes et du sous-titre : `GET …/summary`, un appel (AC2). Cartes : un `GET …?filter[file]=<file>` par file, triée `-priority,created_at` (la plus pressante, puis la plus ancienne). **Le tri est explicite** : le tri par défaut de l'API (`defaultSorts('-priority', '-created_at')`) ne passe pas par `MaintenancePrioritySort` et range la priorité en texte (normal > low > high > urgent) — mesuré sur la démo le 2026-11-13 (`a_dispatcher` : 8 normal, 110 low, 22 high, 10 high). Signalé ; `MaintenanceList` des autres rôles en hérite. Les champs (`CHAMPS_D_UNE_CARTE`) portent `status`, `assigned_to` et `scheduled_at`, sans lesquels l'API rend `file` à `null` ; un test les épingle.
- **Vues** (`?vue=`) : Files (défaut), Liste (l'ancienne `MaintenanceList`, filtres statut et priorité, pagination ; `?status=` de TCK-1727 y ouvre directement), Terminées (la file `terminees`, vingt par page, avec le statut). « Urgences prioritaires » ne se rend plus pour l'agence (`urgencesAPart={false}`).
- **Attente** (`attenteDe`) : « Ouverte depuis … » (à dispatcher), « Créneau du … dépassé de … » en rouge, « Chez le bailleur depuis … », « Devis à décider / demandé depuis … », « Prévue le … à … », « Terminée le … · clôture dans … ». **Ambre au-delà de 3 jours** quand l'agence ou le bailleur doit agir — décision n° 1 proposée au porteur, retenue par défaut. Durées par `useFormatteurs().nombre(n, { style: 'unit' })` (« 57 j », « 2 h »).
- **Gestes de carte** : liens vers la fiche avec `?geste=choisir|relancer|reassigner|voirDevis` ; la fiche les exécute (lot 2). « Relancer le bailleur » est absent : l'API ne sert pas le contact du bailleur (décision n° 2).
- **Écarts à la maquette, motivés** : recherche « Titre ou description… » (l'API ne cherche que là, pas « Bien, locataire, prestataire… ») ; « Terminées 40 » sans « en 2026 » (aucun compte par année, décision n° 5) ; ni poignée de glisser ni « Déposez une carte ici » (glisser-déposer hors périmètre) ; « Aucune demande » dans une file vide ; le quartier se tait quand le titre du bien le nomme déjà.
- **Frontière i18n** : `console` déclaré sur `(dashboard)/app/maintenance` (recherche et pagination de la console).

_(Lots 2 — fiche — et 3 — frise et carnet — à suivre.)_
