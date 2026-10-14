# Passe 012 — Rien d'appliqué, deux faux positifs levés, TCK-633 mesuré

- **Date :** 2026-10-14 09:09 (heure locale de la machine)
- **Branche :** `docs/suites-vague-73`, mise à jour depuis `origin/dev` `f9576f49` (commit de fusion
  `14bcf9f3`)
- **Passe précédente :** [`pass-011-2026-10-08-2221`](../pass-011-2026-10-08-2221/00-summary.md),
  mesurée sur `839be671`
- **Sources lues :** `docs/features.md` (sha1 `291afd30`, 724 lignes) et `docs/models-spec.md`
  (sha1 `0c720866`, 4417 lignes) ; `takussan-api/database/migrations/` (222 fichiers, 13 de plus
  qu'à la passe 011) ; `takussan-api/app/Models/` (10 modèles ajoutés, 6 modifiés).

## Pourquoi une passe 012 six jours après la 011

La passe 011 n'avait pas été fusionnée, et `dev` a reçu entre-temps TCK-633 (crédits d'espace et
boost — ADR-0061 ; référentiel géographique — ADR-0062 ; contacts sur place), TCK-620, TCK-632 et le
rattrapage de TCK-589 : cinq commits sur les deux specs, dix sections nouvelles (§88 à §97), onze
lignes de catalogue ajoutées et treize réécrites. Une passe mesurée sur `839be671` ne décrivait plus
les fichiers qu'elle prétend juger.

## Méthode

Celle de la passe 011, sans changement : `models-spec.md` est jugé **contre les migrations** et
`app/Models/`, jamais contre une intention ; mêmes conventions ✅ / ⚠️ (dérive, ou P3 justifié) / ❌.
Deux mesures conduites en parallèle, puis croisées :

1. **Re-baseline de la passe 011** : chacune de ses 54 recommandations relue à HEAD, avec ses
   nouveaux numéros de ligne (correspondance ligne à ligne entre `839be671` et HEAD, contrôlée sur les
   hunks de `git diff`).
2. **Audit du delta** : chaque ligne ajoutée ou réécrite de `features.md`, chaque section §88-97 et
   chaque colonne ajoutée à une section existante, comparées colonne à colonne aux 13 migrations
   nouvelles et aux modèles.

**Les compteurs se comparent à ceux de la passe 011** — même méthode, mêmes unités — à une réserve
près : deux sections (§4, §10) sont re-jugées, non parce qu'elles ont changé, mais parce que la passe
011 les avait comptées ✅ sans les relire. L'évolution sépare les deux causes.

## Compteurs

| Axe | Unités | ✅ | ⚠️ | ❌ |
|-----|--------|----|----|----|
| Features → Modèles | 379 lignes (60 P0, 168 P1, 112 P2, 39 P3) | 286 | 93 (67 dérives + 26 P3 justifiés) | 0 |
| Modèles → Features | 99 (97 sections + 2 modèles sans section) | 57 | 38 | 4 |
| **Total** | | **343** | **131** | **4** |

**Δ vs passe 011 (328 / 125 / 4) : +15 / +6 / 0.** Décomposition :

- **Delta TCK-633 et suivants** : +11 lignes de catalogue (10 ✅, 1 ⚠️ — l.86) et +10 sections
  (9 ✅, 1 ⚠️ — §96) → **+19 ✅ / +2 ⚠️**.
- **Re-jugements** : §4 `Address` et §10 `Tag` passent ✅ → ⚠️ (faux positifs de la passe 011) ;
  l.74 (P0) suit §4 ; l.456 (P0), réécrite par TCK-632, expose une contrainte fantôme → **−4 ✅ / +4 ⚠️**.
- **Recommandations appliquées : 0** → aucun ⚠️ ni ❌ résolu.

**Onze lignes P0** reposent sur une colonne que la spec n'écrit pas ou écrit fausse — neuf
héritées de la passe 011 (l.76, 91, 117, 210, 245, 425, 426, 500, 520 à HEAD) et deux nouvelles
(l.74, l.456). Détail : `01-correlation-matrix.md`, A.2.

## Top 5 points critiques

1. **❌ Les quatre ❌ de la passe 011 subsistent, mot pour mot.** Le courtier est toujours décrit
   vivant (§36 l.1771, §38 l.1845 — tables supprimées par `2026_10_07_090100_drop_broker_tables`,
   ADR-0030 cité nulle part) ; `AgencyAdminProfile` et `NotificationPreference` n'ont toujours pas de
   section. `AgencyAdminProfile` est désormais **nommé par la ligne P0 réécrite l.426** (auto-création
   de l'espace) : le catalogue cite un modèle que la spec ne décrit pas. → M1, M2, M3.
2. **⚠️ Aucune des 54 recommandations n'a été appliquée, et quatre sont aggravées par le delta.**
   §11 à §87 n'ont pas changé d'un octet depuis la passe 011. TCK-633 a **ajouté** à la spec — huit
   lignes à « Contraintes d'unicité », un bloc au « Résumé des changements » avec ses propres comptes,
   une ligne au catalogue `Capability` — sans corriger ce qui y était faux. La Règle 6 écrit toujours
   « 44 cas » : le code en compte **47**. → M4, M38, M40.
3. **⚠️ §4 `Address` ne décrit pas sa table — et c'est la section que la ligne P0 l.74 sollicite.**
   Quatre colonnes décrites n'existent pas (`address`, `state`, `district`, `building`) ; `label` et
   `region` manquent, alors que le paragraphe « Référentiel » ajouté par TCK-633 nomme `region` ;
   `city`, `country`, `postal_code`, `latitude`, `longitude` ont un type ou un défaut faux
   (`2026_04_17_160003_create_addresses_table`). La passe 011 l'avait comptée ✅ « sans relecture
   colonne à colonne » — la limite qu'elle déclarait a coûté exactement ce qu'elle annonçait. Même
   défaut, moins lourd, sur §10 `Tag`. → M42, M43.
4. **⚠️ La spec se contredit maintenant sur l'unicité des numéros vérifiés, et interdit un compte que
   le produit crée.** TCK-633 décrit juste l'index partiel du numéro **secondaire** (l.4320) ;
   « Contraintes d'unicité » décrit toujours faux celui du **principal** (l.4294, « unique si non
   null » — l'index réel est partiel, sur le numéro canonique vérifié). Et l.4295 écrit un CHECK
   « `username` ou `email` » qu'aucune migration ne crée : la ligne P0 l.456, réécrite par TCK-632,
   décrit précisément le compte ouvert par téléphone, sans l'un ni l'autre. → M23 (amendé), M38.
5. **⚠️ §96 `CreditMovement` promet plus que la base ne tient.** La spec annonce un registre en
   ajout seul, à « deux exceptions structurelles » (cascade, `ON DELETE SET NULL`). La fonction du
   trigger laisse passer toute suppression émise depuis un trigger, et tout `UPDATE` qui met
   `property_boost_id` ou `actor_id` à `NULL` — y compris un `UPDATE` direct
   (`2026_10_12_500200_create_credit_ledger_tables`). Garantie écrite plus forte que la garantie
   réelle, sur un registre d'argent. → M44.

Le reste du delta TCK-633 est **exact** : neuf des dix sections nouvelles sont conformes colonne à
colonne (types, nullabilités, défauts, FK et `onDelete`, CHECK, index, unicités partielles), et chaque
section sert au moins une ligne du catalogue.

## Évolution depuis la passe 011

**Résolus : 0.** Ni ❌, ni ⚠️, ni recommandation.

**Recommandations de la passe 011 :**

| | Appliquées | Partielles | Non appliquées | dont aggravées |
|---|---|---|---|---|
| F1-F13 (`features.md`) | 0 | 0 | 13 | 2 (F2, F5) |
| M1-M41 (`models-spec.md`) | 0 | 0 | 41 | 4 (M4, M23, M38, M40) |

**Constats de la passe 011 corrigés par celle-ci :** M7 (« quatre contraintes CHECK » — huit à HEAD ;
la conclusion, aucune sur `payouts`, tient) ; M34 (citation de `MessageType` décalée de deux lignes) ;
§4 et §10 comptés ✅ à tort.

**Recommandations de cette passe :** 16 à `features.md` (F1-F13 reprises, F14-F16 nouvelles) et 49 à
`models-spec.md` (M1-M41 reprises, M42-M49 nouvelles, M4 et M23 amendées). Les reprises renvoient au
texte intégral de la passe 011, qui reste juste ; seules leurs lignes ont changé.

**La garde `check-models-spec`** est verte (91/91 modèles de premier niveau mentionnés). Elle juge un
nom, jamais une description : elle ne voit aucun des écarts de cette passe, ni `AgencyAdminProfile`
(hors premier niveau). C'est le plancher qu'elle annonce elle-même.

## Statut de convergence

**Rompue.** Quatre ❌ côté modèles, et des recommandations actionnables des deux côtés. La condition
posée par la passe 011 pour qu'une passe suivante ait un sens — **appliquer au moins M1 à M6** — n'est
pas remplie. Elle est reconduite, avec **M42** ajoutée (elle porte une ligne P0). Une passe 013 lancée
avant n'apprendra rien que celle-ci ne dise.

## Limites de cette passe, dites explicitement

- Colonnes relevées par **lecture** des migrations, pas sur une base migrée : une colonne posée par un
  `DB::statement` non lu peut manquer. Aucun test, aucune base, aucun réseau.
- Les sections antérieures à TCK-633 qu'aucune migration n'a touchées depuis leur rédaction restent
  comptées conformes **sans relecture colonne à colonne** — c'est la limite qui a laissé passer §4 et
  §10, et rien ne garantit qu'elles soient les seules. Une passe qui voudrait la lever relit §12, §13,
  §16, §19, §22, §23, §26, §27, §30, §32, §33, §41-44, §46, §47, §50, §51, §54, §56-62, §64, §65,
  §69-87 contre leurs migrations.
- Le comportement décrit en prose par §92-97 (pause et reprise d'un boost, remboursement au prorata,
  rotation des emplacements, ordre de consommation des lots) a été vérifié sur le code pour les points
  cités, pas par exécution.
- Les trois comportements non mesurés de la passe 011 le restent : verrou de compte (l.466),
  acompte « remboursement à traiter » (l.157), motif de suspension d'une agence (l.666).
