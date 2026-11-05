---
id: TCK-2478
title: Un menu par persona — dispositions, action principale, en-tête d'espace, complément « Aussi … », espace suspendu
status: doing
phase: P1
family: front
estimate: L
wave: 82
created: 2026-11-05
updated: 2026-11-05
depends_on: [TCK-2477]
blocks: [TCK-2479, TCK-2480, TCK-2481, TCK-2483]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
  models: []
tags: [front, navigation, coque, adr-0089, i18n]
---

## Objectif utilisateur

Chaque profil — client, locataire, bailleur, agent, admin d'agence, hôte, prestataire, plateforme —
trouve en tête de son menu ce qu'il fait le plus, rangé selon son métier, avec son geste principal à
portée de main.

## Contrat de données

- Endpoints existants seulement : `GET /api/me/profiles` (agence et type du profil actif, pour
  l'en-tête d'espace), `GET /api/me/capabilities`, lecture de l'agence par le layout (`kind`,
  `status`).
- ⚠ À relever avant d'écrire l'action principale de l'agent : un parcours de création de visite
  existe-t-il sous `/app` ? Sinon l'action de l'agent est « Publier un bien » (sous
  `properties.create`), et l'écart s'écrit dans les notes.

## Direction UX / Artistique

Dispositions validées par le porteur le 2026-11-05 (➊ = action principale ; *(replié)* = replié
par défaut). La charte reste `docs/design-guidelines.md` (palette Lin).

| Persona | ➊ | Groupes, dans l'ordre | Plus |
|---|---|---|---|
| client | Chercher un bien | — : Tableau de bord · Messagerie / Mes recherches : Favoris · Recherches sauvegardées / Mes démarches : Visites · Réservations | Documents · Mes avis · Statistiques ; carte basse « Mettre un bien en location » (`/publish`), sur le modèle de la carte « Passer en pro » |
| locataire | Payer mon loyer | — : Tableau de bord · Messagerie / Mon logement : Mon bail · Paiements · Interventions · États des lieux · Documents / Mes recherches *(replié)* : Favoris · Recherches · Visites · Réservations | Mes avis · Statistiques |
| bailleur | Proposer un bien | — : Tableau de bord · Messagerie / Mon patrimoine : Mes biens · Baux · Finances · États des lieux / Activité : Demandes · Visites · Réservations · Calendrier · Interventions | Clients · Avis reçus · Documents · Statistiques · Exports · Favoris · Recherches |
| agent | Nouvelle visite (repli : Publier un bien) | — : Tableau de bord · Messagerie · Mes tâches / Prospection : Demandes · Clients · Visites · Calendrier / Catalogue : Mes biens · Réservations / Gestion : Baux · Entrées en attente · États des lieux · Interventions · Commissions | Avis reçus · Documents · Statistiques · Exports · Favoris · Recherches |
| admin-agence | Publier un bien | — : Tableau de bord · Vue agence · Messagerie / Activité : Demandes · Visites · Réservations · Calendrier / Portefeuille : Biens · Propriétaires · Clients · Baux · Entrées en attente / Finances : Finances · Commissions · Crédits · Facturation / Agence *(replié)* : Équipe · Rôles · Agence · KYC · Modération avis · Modération biens · Journal · Intégrations / Pilotage *(replié)* : Statistiques · KPIs · Alertes · Exports | Interventions · Carnet prestataires · États des lieux · Documents · Avis reçus |
| hote | Publier un bien | — : Tableau de bord · Messagerie / Mes biens : Mes biens · Réservations · Visites · Calendrier · Demandes / Mes locations : Baux · Finances · États des lieux · Interventions · Carnet prestataires / Mon espace : Agence · KYC · Reversements · Crédits · Intégrations | Clients · Statistiques · Exports · KPIs · Alertes · Avis reçus · Documents ; carte « Passer en pro » conservée |
| prestataire | — (aucune) | — : Tableau de bord · Interventions · Messagerie · Documents (aucun titre) | — |
| plateforme | Publier un bien | la disposition d'admin-agence | + lien bas « Console plateforme » (`/super-admin`) |

- **➊** : bouton plein en tête, seule surface de couleur primaire du menu ; absent (jamais
  désactivé) si le profil ne peut pas l'accomplir.
- **En-tête d'espace** : carte compacte en haut de la barre — nom de l'agence et persona
  (« Agence Teranga · Admin ») —, qui ouvre le sélecteur de profil ; précieuse dans le tiroir mobile,
  qui recouvre la barre haute. Le sélecteur de la barre haute ne bouge pas.
- **Complément « Aussi bailleur » / « Aussi agent » …** : groupe replié en bas de la barre.
- **Entrée active cachée** : si la page ouverte est dans « Plus », un groupe replié ou le complément,
  ce groupe s'ouvre.

## Contraintes strictes (métier)

- Une entrée n'apparaît que si son prédicat d'accès l'autorise (TCK-2477) ; un groupe vidé disparaît.
- Le complément ne porte QUE des destinations accessibles par un autre profil ACTIF du même espace
  (union de `roles`, ADR-0005 amendé) et non par le persona ; il s'ouvre sans changer de profil.
- **Espace suspendu** (`agency.status === 'suspended'`, TCK-600) : ➊ disparaît, ainsi que les entrées
  dont le seul objet est une écriture (publier, proposer, inviter) ; la lecture reste.
- Le cadenas de l'agence `individual` (`isProRouteLocked`) est conservé.
- Libellés neufs dans les trois langues ; le wolof porte le texte français tel quel (pause du wolof).

## Delta à produire

- [ ] Les huit dispositions ci-dessus remplacent les dispositions « miroir » de TCK-2477.
- [ ] Action principale par persona, en tête de barre.
- [ ] En-tête d'espace ouvrant le sélecteur de profil.
- [ ] Complément « Aussi … » replié.
- [ ] Règle de l'espace suspendu ; ouverture du groupe de l'entrée active.
- [ ] Carte « Mettre un bien en location » du client ; lien « Console plateforme ».
- [ ] Mise à jour d'`AppSidebar.test.tsx` : l'écart avec l'ancien menu, rôle par rôle, est écrit
      dans les notes de ce ticket.
- [ ] Tests : disposition rendue par persona ; complément ; suspendu ; entrée active cachée ; a11y
      (axe) de la barre de chaque persona.

## Critères d'acceptation

- [ ] AC1 — Pour chacun des huit personas, le menu rendu suit la table ci-dessus, aux entrées
      inaccessibles près (test par persona sur le composant monté).
- [ ] AC2 — Un admin d'agence `standard` qui est aussi bailleur de la même agence, profil actif
      admin, voit « Aussi bailleur » replié, contenant les seules destinations que seul le profil
      bailleur ouvre ; ablation : calculer le complément sur l'union fait rougir le test (il serait
      vide).
- [ ] AC3 — Espace suspendu : ni ➊ ni entrée d'écriture ; ablation : retirer la règle fait rougir.
- [ ] AC4 — Ouvrir une page placée sous « Plus » rend « Plus » déplié avec l'entrée active
      (`aria-current="page"`).
- [ ] AC5 — Le prestataire n'a ni ➊ ni titre de groupe.
- [ ] AC6 — L'en-tête d'espace nomme l'agence et le persona, et ouvre le sélecteur au clavier.
- [ ] AC7 — `npm run check:i18n` vert : chaque clé neuve en `fr`, `en`, `wo`.
- [ ] AC8 — Mesure au navigateur à 390, 768 et 1366 px : aucun défilement horizontal du document,
      tiroir et barre fixe (méthode : `docs/qa/responsive-2026-09-02.md`).

## Hors périmètre

- Bande « À traiter » et « Démarrer » (TCK-2479).
- Épingles, replis enregistrés, icônes seules (TCK-2480).
- Barre d'onglets mobile (TCK-2481), palette (TCK-2482), modules par agence (TCK-2483).

## Notes d'implémentation

_(à remplir par implementing-specs)_
