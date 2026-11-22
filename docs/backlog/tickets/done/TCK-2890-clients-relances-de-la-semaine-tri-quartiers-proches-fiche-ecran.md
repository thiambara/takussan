---
id: TCK-2890
title: "Clients : « Relances prévues cette semaine » et « N clients à relancer · Voir plus » au téléphone, tri par étape et référent au bureau, quartiers proches suggérés, doublon qui dit l'étape et le référent, Dossier dans la colonne gauche de la fiche, « Écrire » toujours là"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

**2026-11-15 — implémenté.**

- **Prémisse qui différait (relances de la semaine).** `filter[follow_up]=1` ne rend QUE des relances dues (`CustomerFollowUpQuery::filter`) : chaque ligne de « À relancer » était en retard, le groupe « cette semaine » toujours vide, AC1 inatteignable sans requête de plus. Correctif API, dans ce ticket : `filter[follow_up]=week` = relance due **ou** prochaine action (`CustomerNextActionQuery::atSql`, l'instant de `sort=next_action_at`) entre maintenant et dimanche 23:59:59 heure de Dakar ; hors personnel, rien (comme `=1`). La vue « À relancer » le lit, triée `-follow_up_days,next_action_at` (retards d'abord, puis la semaine dans l'ordre du jour) ; son compte (pastille, onglet, sous-titre) inclut donc la semaine — comme la maquette (« À relancer 6 » = 3 retards + 3 de la semaine). `=1` est inchangé (« Ma journée », pipeline).
- Comme la relance due, la branche « semaine » ne vaut que pour les étapes vivantes (`CustomerFollowUpQuery::liveStageValues`) : une fiche Gagnée ou Perdue avec une tâche jeudi n'entre pas dans « À relancer ».
- Le séparateur ne paraît que sous le tri des relances (`TRI_DES_RELANCES`) : une recherche dans la vue (pertinence) ou un tri de colonne mêle les deux groupes. « Voir plus » sans jeton client le dit (erreur) au lieu de rester muet.
- Fiches de fidélité de TCK-2590 (`docs/qa/audit-ux-2026-11/fidelite/TCK-2590.json`, écarts « flèches de tri », « Voir plus / cette semaine », « référent du doublon », « quartiers suggérés ») : ces écarts sont fermés ici ; la fiche TCK-2890 (AC-F1) reste à écrire par la passe de fidélité.
- **Décision** : « cette semaine » part de MAINTENANT, pas de demain (« après aujourd'hui » du ticket) — une action prévue cet après-midi, ni échue ni à venir demain, disparaissait sinon de la vue.
- Séparateur : avant la première ligne non en retard (`lecture.prochaine.enRetard`), vue « À relancer » seulement, au téléphone. Pied : `meta.total` ; « Voir plus » charge `page + 1` avec la lecture de l'URL (`lireLaListe`) via `fetchDashboardCustomers` et le jeton d'`AuthContext`, dédoublonne par id, repart de zéro quand la page serveur change, se tait quand tout est là. Le bureau garde sa pagination.
- Tri : `TRIS_DES_COLONNES.etape = pipeline_stage`, `.referent = referent` (TCK-2889) ; l'ordre est celui de l'enum (Nouveau d'abord, puis Prospect … Perdu). Libellés de la ligne de tri du téléphone « Par étape » / « Par référent ».
- **Quartiers proches** : la route exige `city=<id>` et la création courte n'a pas de ville. **Décision** : la première ville recherchée que le référentiel connaît, sinon Dakar (slug `dakar`). Noms repliés (accents, casse), approuvés seulement, haversine au plus proche des quartiers choisis, 3 au plus, aucun si aucun quartier choisi n'est situé. `lib/crm/quartiers-proches.ts` (pur) ; rien n'est demandé tant qu'aucun quartier n'est choisi. Même composant pour la création (e4) et « Modifier » (e2).
- Doublon : « Négociation · même numéro · suivi par Khady Diallo » (l'ordre de la maquette, le libellé de l'AC).
- **« Écrire »** : fiche sans compte → bouton qui ouvre l'invitation (`InviterACreerSonCompte`) avec « {prénom} n'a pas encore de compte : invitez-le pour lui écrire ici. ». **Décisions** : pour un lecteur sans `peutInviter`, pas d'« Écrire » (l'API refuserait : geste mort) ; fiche LIÉE à un compte que le serveur refuse (ou pas encore jugé), pas d'« Écrire » non plus (l'invitation y serait refusée, « fiche déjà liée »).
- Dossier : un seul DOM, placé par la grille — `xl:col-start-1 xl:row-start-2` sous le résumé, le fil en `xl:row-[1/span_2]`, `grid-rows-[auto_1fr]` (la première rangée a la hauteur du résumé). Au téléphone, l'ordre est inchangé (après le fil).
- AC8 : le filtre « Étiquettes » est toujours rendu ; vide, il dit « Aucune étiquette » et renvoie au « + Étiquette » de la fiche.
- AC7, AC-F1, AC-F2 : **non mesurés au navigateur** (consigne du lot). Relu dans le code : état vide personnel/bailleur (`ClientsVides`), Prochaine action, Cherche + « N biens correspondent », Origine et lignes du Dossier (TCK-2589) présents.
- Tests : `CustomerFollowUpTest` (+2), `ListeDesClients.tck-2890`, `CreationDuClient.tck-2890`, `quartiers-proches.tck-2890`, `FicheDuClient.tck-2589` (+3, dont l'ancien « sans compte : pas d'Écrire » remplacé), `CustomerListFilters` (AC8), tests de `lireLaListe` et de la page mis à jour ; `ModifierLaFiche` double le référentiel. Ablations une à une (rouge, restauré par md5) : filtre `week` sans la semaine ; `week` sans la borne des étapes vivantes ; séparateur hors tri des relances ; invitation absente du dialogue « Écrire » ; séparateur coupé ; « Voir plus » coupé ; tri d'étape retiré ; statut approuvé retiré ; tri par distance retiré ; « suivi par » retiré ; invitation retirée ; dossier remis colonne 2 ; filtre d'étiquettes caché sans étiquette.
