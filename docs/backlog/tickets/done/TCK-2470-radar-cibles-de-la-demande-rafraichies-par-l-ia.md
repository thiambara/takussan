---
id: TCK-2470
title: "Radar : la demande sans résultat devient des cibles, que l'IA regroupe et tient à jour chaque nuit, révisions réversibles"
status: done
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

- [x] Migrations, modèles `RadarTargetRevision`, `RadarDemandSetting` ; service `RadarDemandSignals` ; service
      `RadarDemandCurator` (appel, validation, application transactionnelle, révision) ; revert.
- [x] Contrôleur, FormRequests, ressources ; routes dans `PlatformRoutesDefaultDenyTest`.
- [x] Console (front, intentionnel) : sur la page des cibles de TCK-2469, un encart « Demande » (allumer / éteindre,
      opérateur, dernier passage, « rafraîchir maintenant ») et l'historique des révisions (opérations lisibles, motif
      donné par l'IA, « défaire »).
- [x] Tests : `RadarDemandCuratorTest` (passerelle simulée : création, fusion, retrait ; cible opérateur et épinglée
      intactes ; plafond ; signature inchangée = aucun appel ; revert ; revert dépassé = 409), `RadarDemandApiTest`.

## Critères d'acceptation

- [x] AC1 — Deux recherches sauvegardées sans résultat aux critères voisins + une ligne du journal donnent, après un passage
      dont le modèle propose une fusion, UNE cible `demand` avec `demand_count` = la somme.
- [x] AC2 — Une proposition qui retire une cible épinglée ou de l'opérateur est écartée et consignée.
- [x] AC3 — « Défaire » rend les cibles touchées à leur état d'avant.
- [x] AC4 — Aucun texte saisi par un visiteur, aucun identifiant de compte n'est dans l'entrée du modèle (test sur
      l'entrée envoyée).

## Hors périmètre

- Le message qui cite la demande : TCK-2471.

## Notes d'implémentation

Partie API (2026-11-04) ci-dessous ; la console (encart « Demande », historique) suit, sous « Console (front) ».

**Re-mesures qui différaient du ticket**

- **`saved_searches.results_count` n'est écrit par AUCUN code** (`grep -rn results_count app` : le modèle et sa
  ressource seulement ; colonne `default(0)` depuis `2026_04_17_160021`). Le filtre « actives dont `results_count = 0` »
  est appliqué tel que le ticket le dit, mais il retient aujourd'hui **toutes** les recherches sauvegardées actives.
  À ouvrir : un ticket qui fait écrire `results_count` par `SendSavedSearchAlerts` (ou un compte au passage).
  **2026-11-04 — fermé (décision du porteur, sans ticket à part)** : `SendSavedSearchAlerts` écrit, après les alertes,
  le `results_count` de CHAQUE recherche active (fréquence `off` comprise) — le total du moteur de l'alerte, sans fenêtre,
  par `SearchService::countMatchingProperties()` (`hitsPerPage: 0`) ; le total d'une première alerte (aucune borne basse)
  est repris sans requête de plus. La création et un changement de critères (`SavedSearchController::store`/`update`)
  comptent tout de suite ; un moteur indisponible laisse le compte précédent (`saved_search.count_failed`). Les alertes
  publiques (`RecordPublicSearchAlert`) attendent le passage suivant. `SavedSearchResultsCountTest`, ablations comprises.
- **Le journal porte des critères libres** (`city`, `cities`, `location`, `region`, `tags`) en plus de `normalized_query`.
  AC4 (« aucun texte saisi par un visiteur ») est tenu ainsi : `normalized_query` et `q` ne sont jamais lus ; un lieu
  n'entre que **reconnu par le référentiel** (ville par nom ou ancien nom, quartier par `QuartierDuFiltre`), et sous le
  nom du référentiel ; un lieu inconnu **écarte le signal entier** (l'ignorer élargirait la demande à tout le pays). Une
  région, un point (`lat`/`radius_km`) écartent aussi le signal (pas de critère de cible pour eux). `tags`, surface,
  salles de bain, état, titre, période : ignorés. Conséquence : une recherche tapée sans critère structuré (« appart
  almadies ») ne nourrit pas encore le Radar — l'analyse de la saisie (TCK-2473) pourra la convertir en critères.
- **`RadarTargets::update()` épinglait toute cible `demand` dont les critères changent** : un paramètre `$pinsDemand`
  (vrai par défaut) laisse la révision par l'IA réécrire une cible sans l'épingler ; il accepte aussi `demand_count`
  (pour « défaire »). Seul changement d'un fichier de TCK-2468.

**Décisions**

- `signals_signature` = SHA-256 des empreintes de critères des signaux retenus, **sans les comptes** : un compte qui bouge
  ne rappelle pas le modèle (`demand_count` est recompté sans IA à chaque passage). Comparée à la **dernière révision,
  défaite ou non** : un « défaire » n'est pas refait tant que la demande ne change pas.
- Un passage qui appelle le modèle écrit une révision **même sans opération** (c'est elle qui porte l'empreinte).
- Colonne `discarded` (jsonb) en plus du contrat : les opérations écartées et leur code (`radar.demand.*`,
  `radar.targets.*`) — « écartée et consignée » ; plus un `Log::warning('radar.demand.operation_discarded')`. Colonne
  `signals_count`. Sur le réglage : `last_run_at`, `last_run_outcome` (ce que l'écran dit du dernier passage).
- Couverture d'un signal (`RadarDemandSignals::covers()`) : **recouvrement** — sur chaque clé que les deux contraignent,
  une valeur commune / la même valeur / des fourchettes qui se chevauchent ; une clé non contrainte d'un côté ne sépare
  rien ; lieux : ville commune, quartier commun, ou quartier de l'un dans une ville de l'autre.
- Non éditables par l'IA : cible `operator`, épinglée, **en pause** (un geste de l'opérateur), retirée. Une fusion qui en
  atteint une est écartée entière ; chaque opération est atomique (point de sauvegarde).
- « Défaire » : refusé (409 `radar.targets.revision_superseded`) aussi quand l'opérateur a depuis **épinglé** une cible
  touchée ; 409 `radar.targets.revision_reverted` si déjà défaite ; une cible créée est retirée, jamais effacée. Un
  plafond ou un doublon rencontré en rétablissant rend le 422 de `RadarTargets` (`radar.targets.too_many|duplicate`).
- `PATCH /demand {enabled: true}` sur un réglage allumé dont l'opérateur a disparu **reprend** l'opérateur.
- Usage `radar.cibles` : rôle `extraction`, classe `publique`, plafond 0,50 $, sans cache, non strict (aucun pilote
  attesté), job en file `ai` (85 s, budget d'appel 75 s). Le prompt est `radar.cibles/v1.md`.

**À reporter dans les specs (la session)**

- `docs/models-spec.md` — `RadarTargetRevision` (`radar_target_revisions` : `id`, `operations` jsonb défaut `[]`,
  `discarded` jsonb défaut `[]`, `before` jsonb défaut `[]`, `signals_signature` string 64, `signals_count` unsigned int
  défaut 0, `ai_call_id` FK `ai_calls` null `nullOnDelete`, `reverted_at` timestamp null, `reverted_by_id` FK `users` null
  `nullOnDelete`, timestamps ; index `ai_call_id`, `reverted_by_id` ; relations `aiCall`, `revertedBy`).
- `docs/models-spec.md` — `RadarDemandSetting` (`radar_demand_settings` : UNE ligne, `CHECK (id = 1)`, insérée éteinte
  par la migration ; `enabled` bool défaut faux, `operator_id` FK `users` null `nullOnDelete`, `enabled_at`, `last_run_at`
  timestamps null, `last_run_outcome` string 64 null, timestamps ; index `operator_id` ; relation `operator`).
  `check-models-spec.mjs` rougit sur ces deux noms tant que ce n'est pas fait.
- `docs/features.md` §2.12 — les cibles de la demande : sources, exclusions (AC4), passage nocturne
  (`radar:refresh-demand-targets`, 03:40 Dakar), plafond `radar.targets.max_demand` (20), révisions et « défaire ».

**Console (front, 2026-11-04)**

Contrat re-mesuré contre `RadarDemandController`, les deux ressources et `routes/api/admin-radar.php` : conforme au
rapport de la partie API, aucun écart.

- **L'encart « Demande » est sur la LISTE des cibles** (`RadarCibles` → `cibles/EncartDemande.tsx`), pas sur la page
  d'une cible : le réglage est global (une ligne), et un interrupteur général sur la page de chaque cible — d'opérateur
  comprise — y serait hors sujet. La page d'une cible `demand` non retirée porte à la place une note (« l'IA peut la
  régler, la fusionner ou la retirer » / « épinglée ou en pause, elle n'est plus touchée ») et le lien vers l'historique.
- **L'historique est une sous-page** `/super-admin/radar/targets/revisions` (`cibles/RevisionsDemande.tsx`) : segment
  statique, servi avant `targets/[id]` comme l'API sert `targets/revisions` avant `targets/{target}`. Paginé (20).
- **Le plafond 20 de l'intro est recopié** (`RADAR_DEMAND_TARGETS_MAX`, `src/types/radar.ts`) : l'API ne l'expose pas.
  Si `radar.targets.max_demand` change, le texte ment — un ticket API peut l'ajouter à `RadarDemandSettingResource`.
- **Nom d'une cible écartée** : une proposition écartée ne touche rien, donc sa cible n'est pas dans `before` ; l'écran
  ne connaît que son id et affiche « cible n° N » (lien vers la cible). L'API pourrait consigner le nom dans `discarded`.
- « Défaire » est offert sur toute révision non défaite (pas de `revertable`, comme convenu) ; le refus s'affiche dans
  la confirmation, qui ne se relance plus : le 409 `revision_superseded` nomme la révision plus récente
  (`params.revision_id`) ou la cible épinglée depuis (`params.target_id`, nommée par l'état d'avant de la révision).
- « Rafraîchir maintenant » (202) : l'écran relit `GET /demand` toutes les 10 s, au plus 3 min, jusqu'à ce que
  `last_run_at` change ; un `last_run_at` qui change invalide aussi les cibles. Un 409 relit le réglage.
- Issues `ai.*` : libellés des motifs existants (`superAdmin.pages.radar.reasons`, `MOTIFS_RADAR`) ; tout code inconnu
  (issue ou écart) s'affiche par un repli, jamais brut. `codes-radar.tck-2470.test.ts` relit les constantes `OUTCOME_*`,
  `BLOCKED_*`, `DISCARD_*` et les codes `radar.targets.*` des sources PHP : un code neuf rougit avant de s'afficher par
  le repli.
- L'usage `radar.cibles` n'a pas de libellé dans le panneau des usages IA, mais aucun usage n'en a : le panneau affiche
  la clé (`AiUsagesPanel`). Rien à faire ici.

**À reporter dans les specs (console)**

- `docs/features.md` §2.12 — sur la page des cibles, l'encart « Cibles tirées de la demande » (allumée/éteinte, opérateur
  et date, ce qui bloque un passage, dernier passage et son issue, dernière révision, « rafraîchir maintenant », reprendre
  un réglage sans opérateur ; le support lit sans geste) ; la page « Révisions de la demande »
  (`/super-admin/radar/targets/revisions` : opérations appliquées avec noms, critères et motif de l'IA, propositions
  écartées et pourquoi, « défaire » avec confirmation, réservé à `platform.radar.publish`).

**Revue adverse (2026-11-04)** — (D3) une création, un réglage ou une fusion dont les critères ne couvrent
(`RadarDemandSignals::covers()`) aucun des `signal_refs` cités est écartée, `radar.demand.uncovered`. (D5) « défaire » rend
409 `radar.targets.revision_superseded` (`params.target_id`) si une cible touchée n'a plus le statut où la révision l'a
laissée (retirée ou mise en pause par l'opérateur). (D6) « défaire » juge `max_demand` sous le verrou : 422
`radar.targets.too_many` s'il le dépasserait en ajoutant. (D7) Sans aucun signal, les cibles `demand` actives non épinglées
sont retirées SANS IA dans une révision défaisable (`ai_call_id` nul, motif `radar.demand.no_demand`, issue
`no_signals_retired`), une seule fois tant que la demande ne revient pas. (D8) L'empreinte d'un passage porte aussi les
places libres (`max_demand` − cibles `demand` actives, comptées APRÈS la révision) : une place libérée relance le modèle ;
« défaire » ré-estampille la dernière révision si elle valait l'état d'avant, pour qu'une place qu'il libère ne relance
rien. Une opération écartée consigne `target_name` ; `RadarDemandSettingResource` rend `max_demand` (fin de
`RADAR_DEMAND_TARGETS_MAX` côté front).
