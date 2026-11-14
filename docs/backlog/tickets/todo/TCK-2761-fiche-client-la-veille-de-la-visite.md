---
id: TCK-2761
title: "Fiche client, la veille de la visite : l'adresse du bien, « Itinéraire » et la trace du SMS de confirmation ; une recherche déduite d'une demande se dit telle"
status: todo
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2589]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [back, front, crm, customers, visits, audit-ux, app]
---

## Objectif utilisateur

La veille d'une visite, l'agent qui ouvre la fiche sait où il va, sans quitter la fiche, et sait que le client a été prévenu. Il sait aussi si ce que le client « cherche » vient de lui ou a été déduit de sa demande.

## Contrat de données

Ce ticket est le suivi du groupe 1 de la décision a-3 de TCK-2589 (team-lead, 2026-11-12 : « exclu avec un ticket de suivi »). La maquette de référence est `?p=app-fil-commercial&a=a`, écran « La fiche, la veille » (a-3), et sa fiche de fidélité `docs/qa/audit-ux-2026-11/fidelite/TCK-2589.json`.

Relevé du 2026-11-12 :

- `GET /api/customers/{id}` sert `upcoming_visits[]` avec `id`, `property_id`, `status`, `scheduled_at`, `preferred_window` et `manage`. Il ne sert ni l'adresse du bien, ni ses coordonnées, ni la trace d'un SMS de confirmation.
- La fiche ne garde aucune trace de la provenance de ses critères de recherche. On ne sait pas s'ils ont été saisis ou déduits du bien d'une demande (création depuis une demande, TCK-2590).
- Une entrée de contact du fil porte `channel`, `on` et `causer`, jamais un contenu. Le texte d'un échange WhatsApp n'existe pas dans Takussan : il est **hors de ce ticket, pour de bon**.

À servir (décisions à prendre à l'ouverture du ticket) :

- Sur `upcoming_visits[]`, l'adresse lisible du bien et ses coordonnées, aux seuls lecteurs qui lisent déjà la visite. Cela concerne la ligne « Rue OU-48 » et le geste « Itinéraire ».
- La trace de l'envoi du SMS de confirmation (« confirmée, SMS envoyé »), si le produit l'enregistre. Sinon, la phrase s'arrête à « confirmée ».
- Un marqueur posé quand la recherche de la fiche a été déduite d'une demande. Il est effacé dès que quelqu'un modifie la recherche. C'est la phrase « Déduit du bien de sa demande, à confirmer avec lui. ».

## Contraintes strictes (métier)

- Rien de plus que ce que le lecteur lit déjà de la visite et du bien. Le bailleur auteur d'une fiche ne lit pas les visites de la fiche (TCK-2589), et ne reçoit donc rien de ceci.
- Les sparse fieldsets sont gardés, et ces champs ne partent que demandés.

## Delta à produire

- API : les champs ci-dessus, avec leurs tests de forme et de portée.
- Front : dans « Prochaine action » de la fiche, la ligne d'adresse, « Itinéraire » (lien de carte vers les coordonnées) et la mention du SMS. Dans CHERCHE, la phrase « déduit ». Toutes les clés en fr et en, et wo = fr.

## Critères d'acceptation

- [x] AC1 — Une visite confirmée à venir montre l'adresse du bien, et « Itinéraire » ouvre la carte sur ses coordonnées. Sans coordonnées, il n'y a pas de geste.
- [x] AC2 — « SMS envoyé » ne se dit que si l'envoi est tracé.
- [x] AC3 — Une recherche déduite d'une demande se dit telle, et cesse de l'être dès la première modification.
- [x] AC4 — Le bailleur auteur ne reçoit aucun de ces champs (test API).

## Hors périmètre

- Le texte cité d'une réponse WhatsApp : l'échange se fait hors de Takussan.
- « demain », « confirmée » et « Rappeler la visite » : groupe 2 de la décision a-3, faits dans TCK-2589.

## Notes d'implémentation (2026-11-14)

- **Adresse.** Demandée par `fields[customers]=…,visit_places` (attribut calculé de `CustomerCommercialAttributes`,
  jamais rendu en clé de tête) et rendue SUR `upcoming_visits[].address` (`line`, `neighborhood`, `city`,
  `latitude`, `longitude` — la forme de `PropertyVisitResource::adresse`). Chargée pour la page en une requête
  (`CustomerResource::avecVisitesAmorcees`). Deux barrières : le lecteur des visites de la fiche
  (`criteriaBelongTo`), puis le lecteur de l'adresse au titre du bien (`PropertyVisitResource::lecteurDuBien`,
  extrait d'`adresseLisible` et partagé, sans la branche « visite confirmée » du visiteur). Le personnel s'y juge
  comme pour la visite (`PersonnelDeLAgence::personnelActifDe` : l'agence du profil actif), et non par
  `staffAgencyIds` : sous son profil d'une autre agence, l'agent lit les visites de sa fiche, pas l'adresse.
- **« Itinéraire ».** Vers les seules coordonnées (`itineraireVersLesCoordonnees`) ; sans coordonnées, aucun geste —
  `lienItineraire` des visites retombe sur l'adresse écrite, il n'est donc pas réutilisé.
- **SMS (AC2).** Relevé au HEAD : le sort du SMS de confirmation n'est enregistré nulle part
  (`VisitNotifier::confirmed()` rend `true` = « mis en file », jamais « parti »). La phrase s'arrête à « confirmée »,
  comme le ticket le prévoit ; aucune clé « SMS ».
- **Marqueur.** `customers.seeking_deduced_at` (migration `2026_11_14_170000`), posé par `ContactLeadService::linkLead`
  quand toute la recherche vient du bien (fiche sans critère, ou aux seuls critères déjà déduits), par un drapeau
  (`marquerLaRechercheDeduite`) et non `isDirty` — même seconde, colonne `timestamp(0)` : mesuré rouge. Effacé par le
  `saving` de `Customer` dès qu'un critère CHANGE ; un renvoi à l'identique (« 102000 » sur `102000.00`) le garde, et
  le vide n'a qu'une valeur (`null`, `[]`, `''` : la feuille d'édition renvoie ainsi les critères vides).
- **Preuves.** `tests/Feature/Crm/FicheLaVeilleDeLaVisiteTest.php` (14 tests) ;
  `src/components/customer-dashboard/fiche/__tests__/ResumeDuClient.tck-2761.test.tsx` (8 tests).
- **Ablations.** Barrière de la fiche retirée → AC4 (bailleur auteur propriétaire du bien) rouge ; barrière du bien
  retirée → « bien d'une autre agence » rouge ; marqueur hors du bloc des critères → AC4 du marqueur rouge ; repli de
  l'itinéraire sur l'adresse sans coordonnées → AC1 front rouge ; personnel jugé par `isStaffAt` au lieu du
  profil actif → « sous le profil d'une autre agence » rouge. Fichiers restaurés, md5 vérifiés.
- **Fidélité.** Relevés 390 et 1280 sur `/app/customers/120` (persona agent) : adresse « 65, impasse Dupuis · à
  confirmer » et « Itinéraire » plein. La base de démo n'a aucune visite confirmée à venir ni fiche déduite : l'état
  « confirmée » (Itinéraire + « Rappeler la visite » sur une ligne à 390, qui passe à la ligne si la place manque)
  et la phrase « déduit » sont éprouvés par les tests, NON relevés.
