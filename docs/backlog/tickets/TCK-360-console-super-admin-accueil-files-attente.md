---
id: TCK-360
title: "Console super-admin — refondre l'accueil autour des files d'attente, et supprimer le doublon /system"
status: todo
phase: P2
family: front
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: [TCK-357]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
    - docs/features.md#26-audit--traçabilité
  models: []
tags: [front, super-admin, dashboard, navigation]
---

## Objectif utilisateur

Le super-admin qui ouvre la console voit d'abord **ce qui l'attend** — dossiers KYC, signalements, demandes d'upgrade, jobs échoués — au lieu d'un mur de huit nombres sans ordre ni destination.

## Contrat de données

Endpoints déjà existants, tous consommés ailleurs dans la console :

- `GET /api/admin/system/metrics` — les huit métriques actuelles
- `GET /api/admin/kyc`, `GET /api/admin/moderation`, `GET /api/admin/agency-upgrade-requests/pending-count`, `GET /api/admin/jobs/failed` — les comptes de files
- `GET /api/admin/audit` — les dernières entrées

Si un compte de file n'est pas obtenable sans charger la page complète de résultats, un endpoint de comptage dédié est à ouvrir côté API — à décider à l'implémentation, en réutilisant le patron de `agency-upgrade-requests/pending-count`.

## Direction UX / Artistique

- **Inverser la page.** En haut : les files, en lignes cliquables portant leur compte, chacune menant à la vue filtrée correspondante. Ensuite les métriques, chacune avec un delta sur 30 jours et un lien vers la liste filtrée. En bas : les dernières entrées d'audit.
- Une métrique sans tendance et sans destination n'est pas un tableau de bord, c'est un affichage. Chaque tuile doit répondre à « et alors ? ».
- **Les badges de file doivent exister ailleurs que sur un seul menu.** Aujourd'hui `agency-upgrade-requests` est la seule entrée de la barre latérale qui porte un compte ; le mécanisme `badgeKey` de `SuperAdminSidebar` a été écrit générique exactement pour ça (TCK-268).
- `/super-admin/system` réaffiche **exactement** la même grille de huit tuiles que l'accueil, plus quatre boutons. Deux pages qui affichent la même chose sont une page : `/system` devient un index de ses trois sous-pages, ou disparaît au profit du groupe de menu existant.

## Contraintes strictes (métier)

- Aucune file affichée sans lien vers la vue filtrée qui permet de la traiter.
- Les comptes de files se rafraîchissent sans devenir un cron serré : cadence alignée sur celle déjà retenue pour le badge d'upgrade (60 s), invalidation immédiate après une décision.
- Une file vide s'affiche comme une file vide — pas masquée : l'absence de dossier en attente est une information.
- Le delta d'une métrique n'est affiché que si la période de comparaison est réellement disponible ; jamais de tendance inventée à partir d'un seul point.

## Delta à produire

- [ ] Section « files d'attente » sur `/super-admin` : KYC, modération, demandes d'upgrade, jobs échoués — compte + lien filtré
- [ ] Métriques rendues via `StatCard` (TCK-357) avec delta 30 jours et lien vers la vue filtrée
- [ ] Section « activité récente » : 5 dernières entrées d'audit + lien vers `/super-admin/audit`
- [ ] Badges `badgeKey` de la barre latérale étendus à KYC et modération
- [ ] `/super-admin/system` : suppression de la grille dupliquée, page réduite à un index (ou supprimée si le groupe de menu suffit)
- [ ] Tests : rendu des files (peuplée / vide), présence des liens filtrés, absence de delta quand la période manque

## Critères d'acceptation

- [ ] AC1 — depuis `/super-admin`, chacune des quatre files est atteignable **en un clic** vers sa vue déjà filtrée
- [ ] AC2 — la grille de huit tuiles n'apparaît plus qu'à un seul endroit de la console
- [ ] AC3 — les entrées KYC et modération de la barre latérale portent un compte, avec la même cadence que l'existant
- [ ] AC4 — une file vide reste affichée, avec un libellé qui dit qu'elle est vide
- [ ] AC5 — aucun delta n'est rendu lorsque l'API ne fournit pas de point de comparaison (vérifié par un test sur une réponse sans historique)
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Les graphiques de `/super-admin/reports` : TCK-361.
- Le panneau de décision KYC : TCK-362.
- La palette et les primitives : TCK-357, TCK-358.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
