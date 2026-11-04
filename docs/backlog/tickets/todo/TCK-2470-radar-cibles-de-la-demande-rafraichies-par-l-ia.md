---
id: TCK-2470
title: "Radar : la demande sans résultat devient des cibles, que l'IA regroupe et tient à jour chaque nuit, révisions réversibles"
status: todo
phase: P2
family: full
estimate: L
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2468, TCK-2472]
blocks: [TCK-2471]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, cibles, ia, adr-0087, adr-0088]
---

## Objectif utilisateur

Ce que les visiteurs cherchent sans le trouver sur Takussan devient, sans geste humain, ce que le Radar va chercher
ailleurs — et la liste reste courte, cohérente et réversible.

## Contrat de données

**Signaux (aucune donnée personnelle ne sort vers le modèle)**

- `saved_searches` actives dont `results_count = 0` : `criteria` seuls, regroupés par signature, avec leur nombre.
- `SearchJournal::zeroResultDemand(days: 30)` (TCK-2472) : critères structurés et nombre de visiteurs distincts, lignes à
  au moins 2 visiteurs distincts.

**Migrations**

- `create_radar_target_revisions_table` : `id`, `operations` (jsonb — ce qui a été appliqué), `before` (jsonb — l'état des
  cibles touchées), `signals_signature` (string 64), `ai_call_id` (FK `ai_calls` null), `reverted_at`, `reverted_by_id`
  (FK users null), timestamps.
- `create_radar_demand_settings_table` : une ligne — `enabled` (bool, faux), `operator_id` (FK users null), `enabled_at`.
  Celui qui l'allume en devient l'opérateur (au nom duquel l'IA est jugée, comme une source : ADR-0080 §2).

**Usage IA** `radar.cibles` (classe sur le modèle de `RadarExtractionUsage` ; rôle `extraction` ; plafond quotidien
modeste, ex. 0,50 $) ; agent à sortie structurée : `operations: [{op: create|update|merge|retire, target_id?,
merge_ids?, name?, criteria?, reason, signal_refs[]}]`.

**Routes** (`api/admin/radar`, lecture `platform.radar.operate`, écriture `platform.radar.publish`)

| Verbe | Route | Effet |
|---|---|---|
| GET | `/demand` | `{enabled, operator, enabled_at, last_revision_at}` |
| PATCH | `/demand` | `{enabled}` — allume (devient opérateur) ou éteint |
| POST | `/demand/refresh` | lance un passage maintenant (job), 202 |
| GET | `/targets/revisions` | pagination de `RadarTargetRevisionResource` |
| POST | `/targets/revisions/{revision}/revert` | défait la révision (si aucune révision postérieure ne touche les mêmes cibles, sinon 409 `radar.targets.revision_superseded`) |

## Contraintes strictes (métier)

- **Le code valide, le modèle propose.** Chaque opération passe `RadarTargetCriteria` ; une opération invalide est écartée
  et consignée, les autres s'appliquent. Jamais plus de `radar.targets.max_demand` (20) cibles `demand` actives.
- **Jamais touchées par l'IA** : une cible `operator`, une cible `pinned`. Une opération qui les vise est écartée.
- **Pas de passage inutile** : si `signals_signature` est celle de la dernière révision, aucun appel.
- Rien ne part sans opérateur (réglage éteint ou opérateur disparu → aucun passage, l'écran le dit).
- `demand_count` d'une cible = la somme des signaux qu'elle couvre (recalculée à chaque passage, sans IA).
- Commande `radar:refresh-demand-targets`, planifiée la nuit (`routes/console.php`, commentaire `TCK-2470` qui dit son
  idempotence).

## Delta à produire

- [ ] Migrations, modèles `RadarTargetRevision`, `RadarDemandSetting` ; service `RadarDemandSignals` ; service
      `RadarDemandCurator` (appel, validation, application transactionnelle, révision) ; revert.
- [ ] Contrôleur, FormRequests, ressources ; routes dans `PlatformRoutesDefaultDenyTest`.
- [ ] Console (front, intentionnel) : sur la page des cibles de TCK-2469, un encart « Demande » (allumer / éteindre,
      opérateur, dernier passage, « rafraîchir maintenant ») et l'historique des révisions (opérations lisibles, motif
      donné par l'IA, « défaire »).
- [ ] Tests : `RadarDemandCuratorTest` (passerelle simulée : création, fusion, retrait ; cible opérateur et épinglée
      intactes ; plafond ; signature inchangée = aucun appel ; revert ; revert dépassé = 409), `RadarDemandApiTest`.

## Critères d'acceptation

- [ ] AC1 — Deux recherches sauvegardées sans résultat aux critères voisins + une ligne du journal donnent, après un passage
      dont le modèle propose une fusion, UNE cible `demand` avec `demand_count` = la somme.
- [ ] AC2 — Une proposition qui retire une cible épinglée ou de l'opérateur est écartée et consignée.
- [ ] AC3 — « Défaire » rend les cibles touchées à leur état d'avant.
- [ ] AC4 — Aucun texte saisi par un visiteur, aucun identifiant de compte n'est dans l'entrée du modèle (test sur
      l'entrée envoyée).

## Hors périmètre

- Le message qui cite la demande : TCK-2471.

## Notes d'implémentation

_(à remplir)_
