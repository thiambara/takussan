---
id: TCK-364
title: "Console super-admin — dates et libellés techniques localisés (fr / en / wo)"
status: todo
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-26
updated: 2026-08-26
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
- [x] `system-health.tsx` : libellés de sondes portés par clé, statuts `ok` / `error` traduits
- [x] Complément des trois dictionnaires `fr` / `en` / `wo`
- [x] Tests : rendu d'une date et d'un statut de sonde dans les trois locales

## Critères d'acceptation

- [x] AC1 — `grep -rn "'fr-FR'" takussan-web/src/app/\(super-admin\) takussan-web/src/components/admin/super takussan-web/src/components/super-admin` (hors tests) ne renvoie aucun résultat
- [x] AC2 — aucun libellé affiché de `system-health.tsx` n'est une chaîne littérale : les cinq sondes et les statuts passent par une clé
- [x] AC3 — un test rend la même date dans les trois locales et **obtient trois chaînes différentes** (un test qui ne vérifie que `fr` cocherait aussi le comportement actuel)
- [x] AC4 — les trois dictionnaires portent exactement le même ensemble de clés
- [x] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

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
