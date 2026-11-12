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

**2026-11-12 — implémenté (terrain-5), branche `feat/audit-ux-app-lot-2`.** Front seul : le contrat de TCK-2665 et TCK-2666 suffisait.

**Couvrir une absence** — `src/components/admin/equipe/CouvrirUneAbsence.tsx` (feuille du bas au téléphone, dialogue au bureau) :
- La personne en tête ; « Du » et « Au (inclus) » en jours de l'API (une date seule de fin vaut la journée entière à Dakar, `FinInclusive`) ; « Qui reprend ses nouvelles demandes ? » : le personnel actif, disponibles d'abord puis le portefeuille le plus léger, chaque ligne avec ses biens suivis et son absence prévue ; motif facultatif « visible des administrateurs seulement » ; « Enregistrer l'absence ».
- La case « {Prénom} peut agir à sa place » n'est rendue — et `substitute_can_act` n'est envoyé — que sous `team.delegate_role` ou pour l'admin principal (`RoleDelegationPolicy::viewAny`) ; elle dit ce que le rôle permet et que le droit s'arrête seul le soir de la fin (ADR-0035, amendement : « L'écran le dit au moment de cocher »). Décochée par défaut : la délégation est un choix, pas un effet de bord.
- Modifier n'envoie que ce qui a changé (`PATCH`) : l'API rejoue la délégation dès qu'un champ de période, de remplaçant ou de case est présent, et refuse un `starts_at` sur une absence commencée (le champ « Du » est alors désactivé).
- S'ouvre depuis la fiche (carte « Absences » : « Déclarer », « Modifier » sur chaque absence en cours ou à venir ; bloc de l'absence en cours avec « Modifier » et « Terminer l'absence ») et depuis le bandeau du bureau (« Modifier l'absence », « Terminer l'absence » pour qui peut déléguer ; « Voir l'absence » sinon). Un membre déclare sa propre absence depuis sa fiche, sans la case s'il n'a pas la capacité.
- `AgentAbsencesSection` (supprimé avec ses 5 fichiers de tests) n'était plus monté que dans la fiche du membre (TCK-2667) : la carte « Absences » le remplace, et sa lecture en échec montre `ErrorState` avec « Réessayer » (un 403 la tait).
- Le bandeau dit « …, qui peut agir à sa place » quand une délégation liée couvre l'absence ; « jusqu'au 14 nov. » ne prend plus deux points en fin de phrase.

**Invitations** — `?vue=invitations`, `LesInvitations.tsx` et `FormulaireDInvitation.tsx` (remplacent `PendingInvitationsSection` et `InviteAgentDialog`, supprimés avec leurs 4 fichiers de tests, dont l'intention est reprise) :
- « En cours · N » (destinataire — e-mail, ou numéro quand l'invitation est partie par SMS —, rôle en clair, envoyée le, expire le ; « Relancer » sans confirmation, « Annuler » confirmé) ; « Expirées · N » repliées à cinq (trois au téléphone), « et N autres, plus anciennes » déplie par pages de vingt, « Relancer » sur chaque ligne ; « Tout effacer » confirme en disant le nombre et envoie `DELETE /api/invitations/expired?filter[role]=…`.
- Les listes, le compte de l'onglet et celui de la file d'accueil (`agency-queues`) ne demandent que les rôles de l'Équipe (`ROLES_D_EQUIPE` : bailleurs compris, locataires exclus). La purge efface ce même ensemble : ce que « Tout effacer » efface est ce que la liste montre.
- « Inviter un membre » : prénom, nom, e-mail, téléphone facultatif, rôle en cartes avec une phrase par rôle (« Administrateur » sous `team.assign_role`), double authentification, erreurs sur leur champ. La phrase d'acceptation ne dit plus « choisit son mot de passe ». « Inviter » de l'en-tête mène à cet écran (le dialogue a disparu) ; la file d'accueil y mène aussi.

**Fiche client** — `InviterACreerSonCompte` lit la dernière invitation sans réponse du client (`filter[customer_id]`) : « Invitation envoyée · envoyée le … · expire le … » ou « Invitation expirée · le … », avec « Relancer » et « Annuler » (confirmé, double authentification) ; la ligne « Compte » du dossier dit l'état. **Livré dans le même lot que le retrait des locataires de l'Équipe** (contrainte « jamais avant ») : les deux ne se séparent pas au commit.

**Page Rôles** — une délégation liée se lit « couvre l'absence de {nom} » et mène à l'absence (`/app/agency/team?filter[absent]=1&membre=…`) au lieu de « Révoquer » (l'API refuse sa révocation seule, 422 `role_delegation.covers_absence`) ; la section renvoie à « Couvrir une absence ».

Tests : `equipe/__tests__/` — CouvrirUneAbsence (10), FicheDuMembre.absences (7), LesInvitations (12), FormulaireDInvitation (6), ConsoleDeLEquipe (43), BandeauDesAbsences (5) ; `crm/__tests__/InviterACreerSonCompte` (5) ; RoleDelegationsSection (16), DossierDuClient.tck-2589 (10), agency-invitations (3), invitations-file-et-equipe (3), AgencyQueues (9) ; `ui/__tests__/date-picker.format-affiche` (2). **Dix ablations, toutes rouges puis restaurées (md5 vérifié)** : case rendue sans capacité, `substitute_can_act` envoyé sans capacité, PATCH qui renvoie toujours la fin, liste sans filtre de rôle, purge sans filtre de rôle, « Réessayer » inerte, délégation liée révocable, fiche client sans état d'invitation, double point du bandeau, en-tête sans la liste sous l'onglet des invitations.

**Vu au réseau, sur la base de démo, sans rien écrire** (tout non-GET refusé dans la page) : AC1 — `POST /api/agencies/1/absences` avec `"substitute_can_act":true` ; AC3 — « Expirées · 1 » (les 27 de locataires n'y sont plus), puis `DELETE /api/invitations/expired?filter[role]=owner,agent,agent_senior,agent_manager,agency_admin,service_provider`. AC5 — à 360 × 640, la feuille remplie, « Enregistrer l'absence » de 580 à 628 px. AC4 se joue par les tests seuls : une relance peut envoyer un vrai message.

Fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2668.json` (écrans a-2 et a-3, écarts acceptés et leurs motifs). Corrigé pendant la passe : le pied du dialogue sortait de l'écran au bureau dès onze collègues (primitive en grille : le dialogue est désormais une colonne flexible), le jour affiché « 12 novembre 2… » tronqué (« jeu. 12 nov. », `DatePicker.formatAffiche`, additif), l'en-tête qui perdait sous-titre et compte sous l'onglet « Invitations », la colonne du formulaire à 360 px au lieu de 400. AC-F6 : `balayer` 360 · 768 · 1024 · 1280 — débord 0, coupes 0. Le formulaire passe sous les listes avant `xl`, comme la maquette (le ticket disait « dès `lg` » ; à 1024 il laisserait 294 px aux listes).

**Correctifs de la passe adverse (verdict sur 776dc214f, 2026-11-12)** :
- D1 — l'agent qui a invité son client se voyait offrir « Relancer » et « Annuler », que l'API lui refusait (403, `team.invite`). Décision de la session : `InvitationPolicy` les accorde à l'émetteur d'une invitation née d'une fiche client tant qu'il peut encore inviter ce client ; l'API sert `abilities` sur ces invitations, la fiche n'offre que ce qu'elles disent (sinon « Seul l'auteur de l'invitation ou un administrateur de l'agence peut la relancer ou l'annuler. »). Les invitations d'équipe restent sous `team.invite`.
- D2 — « Qui reprend ses nouvelles demandes ? » lit `filter[assignable]=1` : un membre suspendu dans l'agence n'est plus proposé.
- D3 — une délégation n'accorde jamais `team.delegate_role` (résolveur) : le remplaçant qui « peut agir » ne voit plus « Déclarer » ni « Terminer l'absence ».
- D4 — une absence à venir s'annule depuis la fiche du membre (« Annuler », la révocation sous garde).
- D5 — un absent ou un remplaçant sans nom se dit « — ».
- D6 — « En cours » et « Expirées » se partagent les invitations sans réponse au sens de la purge (`filter[expired]`) : une invitation à l'échéance passée que le balayage horaire n'a pas encore marquée est sous « Expirées », et le nombre de « Tout effacer » est ce qui part.
- Gestes restés sans test, éprouvés par ablation : la garde du second facteur sur « Terminer l'absence », sur « Annuler » (équipe) et sur « Relancer » (fiche client) ; l'annulation vise la ligne désignée ; « Tous » lit `meta.counts.staff` ; `staff` ne compte pas un profil tenu dans une autre agence.
- Non mesuré au navigateur : « Annuler » sur une absence à venir, et la phrase sans geste de la fiche client.

Restes, notés pour la suite :
- L'invitation par lien WhatsApp (hors périmètre).
- Un agent sans `team.invite` ne lit sur la fiche client que ses propres invitations (règle de lecture de l'API) : celle d'un collègue n'y paraît pas, et « Inviter à créer son compte » rendrait alors le refus de l'API tel quel.
