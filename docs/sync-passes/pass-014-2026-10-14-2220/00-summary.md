# Passe 014 — Passe différentielle après ADR-0064 et TCK-639/640

- **Date :** 2026-10-14 22:20 (heure locale de la machine)
- **Branche :** `feat/app-absorbe-admin` `c3d56232` — ADR-0064 et TCK-647 → TCK-650, empilée sur
  `feat/ux-mobile-navigation-tck-641-646` (#386). **Non fusionnée.**
- **Passe précédente :** [`pass-013-2026-10-14-1023`](../pass-013-2026-10-14-1023/00-summary.md)
- **Sources lues :** `docs/features.md` (sha1 `3c3c46ff`, 725 lignes, **identique à la passe 013**),
  `docs/models-spec.md` (sha1 `1bc37a5c`, 5124 lignes ; 013 : `a745a8ce`, 5095) ; la base de dev
  migrée, en lecture seule (aucune migration en attente) ; le code touché par TCK-639, TCK-640 et
  TCK-647 → TCK-650.

## Méthode — une passe différentielle, et pourquoi

La passe 013 est la première relecture intégrale (99 sections, 380 lignes), du même jour. Depuis :

- `features.md` n'a **pas changé** (même sha1) ;
- `models-spec.md` n'a changé que par TCK-639 (§93, §94, §96, §97 : index et trigger) et TCK-640
  (§1, §6, §30, §31 et les deux tableaux d'unicité) ;
- le code a changé par ADR-0064 : `/admin` supprimé, l'administration d'agence sous
  `/app/agency/*`, l'éditeur brut des paramètres globaux sous `/super-admin/settings/global`
  (TCK-648), la console au jeton de l'opérateur (TCK-650). Aucune migration.

Cette passe **re-mesure ce qui a bougé**, et seulement cela : les sections modifiées de la spec,
contre la base et les migrations ; chaque ligne du catalogue qui nomme un écran ou une règle touchés
par ADR-0064. Toute autre ligne et toute autre section **reprennent le jugement de la passe 013**,
sans relecture. Les compteurs sont donc comparables à ceux de la 013 (même méthode, mêmes unités).

## Compteurs

| Axe | Unités | ✅ | ⚠️ | ❌ |
|-----|--------|----|----|----|
| Features → Modèles | 380 lignes | 312 | 67 | 1 |
| Modèles → Features | 99 sections | 72 | 27 | 0 |
| **Total** | | **384** | **94** | **1** |

**Δ vs passe 013 (385 / 93 / 1) : −1 / +1 / 0.** Trois mouvements :

- **§96 `CreditMovement` ⚠️ → ✅** — TCK-639 (#378) durcit le trigger et réécrit la section ; la
  prévision de la 013 (« 73 / 26 / 0 côté modèles ») se vérifie.
- **§30 `Setting` ✅ → ⚠️** — depuis TCK-648, la console héberge aussi l'éditeur brut de la table :
  « les clés que la console édite forment un catalogue en code » n'est plus exact (MC1).
- **l.671 (P2) ✅ → ⚠️** — « écrites par une seule voie validée et journalisée » : la route brute
  `/api/settings` écrit toute clé globale hors catalogue, sans journal (FC1). **Le défaut précède
  ADR-0064** — l'éditeur vivait à `/admin/settings` depuis TCK-068 ; la passe 013 l'a compté ✅ sans
  mesurer la route brute. TCK-648 l'a rendu visible en l'installant dans la console.

## Top 5 points critiques

1. **⚠️ l.671 — deux voies d'écriture des paramètres globaux.** Le catalogue
   (`/api/admin/settings`) est validé et journalisé ; la route brute refuse ses clés
   (`managedByCatalogue`, 422) mais accepte **toute autre** clé globale, valeur libre, avec
   `updated_by_id` pour seule trace. Ces clés ne sont lues par aucun code (le catalogue est réduit aux
   clés lues) : le risque est l'illusion d'un réglage, pas un réglage clandestin. → FC1, MC1 —
   décision au porteur : écrire la voie brute, ou la retirer.
2. **❌ inchangé : les notifications push (l.542, P1).** FB1 de la passe 013, non traitée.
3. **⚠️ inchangé : les sept P0 en dérive de la passe 013** (l.426, 427, 456, 458, 537, 643, 663) —
   C1 à C5, non appliquées.
4. **Deux écrans nommés à tort, des deux côtés** : `features.md` l.510 (« Mise en service » sur
   `/admin`) et l.528, `models-spec.md` l.4924 (`/admin/roles`). Sans effet sur le compte : la
   corrélation porte sur les données, pas sur les URL. → FC2, FC3, MC2.
5. **Reliquat de RC2 (§96)** : un `UPDATE` qui ne change aucune valeur passe le trigger à la
   profondeur 1 ; « tout UPDATE … direct lève » ne l'exclut pas. Sans effet. → MC3.

## Évolution depuis la passe 013

| | Passe 013 | Passe 014 |
|---|---|---|
| Features ✅ / ⚠️ / ❌ | 313 / 66 / 1 | **312 / 67 / 1** |
| Modèles ✅ / ⚠️ / ❌ | 72 / 27 / 0 | **72 / 27 / 0** |
| Lignes P0 en dérive | 7 | **7** |
| Recommandations ouvertes | 16 F + 27 actions M | **19 F + 29 actions M** (16 + 3 ; 26 + 3) |

**Résolues depuis la 013 :**

- **C6 (MA9, MB16, RC2)** — §96, par TCK-639 (#378). Reste le reliquat MC3.
- **Les deux « candidats à ticket » signalés hors spec par la 013** — l'unicité d'une clé `settings`
  globale et `User::bookingPayments()` — par TCK-640 : `settings_key_scope_scope_id_unique` et
  `integrations_provider_agency_live_unique` sont `NULLS NOT DISTINCT` en base (mesuré dans
  `pg_indexes`), la relation n'existe plus, §1, §6, §30 et §31 le disent.

**Ouvertes, inchangées :** FB1, FA1-FA7, FB2-FB9 (`features.md` n'a pas bougé) ; C1-C5, C7-C27
(aucune des sections qu'elles visent n'a été modifiée).

## Statut de convergence

**Rompue.** Un ❌ côté catalogue (l.542) et des recommandations actionnables des deux côtés. La
convergence demande, en plus des trois points de la passe 013 (dont le premier, la fusion de #378, est
fait) : la décision FC1 sur la voie brute des paramètres globaux.

## Limites de cette passe, dites explicitement

- **Différentielle** : sept lignes et huit sections re-mesurées ; les 373 autres lignes et 91 autres
  sections reprennent le jugement de la 013 sans relecture. Une erreur de la 013 hors de ce périmètre y reste — la l.671 en est un exemple, trouvé
  parce qu'ADR-0064 y menait.
- **Mesurée sur une branche non fusionnée** (#386 et cette branche). Si leur revue déplace un écran ou
  la route brute, re-mesurer FC1-FC3, MC1, MC2.
- Le trigger de §96 est lu dans la migration appliquée (`2026_10_14_100000`), pas dans `pg_proc`.
