---
id: TCK-2479
title: La bande « À traiter » au-dessus du menu, et le groupe « Démarrer » d'un espace neuf
status: doing
phase: P1
family: full
estimate: M
wave: 82
created: 2026-11-05
updated: 2026-11-05
depends_on: [TCK-2478]
blocks: [TCK-2482]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, coque, adr-0089, compteurs]
---

## Objectif utilisateur

Ce qui attend une réponse (messages, visites, demandes, modération) se voit d'un coup d'œil en tête
du menu et s'ouvre déjà filtré — sans qu'aucune entrée du menu ne change de place ; et un espace neuf
sait par où commencer.

## Contrat de données

- Compteurs existants, mêmes clés de cache et même cadence qu'aujourd'hui : `useUnreadCount`,
  `usePendingVisitsCount`, `useUnhandledLeadsCount`, file de modération des avis
  (`fetchModerationQueue`), des biens (`propertyModerationCountQueryOptions`).
- Destinations filtrées (`hrefATraiter`) : à RELEVER page par page avant d'écrire la pastille — la
  page lit-elle déjà le filtre (`/app/visits` en attente, `/app/leads` non traitées, `/app/messages`
  non lus) ? Sinon, la pastille mène à la liste entière et l'écart s'écrit ici, ou la page apprend à
  lire le filtre dans ce ticket.
- « Démarrer » : relever si un endpoint existant rend l'état de mise en service de l'espace (biens,
  KYC, équipe) — le tableau de bord d'agence en lit une partie (ADR-0064 §3). **Sinon, côté API
  (prescriptif)** : `GET /api/me/espace/demarrage` → `{ data: { etapes: [{ code, faite }] } }`, codes
  `premier_bien`, `kyc`, `equipe` ; contrôleur `App\Http\Controllers\Api\Me\EspaceDemarrageController`,
  jugé sur le profil actif ; test `EspaceDemarrageTest` (agence neuve, agence en service, bailleur,
  profil sans agence → 200 et `etapes: []` : le groupe ne s'affiche pas, ce n'est pas une erreur).

## Direction UX / Artistique

- Une bande de pastilles compacte entre l'action principale et le premier groupe : « 3 messages ·
  2 visites · 1 demande ». Calme, lisible, pas une alerte : la couleur primaire reste à ➊.
- Ordre des pastilles par priorité du persona (l'agent : demandes d'abord ; le locataire : messages).
- Quatre pastilles au plus, puis « +2 ».
- « Démarrer » : groupe à étapes cochables, chaque étape un lien ; un geste pour le masquer.

## Contraintes strictes (métier)

- **Aucune entrée du menu ne change de place selon un compteur** (ADR-0089 §5).
- Un compteur n'est sondé que si son entrée est au menu, non cadenassée (`countersToPoll`, TCK-377).
- La bande ne se rend ni pendant le chargement ni sur une erreur : 0 vaut « rien à traiter ».
- Bande nommée (`region`, « À traiter ») ; chaque pastille porte un nom accessible complet
  (« 3 messages non lus »).
- Le masquage de « Démarrer » est enregistré par TCK-2480 (`demarrer_masque`) ; avant lui, il ne
  survit pas au rechargement, et c'est écrit dans les notes.

## Delta à produire

- [ ] Dérivation des pastilles depuis les compteurs et la priorité du persona.
- [ ] `hrefATraiter` au catalogue pour chaque compteur, filtres de page relevés (ou ajoutés).
- [ ] Bande rendue dans la barre et dans le tiroir.
- [ ] Groupe « Démarrer » pour hôte, admin d'agence et bailleur, et sa source de données.
- [ ] Garde : chaque `hrefATraiter` vise un paramètre que sa page lit.
- [ ] Tests : ordre par persona ; « +N » ; disparition à zéro, au chargement, sur erreur ; a11y.

## Critères d'acceptation

- [ ] AC1 — Avec 3 messages non lus et 2 visites en attente, un agent voit deux pastilles, dans
      l'ordre de sa priorité ; à zéro partout, aucune bande (ni nœud vide dans le DOM).
- [ ] AC2 — Le jeu d'`href` des entrées du menu est le même avec et sans compteurs non nuls ;
      ablation : faire remonter une entrée chargée fait rougir le test.
- [ ] AC3 — Une requête de compteur en échec ne rend aucune pastille pour ce compteur.
- [ ] AC4 — Chaque pastille mène à sa page filtrée, et la page filtrée affiche ce qui attend ;
      ablation : un `hrefATraiter` vers un paramètre que la page ignore fait rougir la garde.
- [ ] AC5 — « Démarrer » disparaît étape par étape, puis en entier quand tout est fait.
- [ ] AC6 — Le prestataire, sans compteur à part la messagerie, voit au plus une pastille.

## Hors périmètre

- Le masquage persistant de « Démarrer » (TCK-2480).
- Toute notification nouvelle : la bande lit des compteurs existants.

## Notes d'implémentation

_(à remplir par implementing-specs)_
