---
id: TCK-2587
title: "Visites par le temps : Aujourd'hui, À confirmer, À clore, Plus tard — confirmer en ligne, l'heure et l'adresse d'abord, la fiche en trois états"
status: todo
phase: P1
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2578, TCK-2581, TCK-2585, TCK-2586, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [front, visits, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent sur le terrain voit d'abord ses visites du jour dans l'ordre, avec l'heure, l'adresse et le visiteur, confirme les demandes en un geste, et clôt les visites passées sans ouvrir chaque fiche.

## Contrat de données

- `GET /api/property-visits` : `filter[day]`, `filter[to_close]=1` (TCK-2578), `filter[status]`, `filter[unassigned]`, `filter[mine]`, `filter[search]`, `filter[agent_id]`, `filter[property_id]`, `include=property,customer,agent,visitor` avec l'adresse et `visitor_display` (TCK-2585), `fields[…]`.
- `GET /api/property-visits/counts` (TCK-2585) pour toutes les pastilles en une requête.
- `POST /api/property-visits/bulk-confirm`, `bulk-assign` (TCK-2585) ; gestes unitaires existants (`claim`, confirmer, replanifier, terminer, absent, annuler).
- `POST …/report` (TCK-2578) pour les verdicts posés sur la carte « À clore ».

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-visites&a=a` — écrans « Liste », « Détail — à confirmer », « Détail — jour J », « Détail — après l'heure », « Côté client » ; téléphone redessiné le 2026-11-10 (`app-visites-a-mobile.tsx`) ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Trois règles du téléphone : l'heure en chiffres de titre et l'adresse juste dessous avec son épingle ; **une seule couleur forte par écran** ; des cartes espacées plutôt que des lignes à filets.
- Pastilles : Aujourd'hui · À confirmer · À clore · Plus tard, avec compteurs ; « Toutes les visites, par statut » en bas mène aux onglets de statut.
- Aujourd'hui : la prochaine visite en carte à photo (« dans 45 min », heure en grand, bien, adresse, visiteur avec Appeler et WhatsApp, **Itinéraire** seul bouton plein) ; « Libre de 11:30 à 16:55 » entre deux visites.
- À confirmer : la date en tuile, la tranche (« L'après-midi · heure à fixer »), le mot du visiteur en citation ; « Autre heure » à gauche, « Confirmer 15:00 » à droite.
- **Décision 2a, trois gestes déplacés et gardés** : sur la fiche à confirmer, « Autre heure » devient la pastille **« Autre… »** parmi les heures libres ; « Faire le compte rendu » devient **les trois verdicts sur la carte « À clore »** (Intéressé / À réfléchir / Pas intéressé, plus « n'est pas venu » et « Compte rendu ») ; l'interrupteur d'étape vit dans le compte rendu (TCK-2581).
- Fiche : photo du bien, l'heure en grand avec « dans 45 min », quatre temps (Demandée, Confirmée, Visite, Compte rendu), carte du lieu (adresse en gras, Itinéraire), carte du visiteur (Appeler, WhatsApp, Voir sa fiche), la demande et sa tranche ; **un seul geste plein collant par état** : « Confirmer pour mer. 11 à 15:00 » (avant), « Je suis en route » + « Commencer » (jour J), « Absent » + « Terminer la visite » (après l'heure) ; « Autres gestes » en bas (Replanifier, Attribuer à un collègue, Prévenir d'un retard, Annuler la visite).
- « Je suis en route » et « Prévenir d'un retard » ouvrent WhatsApp avec un message prérempli (vouvoiement) ; « Commencer » passe la fiche à l'état « après l'heure » sans rien écrire en base.
- **Téléphone (360-390 px)** : comme ci-dessus. **Bureau (≥ 1280 px)** : tableau Quand · Bien (quartier) · Visiteur · Agent · Statut (le type dans la colonne Statut), cases à cocher et « Confirmer (n) » / « Attribuer » ; filtres Agent, Bien, Période ; détail en deux colonnes (la visite et le lieu / le visiteur et le compte rendu) ; colonnes dès `lg`.
- Visites n'est plus un onglet de la barre de l'agent : la page s'ouvre depuis « Aujourd'hui » et le Menu (barre d'onglets : famille 3).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0101](../../../adr/0101-le-fil-commercial-vit-dans-la-fiche-client.md).

**Pas de régression** (`VisitsList.tsx`, `onglet-des-visites.ts`, `VisitDetail.tsx`, audit § 4) :
- onglets de statut dans `?tab=` — Non attribuées (personnel), Demandées, Confirmées, Passées, Annulées — avec leur total, une page de 30 ; les liens existants vers `?tab=requested` (pastille du menu, bloc « Aujourd'hui ») ouvrent « À confirmer » ;
- ligne : bien, statut, type, « Non attribuée », date et durée ;
- détail : créneau (date, heure, durée), notes, motif d'annulation, demandeur (fiche, compte ou visiteur anonyme) avec `tel:`, `mailto:`, « Fiche CRM », accompagnement ;
- gestes selon le rôle et l'état : Prendre en charge (409 si un collègue l'a prise), Confirmer (heure exigée pour une tranche), Replanifier (heure de Dakar), Proposer un autre créneau (visiteur : créneaux libres), Terminer, Absent (après l'heure), Annuler (motif), Voir le bien ; avertissement de SMS retenu ;
- **côté client** (« Mes visites ») : mêmes données sans les gestes du personnel, prochaine visite en carte (adresse si confirmée, agent avec WhatsApp), Proposer un autre créneau, Annuler, avis 1-5 dans les 24 h ; l'audit relève que le client ouvre aujourd'hui sur « Demandées 0 » : il ouvre sur ses visites à venir, sinon passées ;
- le bailleur voit les visites de ses biens comme aujourd'hui ;
- « Non attribuées » est visible de l'admin (l'audit ne l'a pas vue sur ses captures malgré `VisitsList.tsx:40`) et de l'agent.
- Le compteur saturé « 99+ » ne s'affiche plus dans la page : les pastilles donnent le nombre exact.
- i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement ; vocabulaire « demandée / confirmée » expliqué par les quatre temps.

## Delta à produire

- [ ] Liste par le temps (quatre pastilles + accès aux statuts), cartes du téléphone, tableau du bureau avec sélection.
- [ ] Confirmation en ligne et en lot, attribution en lot.
- [ ] Carte « À clore » avec verdicts (ouvre la suite de TCK-2581 après le verdict).
- [ ] Fiche en trois états, gestes WhatsApp « en route » / « retard ».
- [ ] Vue client.
- [ ] Tests : pastilles alimentées par `counts` (une requête) ; `?tab=requested` ouvre À confirmer ; « Confirmer 15:00 » en ligne poste `scheduled_at` ; lot mixte rendu ligne par ligne ; verdict sur la carte poste `report` ; client sans gestes du personnel ; bailleur.

## Critères d'acceptation

- [ ] AC1 — À 390 px, l'agent de démo ouvre « Visites » sur « Aujourd'hui » : la visite de 10:57 montre l'heure, « Local commercial · Dakar-Plateau », l'adresse, Abdoulaye Cissé et Itinéraire sans défiler.
- [ ] AC2 — Au montage, la page émet **une** requête de compteurs (relevé réseau), pas cinq.
- [ ] AC3 — Sur « À confirmer », « Confirmer 15:00 » de la demande « mer. 11, l'après-midi » confirme sans ouvrir la fiche ; « Autre… » sur la fiche ouvre le choix d'une autre heure.
- [ ] AC4 — Sur « À clore », toucher « Intéressé » sur la visite de Yacine Diouf enregistre le verdict et ouvre « Et maintenant ? » ; « n'est pas venu » marque Absent.
- [ ] AC5 — À 1280 px, cocher trois demandes puis « Confirmer (3) » rend un résultat par ligne ; une ligne refusée reste cochée avec sa raison.
- [ ] AC6 — Connecté en client avec deux visites passées et aucune à venir, la page ouvre sur ses visites passées, avec l'avis 1-5 proposé dans les 24 h.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2587.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le contenu du compte rendu et de la suite (TCK-2581) ; la planification (TCK-2586).
- La tournée sur carte (approche C) et la vue « Semaine » partagée avec l'agenda (TCK-2597 porte l'agenda).
- L'onglet de la barre et le menu (famille 3).

## Notes d'implémentation

**Décisions tranchées le 2026-11-11** (session, par délégation du porteur) :

- **Filtre « Statut » omis** au bureau : sous un onglet qui borne déjà le statut, il se contredirait.
- **Temps libre arrondi au quart d'heure suivant** la fin de la visite (« Libre de 11:30 », pas 11:27 — `tempsLibreEntre`).
- **« Désélectionner » est un bouton** dans la barre de sélection, pour la cible tactile.
- **Case d'en-tête indéterminée** quand une partie des lignes est cochée : le patron standard.
- **« Toutes N » ouvre N** : la pastille du bureau compte `counts.all` (la portée entière, comme la maquette) et ouvre la vue des statuts sur l'onglet « Toutes », lu sans `filter[status]` ni borne de date (`?vue=status&tab=all`). « Par statut » au téléphone, sans compte, ouvre le défaut « Demandées ». Sous un filtre du bureau (agent, bien, période, recherche), « Toutes » n'affiche pas de compte : la vue des statuts ne lit pas ces filtres.
- **Compteurs** : `later` (confirmées à partir de demain 00:00 à Dakar, borne incluse) et `all` (toute la portée de lecture) dans `GET /api/property-visits/counts`, même portée et même requête que les autres clés.

**AC6 — persona client** (base de démo LOCALE seulement) : `client-deux-visites-ac6@example.net`, deux visites terminées (il y a ~3 h 30, et il y a neuf jours), aucune à venir. Créée par un script tinker idempotent du scratchpad (`persona-ac6-2587.php`, `--execute='require "…";'`), notifications, mails et files doublés, sans événements de modèle ; chaque exécution recale l'heure de la visite récente pour que l'avis reste « dans les 24 h ». Son jeton est dans `~/.takussan-demo/jetons.json` (`client_deux_visites_ac6`).

**Lot C — « Mes visites » du client** :

- **Tons de statut alignés sur les maquettes, partout** (validé par le team-lead) : confirmée en vert, terminée en neutre, annulée et manquée en rouge (`VISIT_STATUS_TONE`).
- **Les passées gardent leur page** pendant que la suivante charge (`keepPreviousData`) : sans cela la vue repassait en squelette, et l'avis en cours de saisie avec elle.
- **Joindre l'agent** (décision a) du team-lead, confirmée par le porteur : « agent avec WhatsApp », un contact professionnel) : `agent.phone`, `agent.phone_whatsapp` et `agent.agency_name` ne sortent que pour le demandeur (le visiteur, ou le compte de sa fiche), et seulement quand la visite est **confirmée et à venir**. Les clés sont absentes pour tout autre lecteur et tout autre état (`PropertyVisitResource::contactDeLAgent`, jugé sur `VisitReadContext`).
  - **Il n'existe aucun numéro professionnel** : ni le profil agent ni l'adhésion n'en portent. Le numéro est celui du compte, sous la règle D10 (`User::numeroPrincipalPublic()`, puis le secondaire) : un numéro non vérifié n'est pas servi.
  - **La règle D10 l'emporte** (team-lead, 2026-11-12) : elle vaut pour tout numéro servi à un tiers. **Sur la démo, le geste n'apparaît donc pas** : sur 21 agents, aucun n'a un numéro vérifié (relevé du 2026-11-12). Le test positif fabrique un agent dont le numéro est vérifié.
  - Un agent qui n'est plus du personnel actif de l'agence n'est pas joint par là.
  - Côté front : « Agent · <agence> », Appeler (`tel:`), WhatsApp (`wa.me`, seulement si le numéro est déclaré WhatsApp). Aucun geste sans numéro, aucun signalement de clic.

**Reprises du lot B (vérification)** :

- **L'épingle P152.04 retrouve ses dents** : le bailleur (`abilities.manage` faux) est aussi rendu au téléphone, où les gestes ne dépendent que de `canCancel`, `canComplete`, `canMarkNoShow` et `canReschedule`. Au bureau, le garde `personnel` de la fiche masquait tout.
- **Les deux fichiers de la fiche tournent sous `TZ=Europe/Paris`** : à Dakar (UTC, la machine et la CI), une lecture en heure locale passait inaperçue.
- **« Commencer » est grisé avant l'heure prévue moins 30 min**, avec « Possible à partir de HH:MM ». Cliqué à 14:00 pour 17:00, la fiche disait « l'heure de fin prévue est passée » dès 14:30. ⚠ À l'instant dessiné par la maquette (10:12 pour 10:57, « dans 45 min »), le geste est donc grisé : c'est un écart voulu.
- **`/api/customers/{id}` et `/api/properties/{id}` restent lus sans `fields`** : un `show` rend la ressource entière et ignore `fields` (décision du porteur P60.03, ADR-0021, gardée par `show-sans-fields.garde.test.ts`).

**Reprises du lot C (vérification)** :

- **La fenêtre d'avis court depuis `min(completed_at, maintenant)`** (`lib/visites/fenetre-d-avis.ts`).
  Une clôture datée dans le futur (horloge d'un poste, donnée de démo) compte comme une clôture à
  l'instant : la carte reste offerte, et ne promet jamais plus de 24 h (« encore 392 h » avant). Ce
  choix, plutôt que « rien avant `completed_at` », suit l'API : la visite est terminée (son statut le
  dit) et `PropertyVisitController::feedback` accepte l'avis (`diffInHours` signé, jamais au-delà de 24).
  ⚠ L'API, elle, laisse donc la fenêtre ouverte jusqu'à 24 h après une date future : à borner à part
  si on le veut. Testé, contrôle de statut compris (ablation C2 désormais rouge).
- **`notes` ne sort plus au client** : la colonne a deux auteurs — le message d'une demande publique et
  la note de planification du personnel (« Code du portail, étage, personne à demander… ») — et rien ne
  dit qui a écrit une ligne. Elle suit la règle des outils de la console, comme `metadata` : clé
  absente pour le visiteur, le client de la fiche et le bailleur d'un bien d'agence ; lue par le
  personnel et le propriétaire d'un bien sans agence (`VisitNotesPrivacyTest`, un test par rôle).
  Aucun écran du client ne la lisait.
- **Gardes ajoutées** : B6 (le second numéro vérifié prend le relais d'un principal non vérifié, avec
  son propre WhatsApp) et B7 (`phone_whatsapp` lu sur le numéro servi) dans
  `PropertyVisitContactDeLAgentTest` ; C5 — les colonnes de « Mes visites » (`VISIT_CLIENT_FIELDS`)
  sont épinglées, et toute colonne de l'agence (`visitor_*`, `notes`, `metadata`, compte rendu…) y
  fait rougir `visits.champs-du-client.tck-2587.test.ts`.

**Observations à juger à part** :

- Des visites `completed` datées du 27 nov. (dans le futur) dans la base de démo sont comptées par `to_close`.
- Pour un client, `counts` rend `to_close` = 1 (sa visite terminée du jour) : le front ne lui montre pas « À clore », mais la clé n'est pas bornée au personnel côté API.
- **Reste (relevé de TCK-2624, 2026-11-13)** : `bienEtQuartier` (`components/visits/par-le-temps/pieces.tsx`) redit le quartier quand le titre du bien le porte déjà — « Appartement meublé Point E · Point E » sur la démo. L'accueil de l'admin passe par `titreEtQuartier` (`lib/accueil/a-faire.ts` : casse, accents et ligatures ignorés) ; la liste des visites garde le doublon. Correctif suggéré : faire de `bienEtQuartier` un appel à `titreEtQuartier`.
