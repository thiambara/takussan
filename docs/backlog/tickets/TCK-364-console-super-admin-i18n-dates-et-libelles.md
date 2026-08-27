---
id: TCK-364
title: "Console super-admin — dates et libellés techniques localisés (fr / en / wo)"
status: done
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-26
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, i18n, super-admin]
---

## Objectif utilisateur

Un super-admin qui bascule la console en anglais ou en wolof lit des dates et des libellés dans sa langue — pas des dates françaises et des mots anglais codés en dur.

## Contrat de données

- Ticket purement frontend. L'API émet des codes ; les libellés appartiennent au front (principe non négociable n°5 du dépôt).

## Direction UX / Artistique

Relevé du 2026-08-26 sur la console :

| Constat | Volume |
|---|---|
| `toLocaleString('fr-FR')` / `Intl.*('fr-FR')` codés en dur | **18 occurrences, 13 fichiers** — les dates restent françaises en `en` et en `wo` |
| Libellés de sondes non traduits dans `system-health.tsx` | `DB`, `Cache`, `Storage`, `Mail`, `SMS` — écrits dans un tableau de constantes |
| Statuts affichés bruts | `status?.status` rend `ok` / `error` tels que l'API les émet |

Le patron du dépôt pour ce cas est établi : **la donnée porte la clé, le rendu la résout** (TCK-286) — une table de constantes hors composant transporte une clé de traduction, jamais un libellé.

## Contraintes strictes (métier)

- La locale de formatage vient de next-intl, jamais d'une chaîne littérale.
- Les valeurs qui sont des **jetons d'API ou d'URL** (`pending`, `-reported_at`, `__all__`…) ne se traduisent pas : seuls leurs libellés d'affichage le sont.
- Les trois dictionnaires (`fr`, `en`, `wo`) sont complétés ensemble — une clé ajoutée à un seul est une régression silencieuse.
- La frontière de dictionnaire de `(super-admin)/super-admin` est cumulée et gardée : toute nouvelle clé doit rester dans son périmètre.

## Delta à produire

- [x] Remplacement des 18 formatages `'fr-FR'` par un formatage piloté par la locale active (utilitaire partagé plutôt que 18 appels dispersés)
  - **24 sites, puis 33.** 18 en `'fr-FR'`, plus 6 que le grep du ticket ne voyait pas (4 en `'fr-SN'`, 2 en `toLocaleString()` **nu**, qui suivaient la locale du *runtime*) ; plus 9 autres, dans `components/billing` et `components/kyc`, trouvés par la revue et corrigés après elle (cf. plus bas).
- [x] `system-health.tsx` : libellés de sondes portés par clé, statuts `ok` / `error` traduits
- [x] Complément des trois dictionnaires `fr` / `en` / `wo`
- [x] Tests : rendu d'une date et d'un statut de sonde dans les trois locales

## Critères d'acceptation

- [x] AC1 — `grep -rn "'fr-FR'" takussan-web/src/app/\(super-admin\) takussan-web/src/components/admin/super takussan-web/src/components/super-admin` (hors tests) ne renvoie aucun résultat
  - ⚠ **la lettre du grep rend aujourd'hui 7 lignes, toutes en COMMENTAIRE** (`failed-jobs.tsx`, `kyc-queue.tsx` ×4, `ImpersonationBanner.tsx`, `ConsoleRecentActivity.tsx`), déposées après coup par TCK-360/362/365 pour raconter ce qui a été évité. **Aucun littéral vivant.** La preuve exécutée qui vaut est la garde : `node scripts/check-locale-figee.mjs` → **exit 0**, et elle dépouille réellement les commentaires depuis le correctif de la revue.
  - l'AC ne voyait de toute façon pas tout le défaut : il ne cherchait ni `'fr-SN'`, ni `toLocaleString()` nu, ni les écrans que la console monte hors de ces trois répertoires.
- [x] AC2 — aucun libellé affiché de `system-health.tsx` n'est une chaîne littérale : les cinq sondes et les statuts passent par une clé
- [x] AC3 — un test rend la même date dans les trois locales et **obtient trois chaînes différentes** (un test qui ne vérifie que `fr` cocherait aussi le comportement actuel)
  - ⚠ **limite d'environnement, non levée** : le rendu wolof n'est prouvé que sur un runtime à ICU complet (Node v24.18.0, `supportedLocalesOf(['wo']) → ['wo']`). Sur un runtime sans `wo`, le repli `['wo','fr-SN']` rendrait le wolof strictement identique au français — le premier cas du fichier de test **mesure** ce préalable et rougirait nommément, mais en CI Node seulement, jamais chez l'utilisateur.
  - hors AC, à savoir : `toCurrencyLocale('wo')` rend `'fr-SN'`. Les **montants** sont donc identiques en `wo` et en `fr` ; le test n'assère trois chaînes distinctes que sur la date et le nombre.
- [x] AC4 — les trois dictionnaires portent exactement le même ensemble de clés
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
  - **décochée après relecture.** `npx tsc --noEmit` (0 erreur) est exécuté et rejoué par la revue ; `npm run lint` était à 0 erreur / 36 avertissements, chiffre identique au baseline pris par `git stash` sur le même arbre. `npm run test` **en entier** ne l'a été par personne — rituel de fin de branche de la session. Joué à la place : 42 fichiers ciblés (implémenteur), 238 tests (revue).

## Hors périmètre

- L'i18n du reste du dépôt (dette D-24 : 82 fichiers sur 875).
- Les fuseaux horaires par utilisateur.
- La traduction des contenus saisis par les utilisateurs.

## Notes d'implémentation

**Trois affirmations du ticket ont été contredites par la mesure du 2026-08-27.**

1. **L'utilitaire partagé existait déjà.** `src/lib/format.ts` (`formatDate`, `formatDateTime`,
   `formatNumber`, `formatCurrency`) est piloté par la locale depuis toujours et n'était appelé
   nulle part par la console. La cause du défaut n'est donc pas son absence, c'est qu'il **exige
   une locale en argument** : les 18 sites étaient des fonctions module-level (`function
   formatDate(value)`) qui n'en ont pas, et l'auteur écrivait `'fr-FR'`. Le delta est
   `src/lib/format/useFormatteurs.ts` — un hook qui supprime l'argument — et non un utilitaire neuf.

2. **L'API émet `ok` | `failed`, pas `ok` | `error`.** `HealthcheckService::check()` et le type
   `HealthcheckStatus` sont d'accord ; `error` est le **champ voisin** qui porte le message. Les
   clés sont donc `status.ok` / `status.failed` (+ `status.loading` pour la sonde pas encore
   résolue, qui n'a aucun statut).

3. **Le grep de l'AC1 ne voyait pas tout le défaut : 6 occurrences de plus, dans 5 fichiers**,
   échappaient à `'fr-FR'` — 4 en `'fr-SN'` (`maintenance.tsx` ×2, `integrations.tsx`,
   `platform-settings.tsx`), un littéral français tout autant, et **2 en `toLocaleString()` NU**
   (`ImpersonationBanner.tsx`, `CrossTenantAuditTable.tsx`), qui suivaient la locale du **runtime**
   et non celle de l'application. Corrigées avec les 18 : l'objectif utilisateur du ticket n'est pas
   tenu tant qu'elles restent, et l'AC1 aurait été verte quand même.

**Le piège payé, et pourquoi il ne se voit pas au typage.** `formatDate` de `@/lib/format` pose
`dateStyle: 'medium'` en défaut **puis** étale les options de l'appelant : lui passer
`{ day, month, year }` produit `{ dateStyle, day, month, year }`, combinaison que la norme interdit
(`TypeError: Invalid option : option`), à l'exécution seulement — les deux formes partagent le type
`Intl.DateTimeFormatOptions`. `sansStyleParDefaut()` l'annule par un `dateStyle: undefined`
explicite, traité comme absent par `GetOption` (mesuré). Le test de régression est dans
`src/lib/format/__tests__/useFormatteurs.test.tsx`.

**Sur le wolof.** Le docblock de `src/lib/format.ts` affirme que `wo` n'est pas servi par CLDR ;
c'est faux sur Node v24.18.0, qui le résout et rend `14 Mar, 2026` là où `fr-SN` rend
`14 mars 2026`. L'AC3 tient donc — et le premier cas du fichier de test **mesure** ce préalable
plutôt que d'en dépendre en silence : si un runtime futur replie `wo` sur la racine, c'est lui qui
rougit, nommément, au lieu des quatre autres en cascade.

**Vérifié par ablation** (rétablir `'fr-FR'` + le statut brut + le libellé de sonde brut) :
6 des 12 cas rougissent, dont les 3 qui portent l'AC3. Une première version du cas « aucun jeton
d'API affiché » restait verte sous ablation — elle assertait l'absence **avant** que la requête ne
résolve, quand rien n'est encore rendu. Corrigé : on attend qu'une sonde soit à l'écran, puis on
vérifie qu'aucun jeton n'est monté avec elle.

**Hors périmètre, laissé en place :** `maintenance.tsx` affiche `status.window.messages.fr` en dur.
C'est du **contenu saisi par l'utilisateur** (la charge porte `{ fr, en?, wo? }`), explicitement
exclu par le ticket.

### Ce que la revue adverse a trouvé, et ce qui a été corrigé (2026-08-27)

La revue a **refusé**, et son motif mérite d'être gardé : *« AC1-AC5 sont vrais tels qu'ils sont
ÉCRITS »* — mais l'objectif utilisateur ne l'était pas. **Les sept défauts sont corrigés**, prouvés
par 23 mutations de code et 9 mutations de la garde, toutes attrapées.

- **Neuf `'fr-FR'` vivants que la console rend réellement, hors des répertoires gardés.** Un
  super-admin en `en` ou en `wo` lisait `15/01/2026` et `150 000 F CFA` sur `/super-admin/payouts`,
  `/super-admin/plans` et l'onglet abonnement + KYC de `agencies/[id]` — **après** le ticket. La
  chaîne de rendu a été vérifiée fichier par fichier, pas supposée. *C'est le motif « des AC qui
  acceptent le mauvais correctif », au niveau du **périmètre** au lieu de l'assertion.* Corrigés sur
  `useFormatteurs()`, ce qui profite aussi à la console agence, qui monte les mêmes composants.
- **Le cliquet ne voyait pas la récidive qu'il existe pour refuser** : 8 formes sur 17 lui
  échappaient. La plus banale de toutes — **une multiplication** — suffisait à le faire taire :
  son heuristique « ce match est dans un commentaire » cherchait un `*` n'importe où avant le match,
  si bien que `(p * 100).toLocaleString('fr-FR')` sortait en **0** quand `(p + 100)` sortait en 1.
  Elle masquait déjà **deux littéraux vivants** dans l'arbre (`LineChart.tsx:56`, `BarChart.tsx:45`).
  Remplacée par un dépouillement réel des commentaires (automate à six états qui conserve les
  offsets, littéraux d'expression régulière compris). `CONTROLE_B` tient enfin la promesse de son
  docblock : le formateur appelé **sans locale** ou avec `undefined` explicite est refusé.
- **Le docblock de la garde affirmait une propriété que son code n'avait pas** (« le périmètre
  n'est pas un répertoire de routes, c'est ce que l'écran monte »). Elle calcule désormais
  réellement la **clôture des imports** depuis `src/app/(super-admin)/**`, avec **trois** comptes :
  le périmètre exigé à zéro (0 sur 88 fichiers), ce que la console rend sans qu'un périmètre le
  couvre (**cliquet à 1**), et le reste du dépôt (**plafond 50**, contre 57 — la décomposition est
  dans le fichier). Six trous sont déclarés au lieu de trois.
- **L'auto-épreuve ne gardait que les regex** : retirer un répertoire de `PERIMETRES` sortait en 0,
  en silence. Elle garde maintenant les **trois** façons de désarmer la garde — motifs, périmètre
  (sept fichiers témoins) et plafonds, qui sont des **planchers autant que des plafonds** : une
  hausse de plafond est immédiatement rouge.
- **AC2 se lisait plus fort que ce qui était livré** : l'indice de chaque sonde affichait un message
  d'exception brut, un jeton d'API nu (`log`, `redis`, `s3`) et un `ms` littéral. Le **cadre** de
  l'indice passe par clé et la latence par `fmt.nombre`. Le **corps** de `error` reste tel quel, et
  c'est motivé : l'API envoie un message, pas un code — le principe n°5 suppose l'inverse, et le
  fermer est un delta d'API.

**Ce qui reste ouvert :** `lib/format/currency.ts` fige `'fr-SN'` dans un **paramètre par défaut**,
forme qu'aucune garde ne voit (trou T3, déclaré) ; le fermer est un delta de `@/lib/format`. Et
`maintenance.tsx` affiche `status.window.messages.fr` en dur — du contenu saisi par l'utilisateur,
explicitement hors périmètre.
