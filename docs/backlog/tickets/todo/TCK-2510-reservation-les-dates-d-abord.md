---
id: TCK-2510
title: Réservation courte durée « Les dates d'abord » : calendrier des nuits prises, un seul récapitulatif
status: todo
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
tags: [front, reservation, mobile, audit-ux]
---

## Objectif utilisateur

Choisir ses dates en voyant ce qui est déjà pris, voir le total suivre le doigt, puis envoyer sa demande depuis un seul écran — sans être arrêté par une page de connexion avant même d'avoir choisi.

## Contrat de données

- **Les nuits prises existent déjà** : `GET /api/public/properties/{slug}/availability?from=&to=` (TCK-596) rend les plages occupées fusionnées — réservations confirmées et indisponibilités manuelles ou importées — sans dire pourquoi. *La maquette affirmait que ce calendrier n'existait pas côté API : c'est faux, relevé le 2026-11-08.*
- Devis : `booking-quote.ts` (nuit ou semaine au prorata), acompte de 30 % après confirmation (règle de la spec § 1.3).
- Envoi : endpoint de demande de réservation existant ; `response_deadline` de la réponse affichée.
- Connexion dans le tunnel : la connexion par numéro et code SMS existante, **quand `auth.phone_login.enabled` est vrai** ; sinon, le renvoi actuel vers la connexion, retour au tunnel avec les dates conservées.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=reservation&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- « Réserver » ouvre un calendrier plein écran ; jours pris barrés et non sélectionnables ; barre basse avec le nombre de nuits et le total, recalculé à chaque sélection.
- Puis **un seul écran** : récapitulatif (dates, voyageurs, total, acompte « après confirmation »), identité (numéro + code si non connecté), conditions, envoi.
- Succès : référence, montant enregistré par l'API, et ce qui se passe ensuite (l'agent confirme avant l'échéance, sinon la demande expire).
- L'acompte, une fois confirmé, reprend le paiement « Un total, un geste » (TCK-2505).

## Contraintes strictes (métier)

- Une DEMANDE, jamais une réservation instantanée : dit avant l'envoi, pas seulement après ; rien n'est prélevé avant confirmation.
- Une sélection qui chevauche une plage occupée est impossible au calendrier, et le refus de l'API (nuits déjà confirmées) reste géré.
- Un séjour peut arriver le jour du départ d'un autre (TCK-596).
- Un bien au mois renvoie vers l'agent, avec Visiter et WhatsApp (décisions 3a, 4a).
- Le tunnel n'a pas de barre d'onglets (ADR-0091 § 4) ; le titre de page perd la marque en double.
- **La politique d'annulation gratuite affichée par la maquette n'est pas livrée** : c'est une décision par agence, qui n'existe pas en base (voir Hors périmètre).

## Delta à produire

- [ ] Calendrier plein écran branché sur `availability`, nuits prises barrées, total en barre basse.
- [ ] Écran unique de récapitulatif + identité + envoi (remplace les quatre étapes).
- [ ] Connexion par numéro dans le tunnel derrière le drapeau, repli sur le renvoi actuel.
- [ ] Le filtre « Journalier / Hebdo » de la liste ne s'affiche que s'il a des biens à montrer.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (jours pris non sélectionnables, total recalculé, repli sans connexion par numéro, dates conservées au retour de connexion).

## Critères d'acceptation

- [ ] AC1 — Avec une plage occupée du 10 au 13, les nuits du 10, 11 et 12 sont barrées et une sélection du 9 au 11 est refusée au calendrier ; une arrivée le 13 est possible.
- [ ] AC2 — Le total affiché à l'envoi est celui de `booking-quote.ts` pour les dates choisies, à l'unité près.
- [ ] AC3 — Drapeau éteint : un anonyme qui envoie est renvoyé à la connexion et retrouve ses dates au retour.
- [ ] AC4 — Le parcours compte trois écrans (dates, récapitulatif, succès) au lieu de quatre étapes.

## Hors périmètre

- Une politique d'annulation par agence (à décider par le porteur, puis spec et ticket).
- Le paiement de l'acompte (TCK-2505).

## Notes d'implémentation

_(à remplir par implementing-specs)_
