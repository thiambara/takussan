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
depends_on: [TCK-2578, TCK-2581, TCK-2585, TCK-2586]
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

## Hors périmètre

- Le contenu du compte rendu et de la suite (TCK-2581) ; la planification (TCK-2586).
- La tournée sur carte (approche C) et la vue « Semaine » partagée avec l'agenda (TCK-2597 porte l'agenda).
- L'onglet de la barre et le menu (famille 3).

## Notes d'implémentation

_(à remplir par implementing-specs)_
