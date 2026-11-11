---
id: TCK-2668
title: "Couvrir une absence en un geste, et des invitations rangées (les locataires sur leur fiche)"
status: todo
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2665, TCK-2666, TCK-2667, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#66-roledelegation-"
tags: [front, team, absences, invitations, audit-ux, app]
---

## Objectif utilisateur

L'admin déclare un congé en un écran — qui reprend les demandes, et qui peut agir — et voit ses invitations d'équipe en cours sans vingt-huit invitations de locataires expirées devant.

## Contrat de données

- Absences : `POST|PATCH|DELETE /api/agencies/{a}/absences` avec `substitute_can_act` (TCK-2666).
- Invitations : `GET /api/invitations?filter[role]=…&filter[status]=sent,expired` ; `POST …/resend|revoke` ; `DELETE /api/invitations/expired?filter[role]=…` (TCK-2665) ; `filter[customer_id]` pour la fiche client (TCK-2665) ; création existante.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-equipe&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Couvrir une absence » et « Inviter et invitations », téléphone et bureau.
- **Couvrir une absence** : feuille plein écran au téléphone, dialogue au bureau ; la personne en tête ; « Du » et « Au (inclus) » ; « Qui reprend ses nouvelles demandes ? » (« ce qui est en cours reste à elle ») ; case « {Prénom} peut agir à sa place pendant l'absence » avec ce que ça permet et « ce droit s'arrête seul le {date} au soir » ; motif facultatif, « visible des administrateurs seulement » ; « Enregistrer l'absence ». S'ouvre depuis la fiche (« Déclarer ») et depuis le bandeau (« Modifier l'absence », « Terminer l'absence »).
- **Invitations** : « En cours · N » (destinataire, rôle en clair, envoyée le, expire le, « Relancer », « Annuler ») ; « Expirées · N » repliées avec « Tout effacer » (confirmation qui dit le nombre) ; « Inviter un membre » (e-mail, rôle avec une phrase par rôle). Au bureau, les deux listes à gauche et le formulaire à droite dès `lg`.
- **Fiche client** (page de la famille 5) : l'état de l'invitation du client à créer son compte — envoyée le, expirée —, avec « Relancer » et « Annuler », à côté du bouton existant « Inviter à créer son compte ».

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0035](../../../adr/0035-l-absence-est-une-delegation-qui-n-accorde-rien.md).
- La case « peut agir à sa place » n'apparaît qu'à qui tient `team.delegate_role` (ou l'admin principal).
- Un agent qui déclare sa **propre** absence garde ce geste là où il l'a aujourd'hui (`AgentAbsencesSection`), sans la case de délégation.
- La lecture des absences en échec montre `ErrorState` avec « Réessayer » (aujourd'hui un `<p role="alert">` sans issue, `AgentAbsencesSection.tsx`).
- Page Rôles : les « Délégations temporaires » restent ; une délégation liée à une absence s'y lit comme telle (« couvre l'absence de … »), et la section renvoie à « Couvrir une absence » de l'Équipe.
- Invitations : la page Équipe ne liste plus les invitations de **locataires** — elles se suivent sur la fiche du client, livrée par ce même ticket, **jamais avant**. Les invitations des autres rôles restent listées (agents, administrateurs, bailleurs). Le rôle s'affiche en clair (plus de `tenant` brut).
- Gestes existants à garder : relancer, annuler, pagination, double authentification, erreurs de saisie rendues sur leur champ (cf. TCK-448).
- La phrase d'acceptation de l'invitation suit le parcours d'entrée retenu (famille 2, décision 3 : code SMS), pas « choisit son mot de passe ».
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement.

## Delta à produire

- [ ] « Couvrir une absence » : création, modification, fin ; bandeau et fiche reliés.
- [ ] Écran des invitations : en cours, expirées repliées, « Tout effacer », formulaire.
- [ ] Bloc d'état de l'invitation sur la fiche client.
- [ ] Section « Délégations temporaires » de la page Rôles : délégations liées nommées, renvoi.
- [ ] Tests : case de délégation absente sans capacité ; « Tout effacer » envoie la purge avec les rôles d'équipe ; invitation de locataire visible sur la fiche client et absente de l'Équipe ; erreur de lecture des absences avec « Réessayer ».

## Critères d'acceptation

- [ ] AC1 — Enregistrer une absence avec la case cochée envoie `substitute_can_act: true` (vu au réseau) ; la fiche montre « Absent du 10 au 14 nov. · Khady Diallo peut agir à sa place ».
- [ ] AC2 — Un admin sans `team.delegate_role` ne voit pas la case.
- [ ] AC3 — Avec 28 invitations expirées dont 27 de locataires, l'Équipe affiche « Expirées · 1 », et « Tout effacer » envoie `DELETE /api/invitations/expired` avec les rôles d'équipe seulement.
- [ ] AC4 — La fiche du client 42, invité il y a dix jours, montre « Invitation expirée » et « Relancer », qui appelle `POST /api/invitations/{id}/resend`.
- [ ] AC5 — À 360 px, la feuille d'absence tient avec son bouton « Enregistrer l'absence » visible sans défiler.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2668.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- L'invitation envoyée par lien WhatsApp (ambition de l'audit).
- La page « Mouvements » (approche C, non retenue).

## Notes d'implémentation

_(à remplir par implementing-specs)_
