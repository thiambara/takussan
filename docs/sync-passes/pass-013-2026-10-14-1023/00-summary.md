# Passe 013 — Zéro ❌ côté modèles, et la première relecture intégrale

- **Date :** 2026-10-14 10:23 (heure locale de la machine)
- **Branche :** `docs/sync-pass-013`, sur `docs/convergence-specs-lot-3` `b3793a0a` — qui cumule les
  trois lots de convergence appliqués après la passe 012 (#379, #380, #381, empilées, non encore
  fusionnées sur `dev`).
- **Passe précédente :** [`pass-012-2026-10-14-0909`](../pass-012-2026-10-14-0909/00-summary.md)
- **Sources lues :** `docs/features.md` (sha1 `3c3c46ff`, 725 lignes), `docs/models-spec.md`
  (sha1 `a745a8ce`, 5095 lignes, 99 sections) ; la base de dev migrée, en lecture seule (les 222
  migrations du dépôt, plus 5 du paquet `lemonsqueezy/laravel`) ; `takussan-api/app/Models/` et le code
  qui écrit les données rangées hors colonne.

## Méthode — ce qui change

La passe 012 avait levé deux faux positifs (§4, §10) et dit sa limite : « les sections qu'aucune
migration n'a touchées restent comptées conformes sans relecture colonne à colonne ». **Cette passe
lève la limite** : les 99 sections sont relues contre `\d <table>` de la base, leurs index, leurs
contraintes et leur modèle, et chaque ligne du catalogue est jugée sur les colonnes qu'elle met en jeu.
Les données que le code range hors de toute colonne décrite (`metadata`, `settings`, journal, cache)
sont mesurées, et comptées ⚠️ quand la spec ne dit pas où elles vivent.

Conséquence : **les compteurs sont plus sévères que ceux de la 012 à état égal.** Le Δ ci-dessous en
sépare les deux causes — ce que les lots ont corrigé, et ce que la relecture a découvert.

Cinq relevés indépendants (§1-§33, §34-§66, §67-§99 et transversal ; catalogue §1.1-§1.6 et
§1.7-§2.10), croisés ; leurs recommandations sont consolidées en `03-…` (27 actions) et `02-…`.

## Compteurs

| Axe | Unités | ✅ | ⚠️ | ❌ |
|-----|--------|----|----|----|
| Features → Modèles | 380 lignes (60 P0, 172 P1, 112 P2, 36 P3) | 313 | 66 (41 dérives + 25 P3 justifiés) | 1 |
| Modèles → Features | 99 sections (aucun modèle du code sans section) | 72 | 27 | 0 |
| **Total** | | **385** | **93** | **1** |

**Δ vs passe 012 (343 / 131 / 4) : +42 / −38 / −3.**

- **Corrigé par les lots 1 à 3** : les quatre ❌ côté modèles (courtier, `AgencyAdminProfile`,
  `NotificationPreference`) ; 30 dérives du catalogue sur §1.1-§1.6 et 22 sur §1.7-§2.10 ; 18 sections
  sur §1-§33, 13 sur §34-§66, et §67, §68 sur la fin de la spec. **M1 à M49 sont appliquées**, sauf M44
  (§96), que porte TCK-639.
- **Découvert par la relecture intégrale** : 19 sections que la 012 comptait ✅ ne décrivent pas
  exactement leur table — quatorze sur une colonne, une contrainte ou une relation (§12, §13, §22, §27,
  §32, §33, §41, §42, §44, §46, §47, §50, §51, §61), cinq sur un index omis (§72, §74, §75, §81, §82) ; 26 lignes du catalogue reposent sur une donnée rangée hors colonne ou sur
  une section fausse ; **une ligne P1 n'a aucun support** (l.542, push web et mobile).

**Avec #378 (TCK-639) fusionnée**, §96 devient conforme : 73 / 26 / 0 côté modèles.

**Sept lignes P0 en dérive** : l.426, 427, 456, 458, 537, 643, 663. Deux l'étaient déjà à la 012
(suspension d'adhésion, auto-création de l'espace), pour une autre cause que celle d'aujourd'hui ; les
cinq autres sont nées de la relecture. Aucune dans §1.1-§1.6 : les six P0 qui y étaient en dérive à la 012 sont résolues.

## Top 5 points critiques

1. **❌ La seule absence de support du catalogue : les notifications push (l.542, P1).** Aucun
   abonnement de navigateur ni jeton d'appareil n'est stocké, aucun paquet ni transport n'est
   provisionné ; le canal `push` du résolveur de préférences n'est offert que si la diffusion n'est pas
   à `log` — elle l'est partout (D-65). Seuls existent l'interrupteur `users.notifications_push_enabled`
   et la case `push` de §99. Les passes 011 et 012 la comptaient ✅ sans mesurer le transport. → FB1.
2. **⚠️ §12 `AppNotification` ne décrit pas sa table, et elle porte la P0 l.537.** Sept colonnes
   décrites n'existent pas (`content`, `is_actioned`, `delivered`, `metadata`, `deleted_at`…), cinq
   réelles manquent (`body`, `data`, `sent_at`, `delivery_attempts`, `digested_at`), les scopes et
   méthodes décrits n'existent pas. Comptée ✅ par la 012. → C1.
3. **⚠️ §1 `User` écrit nullables des colonnes NOT NULL — et la P0 du téléphone en dépend.**
   `status`, `first_name`, `last_name` sont NOT NULL en base ; `preferred_language` est `varchar(10)`
   NOT NULL. L'inscription par téléphone écrit donc `''` faute de pouvoir écrire `null`. Le verrou de
   compte (l.467, jamais mesuré par les passes précédentes) vit dans `users.metadata` et en cache, sans
   une ligne de spec. → C2.
4. **⚠️ La suspension d'adhésion (P0 l.426) est décrite comme un geste de plateforme.** §98 réserve
   `suspended` à la modération plateforme ; c'est l'admin d'agence qui le pose (TCK-587), et un bailleur
   suspendu passe en `blocked`, que §34 ne qualifie pas. → C3.
5. **⚠️ Les données hors colonne : `agencies.settings` et les `metadata` des profils.** §2 dit
   `settings` « remplacé en entier » (faux depuis TCK-593 : fusion clé par clé) et ne nomme aucune des
   clés que le code lit — dont `primary_city` (P0 l.427) et `require_team_two_factor` ; le motif d'une
   suspension d'agence ne vit que dans le journal ; le KYC d'un profil n'est pas un `KycDossier`
   (§42 le dit) mais des `Document` et un miroir `metadata.kyc`. → C4, C8.

## Évolution depuis la passe 012

| | Passe 012 | Passe 013 |
|---|---|---|
| Features ✅ / ⚠️ / ❌ | 286 / 93 / 0 | **313 / 66 / 1** |
| Modèles ✅ / ⚠️ / ❌ | 57 / 38 / 4 | **72 / 27 / 0** |
| Lignes P0 en dérive | 11 | **7** (9 des 11 de la 012 résolues) |
| Recommandations ouvertes | 16 F + 49 M | **16 F + 27 actions M** |

**Recommandations de la passe 012 :** F1-F16 appliquées sauf **F4** (reprise en FA1, troisième passe)
et **F11** (non appliquée, la mesure la contredit — décision au porteur) ; M1-M49 appliquées sauf
**M44**, portée par TCK-639 (#378).

**La garde `check-models-spec`** reste verte (91/91 modèles de premier niveau). La relecture montre ce
qu'elle ne voit pas : dix-neuf sections nommées, donc vertes, ne décrivaient pas exactement leur table.

## Statut de convergence

**Rompue, mais pour la première fois depuis la passe 008 sans ❌ côté modèles.** Il reste un ❌ côté
catalogue (l.542), et des recommandations actionnables des deux côtés. La convergence demande :

1. la fusion de #378 (§96) et des lots #379 → #381 ;
2. la décision sur l.542 (FB1 : reclasser, ou ouvrir un ticket) ;
3. les actions C1 à C5, qui portent les sept P0 en dérive.

Une passe 014 n'a de sens qu'après ces trois points.

## Limites de cette passe, dites explicitement

- **Mesure sur une branche non fusionnée** : les lots 1 à 3 sont en revue (#379-#381). Si une revue
  les modifie, cette passe décrit l'état d'avant.
- Base de dev **lue**, non rejouée : un comportement (création d'une tâche de remboursement, fusion de
  `settings`, rapprochement d'un `Payout`) est lu dans le code, pas exécuté.
- La comparaison automatique de nullabilité ignore `created_at` / `updated_at` et quelques colonnes
  groupées, vérifiées à la main. Les défauts n'ont été comparés à la main que sur les colonnes que les
  lignes sollicitent.
- Les ancres de la table des matières ont été calculées avec `github-slugger` 2.0.0, la bibliothèque
  de GitHub, sur les titres de §12 et §13 : un titre en ✏️ garde U+FE0F dans son ancre (C22).
