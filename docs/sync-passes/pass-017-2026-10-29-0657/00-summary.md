# Passe 017 — Passe différentielle après le Radar, lots 1 à 3 (ADR-0077, TCK-2386 → TCK-2388)

- **Date :** 2026-10-29 06:57 (heure locale de la machine)
- **Branche :** `docs/sync-specs-radar`, partie de `dev` `544bf34d4` (fusion de #1577, TCK-2388).
- **Passe précédente :** [`pass-016-2026-10-27-1455`](../pass-016-2026-10-27-1455/00-summary.md) (commit `7b5240327`, fusionné par #1573).
- **Sources lues :**
  - `docs/features.md` : sha1 `22abd00a`, 828 lignes, **413 lignes de fonctionnalité** (016 : `6c7fa86e`, 816 lignes, 412) ;
  - `docs/models-spec.md` : sha1 `83c18642`, 5823 lignes, **111 sections** (016 : `e5711a1d`, 5535, 106) ;
  - les **8 migrations** ajoutées depuis la passe 016, toutes du Radar, lues dans le code (pas en base) ;
  - le code du Radar (`App\Models\Radar*`, `App\Models\Enums\Radar*`, `App\Services\Radar\*`,
    `config/radar.php`) et les tickets TCK-2386 → TCK-2395.

## Méthode — différentielle, comme la 014, la 015 et la 016

Depuis la passe 016, en deux jours, trois PR du Radar sont fusionnées (#1574, #1575, #1577), plus
le commit `0e6e3dd12`, qui applique les recommandations de la 016 :

- **`features.md`** a reçu une ligne (§1.5, l.223) et en a modifié sept (l.221, 233, 234, 284, 518,
  684, 752), plus deux passages de prose : la règle du contenu externe (§2.11) et six règles neuves du
  Radar (§2.12). Les 14 lignes du Radar ne changent pas de texte, mais trois de leurs tickets sont
  `done`.
- **`models-spec.md`** a reçu cinq sections (§107 `PayoutClawback`, §108 → §111 le Radar), quatre
  lignes d'enum et un paquet (`laravel/ai`). Seize sections, la Règle 1 et le tableau des unicités
  sont retouchés par `0e6e3dd12`.
- **Le code** a reçu 8 migrations. **Toutes touchent le schéma, et toutes ont leur trace dans la
  spec (8 sur 8).** Les quatorze migrations que la 016 trouvait sans trace y sont toutes désormais.

Cette passe re-mesure ces unités, et seulement elles. Toute autre unité garde le jugement de la passe
016 (donc de la 013, 014 et 015), sans relecture. Les compteurs restent comparables.

**Le Radar (§2.12) est re-classé ligne à ligne.** Six lignes sont livrées (TCK-2386 → TCK-2388
`done`) et passent ✅. Les huit autres restent ⚠️ justifiées : leurs tickets (TCK-2389 → TCK-2395)
sont `todo`, et la règle d'ADR-0077 (la section `models-spec.md` dans la PR du modèle) a été tenue
par les trois lots livrés.

## Compteurs

| Axe | Unités | ✅ | ⚠️ | ❌ |
|-----|--------|----|----|----|
| Features → Modèles | 413 lignes | 340 | 72 | 1 |
| Modèles → Features | 111 sections | 88 | 23 | 0 |
| **Total** | | **428** | **95** | **1** |

**Δ vs passe 016 (405 / 112 / 1) : +23 / −17 / 0.** Les mouvements :

- **Features :**
  - sept lignes passent de ⚠️ à ✅ : l.752 (FE1 appliquée) et six lignes du Radar (l.778 → 783) ;
  - une ligne neuve, ✅ : l.223 (reprise au bailleur, FE4) ;
  - les lignes modifiées l.221, 233, 284, 518 et 684 restent ✅ ; l.234 reste ⚠️ (C13) ;
  - le ❌ reste : les notifications push (l.560, ex-l.559).
- **Modèles :**
  - **treize sections passent de ⚠️ à ✅** : §11, §15, §27, §28, §45, §48, §69, §86, §90, §91, §104,
    §105, §106 (ME1 → ME15, et C10 par ME6) ;
  - §3 et §41 restent ⚠️ : C19 et C13 (013) ne sont pas appliquées ;
  - cinq neuves : §107 et §111 ✅ ; §108, §109, §110 ⚠️ (mineur).
  - Aucune section ne se dégrade.

## Top 5 points critiques

1. **§108 et §109 disent au présent une purge qui n'existe pas.** « Après un STOP, `phone` est
   purgé », `phone` « null une fois purgé (STOP) », `raw_text` « purgé à `purge_at` ou dès un STOP ».
   Aucun code n'efface quoi que ce soit : `RadarConsentWorkflow::stop()` le dit lui-même (« Rien
   n'est purgé ici », c'est le rôle de TCK-2391, `todo`), et aucun job ne lit `purge_at`. Ces lignes
   portent sur des données personnelles : un lecteur conclurait que la conformité est en place.
   → MF1.
2. **Une règle du Radar est démentie par le code livré.** `features.md` §2.12 dit : « Les photos ne
   sont téléchargées qu'à la publication ». Or, depuis TCK-2387, `SourcePhotoFingerprinter` télécharge
   chaque photo source pour en calculer l'empreinte dHash. Il la jette aussitôt, sans rien écrire. La
   règle vise la conservation, pas le téléchargement. → FF1.
3. **L'inventaire des enums a douze trous, tous de la semaine.** Il manque les six `Ai*` (socle IA)
   et six des dix `Radar*` : `RadarAdvertiserNature`, `RadarListingStage`, `RadarSourceKind`,
   `RadarSourceSite`, `RadarDiscardReason`, `RadarConfidence`. TCK-2388 a écrit ses quatre enums,
   TCK-2386 et TCK-2387 non. → MF4.
4. **Huit lignes du Radar restent ⚠️ justifiées.** La règle centrale (« aucun bien n'entre au
   catalogue sans un accord confirmé ; l'API le refuse ») n'a pas encore de geste qui l'exerce : elle
   attend TCK-2389. La l.786 (retrait de l'accord) est livrée à moitié :
   - livré : le STOP passe l'annonceur « ne plus contacter » et révoque ses accords (TCK-2388) ;
   - pas livré : le retrait du public (TCK-2391).

   Le classement tient tant que ces tickets restent ouverts. Une PR qui les fusionne sans sa section
   ferait passer la ligne ❌.
5. **❌ inchangé : les notifications push (l.560, P1).** FB1 (013) reste hors des lots, à la demande
   du porteur.

## Évolution depuis la passe 016

| | Passe 016 | Passe 017 |
|---|---|---|
| Features ✅ / ⚠️ / ❌ | 332 / 79 / 1 | **340 / 72 / 1** |
| Modèles ✅ / ⚠️ / ❌ | 73 / 33 / 0 | **88 / 23 / 0** |
| Recommandations ouvertes | 19 F + 36 actions M | **15 F + 25 actions M** (14 reprises + FF1 ; 20 reprises + MF1 → MF5) |

**Résolues depuis la 016 (toutes par `0e6e3dd12`, vérifiées une à une dans les fichiers source) :**

- **Côté catalogue** : FE1 (alternative (a), l.752), FE2 (§2.11), FE3 (l.284), FE4 (l.221 et l.223,
  sans le « soldée à la main » non livré : c'est juste), FE5 (l.233, 234, 518, 684).
- **Côté spec** : ME1 → ME15. C10 (013) est soldée avec ME6 : relations réelles, aucun média, aucun
  accesseur. La part de C17 visée par ME13 (Règle 1) l'est aussi.

**Ouvertes, inchangées :**

- côté catalogue : FB1, FA2, FA4 → FA7, FB2 → FB7, FB9 (013), FD2 (015) ;
- côté spec : C7, C8, C9 (partielle), C11 → C15, C17 (partielle : Règles 2 et 4), C18 → C27 (013),
  MC3 (014). **C13 est la plus ancienne qui coûte encore un ⚠️ au catalogue** (l.232, l.234) : §41
  écrit toujours deux cibles de rapprochement, alors que le code en a quatre.

**Nouvelles :** FF1 ; MF1 → MF5.

## Statut de convergence

**Rompue.** Un ❌ reste côté catalogue (l.560), et des recommandations actionnables restent des deux
côtés. Les nouvelles sont **toutes factuelles et de priorité basse ou moyenne** ; aucune ne demande de
décision.

**Le défaut que mesuraient la 015 et la 016 ne s'est pas reproduit.** Les huit migrations du Radar ont
leur trace dans la spec, y compris les trois qui **ajoutent des colonnes** à une table existante
(`2026_10_27_210000`, `2026_10_27_210100`, `2026_10_28_100000`). C'était le cas que la 016 désignait
comme le trou. La garde proposée par la 016 n'existe toujours pas (aucune `scripts/check-*.mjs` ne lit
les migrations). Sa raison tient, mais son urgence baisse : c'est la discipline des tickets du Radar
qui a tenu, pas une garde.

Le défaut qui reste est d'une autre nature : **la spec dit au présent ce qui est décidé** (MF1, comme
ME3 et C23 avant elle). Une section écrite dans la PR du modèle décrit aussi les gestes que les
tickets suivants doivent livrer.

## Limites de cette passe, dites explicitement

- **Différentielle** :
  - 22 lignes et 21 sections re-mesurées, plus la prose de §2.11 et §2.12 et quatre blocs transversaux ;
  - les 391 autres lignes et les 90 autres sections gardent le jugement de la 016 sans relecture.
- Les migrations sont lues dans leur code, **pas en base**.
- Les comportements du Radar (capture, extraction, relecture, démarchage, prise en charge, STOP) sont
  lus dans le code et les tickets. Ils ne sont pas rejoués.
- Les reprises (FB*, FA*, C*) ne sont pas re-mesurées : elles sont dites ouvertes parce que le diff
  ne touche pas leurs passages. Seules C10, C13, C17 et C19 sont relues, parce que des passages
  voisins ont bougé.
