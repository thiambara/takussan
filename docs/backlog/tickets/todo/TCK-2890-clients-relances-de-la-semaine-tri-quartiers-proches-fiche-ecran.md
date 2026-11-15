---
id: TCK-2890
title: "Clients : « Relances prévues cette semaine » et « N clients à relancer · Voir plus » au téléphone, tri par étape et référent au bureau, quartiers proches suggérés, doublon qui dit l'étape et le référent, Dossier dans la colonne gauche de la fiche, « Écrire » toujours là"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2889]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#91-geoneighborhood-"
tags: [front, crm, customers, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Au téléphone, l'agent voit ce qui est en retard puis ce qu'il relancera cette semaine ; au bureau, il trie ses clients par étape ou référent ; en saisissant ce qu'un client cherche, il se voit proposer les quartiers voisins ; sur la fiche, le dossier est à sa place et « Écrire » ne disparaît pas.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-clients e0 à e5). Écarts acceptés par les fiches de TCK-2589 / TCK-2590 que le porteur veut voir faits : la section « Relances prévues cette semaine » et le pied « Voir plus » (« aucune donnée »), le tri Étape / Référent (« l'API refuse » — servi par TCK-2889), les quartiers proches (« aucune source » — **la liste des quartiers d'une ville sert déjà latitude et longitude**, `GET /api/public/geo/neighborhoods?city=`, le calcul se fait à l'écran), le doublon sans référent (servi par TCK-2889 ; l'étape est déjà servie).

## Contrat de données

- `GET /api/customers` : `sort=next_action_at`, `filter[follow_up]`, `sort=pipeline_stage|referent` (TCK-2889).
- `GET /api/customers/duplicates` : `stage`, `referent` (TCK-2889).
- `GET /api/public/geo/neighborhoods?city=` (coordonnées).
- `POST /api/customers/{customer}/invite` (existant) pour « Écrire » sans compte.

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-clients` — fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-clients-liste.tsx` (l. 80 « Relances prévues cette semaine », l. 85 pied) et `app-clients-fiche.tsx` (gestes l. 79-90, 245-256) ; écrans **e0 Liste**, **e1 Fiche**, **e2 Modifier**, **e3 Nouveau client : qui**, **e4 Nouveau client : sa recherche**, **e5 Liste vide**.

- **Téléphone (390)** — manque : e0, le séparateur « Relances prévues cette semaine » entre les clients en retard et ceux dont la relance tombe d'ici dimanche ; le pied « N clients à relancer · Voir plus » à la place de la pagination (vue « À relancer » ; « N clients · Voir plus » sur « Tous »).
- **Bureau (1440)** — manque : e0, les flèches de tri sur « Étape » et « Référent » ; e1, le bloc « Dossier » (biens correspondants, documents, relations, réservations, baux, pièce, compte) **dans la colonne gauche sous Référent / Étiquettes**, et non sous le fil.
- **Les deux formats** — manque : e2 et e4, suggestions « + Sacré-Cœur · + Point E · + Liberté 6 » (les trois quartiers approuvés les plus proches des quartiers choisis, pas déjà choisis) ; e3, le doublon qui dit l'étape et le référent de la fiche trouvée ; e1, « Écrire » présent même sans compte joignable.

## Contraintes strictes (métier)

- « Écrire » sans compte joignable ouvre l'invitation du client à créer son compte (`customers.invite`), avec l'explication « {prénom} n'a pas encore de compte : invitez-le pour lui écrire ici » (décision prise à l'écriture du ticket : la maquette dessine toujours trois gestes ; un geste mort serait un défaut).
- Quartiers proches : distance à vol d'oiseau, dans la même ville, au plus 3 suggestions ; aucune si les quartiers choisis n'ont pas de coordonnées.
- « Voir plus » charge la page suivante sur place (pas de navigation).
- La section « cette semaine » se dérive de `next_action_at` (après aujourd'hui, au plus dimanche) — aucune requête de plus que la liste.
- i18n `fr`/`en`/`wo`.

## Delta à produire

- [ ] Liste téléphone : séparateur et pied « Voir plus ».
- [ ] Tableau bureau : tri Étape et Référent.
- [ ] Création et modification : quartiers proches suggérés.
- [ ] Doublon : étape et référent.
- [ ] Fiche bureau : Dossier en colonne gauche ; « Écrire » toujours présent.
- [ ] Tests de composant : séparateur entre retard et semaine ; pied « Voir plus » charge la page 2 ; tri envoie `sort=pipeline_stage` ; 3 quartiers proches triés par distance ; Écrire sans compte ouvre l'invitation.

## Critères d'acceptation

- [ ] AC1 — À 390, vue « À relancer », 2 clients en retard et 4 dont la relance tombe jeudi : le séparateur « Relances prévues cette semaine » est entre les deux groupes ; le pied dit « 6 clients à relancer · Voir plus ».
- [ ] AC2 — À 1440, cliquer « Étape » trie Prospect → Perdu, recliquer inverse ; « Référent » trie par nom.
- [ ] AC3 — En choisissant « Fann », la création propose les trois quartiers approuvés les plus proches de Fann ; en toucher un l'ajoute.
- [ ] AC4 — Saisir le téléphone d'un client existant affiche « Déjà dans vos clients · Négociation · suivi par Khady Diallo ».
- [ ] AC5 — À 1440, sur la fiche, « Dossier » est dans la colonne gauche sous Référent / Étiquettes.
- [ ] AC6 — Sur la fiche d'un client sans compte, « Écrire » est présent et ouvre l'invitation.
- [ ] AC7 — Vérifier au navigateur, deux formats : la liste vide d'une agence sans client (« Ajouter un client ») et sa variante bailleur (sans bouton) (e5) ; une fiche avec critères, origine, document et tâche montre Prochaine action (Confirmer, tâche suivante), Cherche + « N biens correspondent », Origine et les lignes du Dossier (e1) ; corriger si absents.
- [ ] AC8 — À 1440, le filtre « Étiquettes » est présent même quand l'agence n'a aucune étiquette ; il dit alors « Aucune étiquette » et propose d'en créer une depuis la fiche.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2890.json` : écrans e0 à e5 de `app-clients`, téléphone et bureau.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.

## Hors périmètre

- Le budget en champs min./max. (e2) : incohérence entre maquettes, le curseur est la valeur majoritaire (ADR-0106 § 2) — non repris.

## Notes d'implémentation

_(à remplir par implementing-specs)_
