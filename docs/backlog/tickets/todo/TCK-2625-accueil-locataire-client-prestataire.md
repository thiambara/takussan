---
id: TCK-2625
title: "Accueil du locataire, du client et du prestataire : le loyer et « Payer » en tête, les visites et les favoris qui bougent, les interventions du jour"
status: todo
phase: P1
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2622, TCK-2623]
blocks: [TCK-2628]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, accueil, locataire, prestataire, mobile, audit-ux, app]
---

## Objectif utilisateur

- **Le locataire** ouvre l'app une fois par mois pour payer. Son accueil lui dit combien, avant quand, et le laisse payer en un geste. Il garde ses échéances, ses documents et sa check-list.
- **Le client** retrouve ses visites à venir, les favoris dont le prix a bougé et les recherches qui ont des nouveautés.
- **Le prestataire** arrive sur ses interventions du jour, et non sur « Explorez les biens ».

## Contrat de données

- **Locataire et client** — `GET /api/dashboard/me` (`TenantMeMetrics`), existant :
  - `next_payment` (prochaine échéance due) ;
  - `upcoming_payments` (30 jours) ;
  - `overdue_count`, `overdue_amount`, `maintenance_open` ;
  - `visits_upcoming`, `recent_documents` ;
  - `has_customer_profile`.
- **Montant restant** : `next_payment` porte le montant de l'échéance. Le restant dû d'une échéance partiellement payée se lit dans `leases/{lease}/payments` (`remaining_amount`). Le front affiche le restant, jamais le brut, quand ils diffèrent.
- **Payer** : le parcours existant de la page Paiements (`POST /api/{paymentType}/{paymentId}/initiate`, Wave et Orange Money), pas un second.
- **Quittance** : `GET leases/{lease}/receipts/{payment}/pdf`.
- **Biens de sa ville** : l'invitation de « Ma situation » (TCK-595), lue comme aujourd'hui.
- **Client** :
  - visites à venir (`visits_upcoming`) ;
  - favoris et changements de prix, ce que lit la page de favoris (TCK-2507 et suivants) ;
  - recherches sauvegardées et leurs nouveautés, dérivées comme sur la page des recherches.
- **Prestataire** :
  - `GET /api/maintenance-requests` avec `filter[assigned_to]=me` et la plage `filter[scheduled_from|to]` (TCK-2623) pour aujourd'hui ;
  - `filter[status]=quote_requested` pour les devis à chiffrer.
  - Gestes existants : `accept`, `start`, `complete`, `quote/submit`.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-accueil&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Locataire », « Client », « Prestataire ».
- **Locataire** :
  - **En tête, une carte « Loyer »** : « Loyer de décembre · 250 000 F CFA · à payer avant le 5 », puis « Payer » pleine largeur (48 px). En retard, elle passe en ton d'alerte : « En retard de 4 jours ». Payée, elle dit « Payé le 5 nov. · Quittance ».
  - Puis : « Signaler un problème », « Dernière quittance », « Contacter l'agence » (agence et agent).
  - Puis ce que « Ma situation » montrait : échéances des 30 jours, interventions en cours, documents récents, biens de sa ville.
- **Client** :
  - « Vos visites » (date, bien, adresse quand elle est confirmée) ;
  - « Vos favoris ont bougé » (« − 50 000 F sur le Studio Mermoz ») ;
  - « Nouveautés de vos recherches » (« 3 nouveaux studios à Mermoz ») ;
  - sans rien de tout cela, l'invitation à chercher de TCK-595.
- **Prestataire** :
  - « Aujourd'hui » : une carte par intervention, avec l'heure, le bien et la nature, puis « Commencer » ou « Terminé » selon l'état ;
  - « À chiffrer » (devis demandés) → « Chiffrer » ;
  - « À venir ».
- **Téléphone (360–390)** : une colonne. La carte « Loyer » et son bouton tiennent au-dessus du pli à 390 × 844. **Bureau (≥ 1280)** : deux colonnes dès `lg`, la carte du loyer (ou les interventions du jour) à gauche, le reste à droite.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md).
- **Une restitution de caution n'est jamais présentée comme une échéance à payer** (règle de « Ma situation »).
- **Payer** :
  - n'apparaît que sur une échéance payable ;
  - suit le parcours existant (choix du moyen, retour, vérification) ;
  - n'invente aucun montant ;
  - un 409 « déjà payée » ou « plus payable » recharge la carte et le dit.
- **Prestataire** :
  - l'adresse exacte et le téléphone du locataire ne paraissent qu'une fois l'intervention **acceptée**, comme la fiche d'intervention le fait aujourd'hui ;
  - « Commencer » et « Terminé » suivent la machine d'états (`MaintenanceStateMachine`) : un geste interdit n'est pas proposé ;
  - le prestataire n'a toujours **pas** de tableau de bord ni de « Rapports » (spec § 2.5) : l'accueil est sa liste de travail.
- **Pas de régression.** « Ma situation » (`/app/overview/tenant`) est absorbée par l'accueil du locataire et du client, et rien ne s'y perd :
  - « Ce qui m'attend » (prochaine visite, interventions en cours) ;
  - tuiles (baux actifs, prochain loyer, impayés, réservations en attente) ;
  - échéances des 30 prochains jours ;
  - documents récents ;
  - invitation à chercher selon l'intention (louer / acheter, 4 biens, « Voir la recherche », TCK-595).

  `/app/overview/tenant` redirige vers `/app` une fois ce ticket livré.
- **La check-list d'entrée dans les lieux** (`TenantOnboardingChecklistWidget`) reste au-dessus de la carte du loyer tant qu'un bail n'est pas prêt.
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement ; montants en F CFA sans décimales.

## Delta à produire

- [ ] Accueil du locataire : carte « Loyer » (à payer, en retard, payé) et « Payer », trois gestes, contenu repris de « Ma situation ».
- [ ] Accueil du client : visites, favoris qui ont bougé, nouveautés des recherches, invitation à chercher en repli.
- [ ] Accueil du prestataire : aujourd'hui, à chiffrer, à venir ; gestes selon l'état.
- [ ] Redirection de `/app/overview/tenant` vers `/app`.
- [ ] Tests :
  - restant dû affiché pour une échéance partielle ;
  - caution exclue ;
  - « Payer » absent sur une échéance non payable ;
  - prestataire : pas d'adresse avant acceptation, « Commencer » seulement à l'état qui le permet ;
  - client sans favoris ni visites : invitation à chercher.

## Critères d'acceptation

- [ ] AC1 — Locataire avec un loyer de 250 000 F dû le 5 décembre, dont 100 000 F déjà payés : la carte dit « 150 000 F », et « Payer » ouvre le parcours sur cette échéance (identifiant vérifié au réseau).
- [ ] AC2 — Locataire en retard de 4 jours : la carte porte « En retard de 4 jours » en ton d'alerte. À 390 × 844, le bouton « Payer » est entièrement visible sans défiler.
- [ ] AC3 — Locataire dont seule « échéance » à venir est une restitution de caution : aucune carte « à payer ».
- [ ] AC4 — `/app/overview/tenant` rend une redirection vers `/app`, et l'accueil du locataire contient les blocs « Échéances des 30 prochains jours » et « Documents récents ».
- [ ] AC5 — Prestataire avec une intervention aujourd'hui, acceptée et planifiée à 09:30 : la carte montre l'heure, l'adresse et « Commencer ». Pour une intervention seulement assignée (non acceptée), ni l'adresse ni le téléphone ne sont dans le DOM.
- [ ] AC6 — Prestataire sur `/app` : le texte « Explorez les biens » est absent de la page.

## Hors périmètre

- La page Paiements du locataire et le parcours de paiement lui-même (famille 4).
- La fiche d'intervention et le chiffrage (famille 4).
- La page des favoris (TCK-2618, famille 1).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
