---
id: TCK-327
title: "Trois formats de date sur la même API — 55 `toISOString`, 37 `toIso8601String`, 18 `toDateString`"
status: done
phase: P2
family: technique
estimate: M
wave: 39
created: 2026-08-17
updated: 2026-08-22
depends_on: [TCK-308]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, front, api, resource, contrat, serialisation, convention, dette]
---

## Objectif utilisateur

Qu'une date se lise de la même façon d'un endpoint à l'autre — pour que le front n'ait pas à
connaître, champ par champ, laquelle des trois formes il va recevoir.

## Contrat de données

Aucun modèle nouveau, **et c'est un changement de contrat d'API, pas un nettoyage.**

**Mesuré le 2026-08-17** dans les 45 fichiers de `app/Http/Resources/`, en soldant
[TCK-308](TCK-308-baseresource-adoptee-par-7-sur-44.md). Les formes rendues ont été **vérifiées en
exécutant Carbon**, pas déduites de leur nom :

| Forme appelée | Occurrences | Chaîne émise |
|---|---|---|
| `toISOString()` | **55** | `2026-08-17T12:34:56.000000Z` |
| `toIso8601String()` | **37** | `2026-08-17T12:34:56+00:00` |
| `toDateString()` | **18** | `2026-08-17` |

`BaseResource::iso()` (`format(DateTimeInterface::ATOM)`) rend la **deuxième** forme. Les trois
cohabitent parfois dans le **même fichier**.

Deux écarts, pas un : `toISOString()` diffère de `iso()` par les **microsecondes** *et* par le
suffixe (`Z` contre `+00:00`). Sur un `Carbon` non-UTC, `toISOString()` convertit vers UTC quand
`format(ATOM)` conserve le décalage local — `config/app.php` déclare `'timezone' => 'UTC'`, donc
l'écart d'instant ne se manifeste pas aujourd'hui, **mais il n'est pas fermé par le code**, il l'est
par une valeur de configuration.

**Ce que TCK-308 a livré, et ce qu'il n'a pas livré.** Son *Objectif utilisateur* visait « qu'une
date […] se sérialise de la même façon sur toute l'API ». Il a livré l'**héritage** — les 44
ressources étendent `BaseResource`, donc `iso()` est disponible partout — et **pas l'emploi**. La
migration a été un échange de parent, deux lignes par fichier, précisément pour ne changer aucune
sortie. `scripts/check-resources-extend-base.mjs` écrit cette limite dans sa propre sortie.
Consigné en **ardoise D-36bis**.

**Ne pas confondre avec [TCK-153](TCK-153-formats-devise-date-harmonises.md) (`done`)**, qui traite
le format d'**affichage** côté front (`Intl.DateTimeFormat('fr-FR', …)`, `13 mai 2026`). Ce
ticket-ci traite la chaîne **sur le fil**, avant tout affichage. Les deux couches sont
indépendantes, et les confondre ferait chercher le défaut au mauvais endroit.

## Contraintes strictes (métier)

- **C'est une rupture de contrat, et rien ne la signalerait.** Converger changerait la valeur émise
  pour **73 champs** (55 + 18) sans qu'aucun test backend, aucun typage TypeScript ni aucun lint du
  front ne rougisse : les trois formes sont des `string` valides et `new Date(…)` les parse toutes.
  **L'inventaire des appelants front précède la conversion — pas un `sed`.**
- **Le format retenu est une DÉCISION, à écrire avant d'implémenter.** Trois candidats, et aucun
  n'est neutre : `toIso8601String()`/`iso()` (aligné sur `BaseResource`, mais 73 champs à changer),
  `toISOString()` (majoritaire à 55, mais `iso()` devrait alors changer de définition et les 8
  ressources qui l'emploient déjà changeraient de sortie), ou un format **nouveau**. Le dépôt exige
  qu'une décision structurelle s'écrive en **ADR AVANT l'implémentation** (`docs/adr/`).
- **`toDateString()` n'est pas du même ordre** : une date sans heure porte une intention métier
  (`due_date`, `date de fin de bail`). La convertir en horodatage complet **ajoute** une précision
  fausse et un fuseau qui n'existait pas. Traiter les dates-calendaires séparément, ou les exclure.
- Un champ dont le front dépend de la forme exacte (tri de chaînes, clé de cache, comparaison
  littérale) doit être trouvé **avant** conversion : c'est le cas où la rupture est silencieuse des
  deux côtés.
- **Ne pas assouplir un test** pour absorber le changement. Un test qui comparait une chaîne exacte
  et qu'on relâche en « contient une date » supprime la garde au moment précis où elle sert.

## Delta à produire

- [x] **ADR** sous `docs/adr/` : [ADR-0018](../../adr/0018-format-des-dates-sur-le-fil.md), écrit
      et indexé **avant** la première conversion, avec le coût chiffré des deux candidats
- [x] Inventaire **dérivé, pas recopié** — un script bootstrappant Laravel, casts lus dans le
      conteneur ; rejouable par `node scripts/check-resource-date-format.mjs --report`
- [x] Inventaire des **appelants front** — trois familles trouvées, aucune dépendance à la forme
      d'instant, deux dépendances littérales sur des dates **calendaires** (non converties)
- [x] Sort des **18 `toDateString()`** tranché : **exclus de la conversion**, raison écrite dans
      l'ADR et dans le docblock de `calendarDate()`, et routés par un helper nommé
- [x] Converti en un lot vérifiable (138 lignes **d'appels**, puis **7 champs de plus** le
      2026-08-20 — cf. § 10), **aucune assertion assouplie** — aucun test n'assertait la forme
      avant ce ticket, et les 27 comparent des chaînes exactes
      > ⚠️ **« 138 lignes » compte des APPELS DE CONVERSION, pas des DATES ÉMISES.** L'écart n'est
      > pas rhétorique : les mêmes 45 fichiers portent **146 clés de date**, et les huit qui
      > manquaient au compte n'appelaient rien — elles rendaient l'attribut brut. C'est très
      > exactement l'angle mort qui a fait refuser la première livraison.
- [x] Front : rien à adapter, et c'est **mesuré** —
      `takussan-web/src/lib/__tests__/api-date-forms.test.ts`, 7 tests
- [x] Garde CI : `scripts/check-resource-date-format.mjs` — **INVENTAIRE POSITIF des dates émises**
      (contrôle B) depuis le 2026-08-20, plus la liste noire des conversions écrites (contrôle C)
      et la **non-vacuité** (contrôle A : dossier, planchers de fichiers / de clés de date / de
      sites conformes, helpers déclarés, formats cités, `->utc()` présent dans le CODE, exceptions
      encore applicables)
      > ⚠️ Elle était une **liste noire d'appels** jusqu'au 2026-08-20, et c'était le mauvais objet
      > — cf. § 10.
- [x] **Garde prouvée par 8 mutations**, sorties consignées au § 10 — dont l'attribut Carbon brut,
      la chaîne SQL brute et une clé de date ajoutée sans helper
- [x] **Inventaire par VALEUR** (2026-08-22, § 11) — `tests/Support/ResourceInventory.php`,
      `ResourceSubjects.php`, `WireDateForm.php` et
      `tests/Unit/Http/Resources/DateInventoryByValueTest.php` : énumération dérivée des 44
      ressources, registres gardés dans les deux sens, parcours récursif de la sortie de
      `resolve()`, **7 mutations** consignées
- [x] **D-36bis soldé** dans `docs/ardoise.md` ; `takussan-api/CLAUDE.md` § *Ressources* et
      `scripts/check-resources-extend-base.mjs` corrigés (leur texte était devenu faux)

## Critères d'acceptation

- [x] AC1 — un ADR décide du format, et il est écrit **avant** la première conversion
- [x] AC2 — toute date émise par `app/Http/Resources/` respecte le format retenu, ou figure dans
      une liste d'exceptions **justifiées par écrit** (les dates-calendaires, si c'est la décision)
      > ✅ **RECOCHÉ le 2026-08-22, et cette fois sur la propriété que l'AC énonce — cf. § 11.**
      > Ce qui manquait n'était pas un correctif, c'était un INVENTAIRE : la garde reconnaissait une
      > date à son NOM de clé, donc elle ne pouvait pas établir un « toute ». Un second dispositif,
      > **par VALEUR**, exécute désormais les 44 ressources sur 96 résolutions et inspecte **386
      > valeurs de date** reconnues à leur FORME, quel que soit le nom de la clé : 0 non conforme.
      > La mutation qui départage les deux gardes est jouée et écrite — une date émise sous la clé
      > `horodatage` laisse `check-resource-date-format.mjs` en **sortie 0**, et fait rougir
      > l'inventaire par valeur en nommant la clé.
      >
      > **Ce qui reste hors de portée est ÉNUMÉRÉ, et l'énumération est elle-même gardée** par
      > `CLES_JAMAIS_ATTEINTES` (égalité stricte) : deux clés, `CustomerResource::tasks_count` et
      > `LeaseResource::renewals_count`, toutes deux des compteurs `whenCounted` entiers. Les trois
      > angles morts résiduels — horodatage Unix, branches de relation de SECOND niveau, conformité
      > SÉMANTIQUE — sont nommés au § 11 avec ce qui les fermerait.
      > ⚠️ **DÉCOCHÉ le 2026-08-20, après avoir été coché à tort.** Il avait été validé sur le vert
      > d'une garde qui ne mesurait pas la propriété : **la garde était une liste noire d'APPELS de
      > conversion, elle passait au vert sur une date émise BRUTE.** Huit champs violaient l'AC dans
      > l'arbre même que le ticket livrait, dont deux sous une **cinquième forme** (`2026-08-17
      > 12:34:56`) absente et de l'inventaire du ticket et de l'ADR.
      >
      > Sept sont fermés, la garde est retournée en inventaire positif, et le huitième
      > (`MatchCandidateResource.paid_at`) est **inscrit en exception écrite** — il l'est parce que
      > la troncature a lieu dans un DTO de service, hors périmètre.
      >
      > **Il reste décoché**, et le motif tient au libellé de l'AC lui-même : « TOUTE date émise ».
      > Le contrôle B reconnaît une date à son **NOM de clé** — c'est un plancher, jamais un
      > inventaire, et le dépôt en porte la preuve (`member_since` y échappait jusqu'à ce qu'on
      > ajoute `_since`). Une garde qui ne peut pas énumérer sa cible ne peut pas établir un
      > « toute ». *Ce ticket est celui d'un CONTRAT : un AC coché à tort y coûte plus cher
      > qu'ailleurs, puisqu'il ferme la question pour tous ceux qui liront ensuite.*
- [x] AC3 — l'inventaire des appelants front est consigné, et chaque dépendance à la forme exacte
      est soit adaptée, soit écrite comme non concernée
- [x] AC4 — la suite backend reste verte, **sans assertion assouplie** ; les tests qui comparaient
      une chaîne exacte comparent toujours une chaîne exacte.
      **Fermé le 2026-08-20 par la session principale** (un agent délégué ne peut pas lancer la
      suite entière) : local `Tests: 2589, Assertions: 8210, Skipped: 2`, 0 échec ; CI, job
      `lint-and-test` de la PR #206, `pass` en 5 min 12 s. `DateRepresentationTest` fige la
      correspondance cast ↔ forme émise champ par champ — les comparaisons sont plus strictes
      qu'avant, pas moins.
- [x] AC5 — la suite frontend reste verte, et `npx tsc --noEmit` reste propre.
      Mesuré le 2026-08-20 : `tsc` sortie 0 · `npm run test` **173 fichiers, 1160 tests, 0 échec**
      · `npm run build` sortie 0 · job `Web (ESLint + tsc + Vitest + build)` de la CI, `pass`.
- [x] AC6 — émettre une date hors format fait échouer la CI, **prouvé par mutation**, y compris le
      cas où la garde ne trouve plus sa cible

## Hors périmètre

- Le **formatage d'affichage** côté front — livré par [TCK-153](TCK-153-formats-devise-date-harmonises.md)
  (`done`), et il appartient au front (principe non négociable n°5).
- Les **montants** : leur représentation est figée par
  `tests/Unit/Http/Resources/AmountRepresentationTest.php` (TCK-308) et ne bouge pas ici.
- L'**emploi des trois autres helpers** de `BaseResource` (`enumValue`, `enumLabel`, `mediaUrl`) —
  même famille, mais chacun a son propre coût de contrat ; ce ticket ne traite que les dates.
- L'enveloppe de pagination — [TCK-304](TCK-304-enveloppe-pagination-dupliquee.md).

## Notes d'implémentation

### 1. La prémisse du ticket TIENT à l'unité — re-mesurée le 2026-08-20

```
$ grep -rn 'toISOString'      app/Http/Resources/ | wc -l   → 55
$ grep -rn 'toIso8601String'  app/Http/Resources/ | wc -l   → 37
$ grep -rn 'toDateString'     app/Http/Resources/ | wc -l   → 18
```

Trois jours après l'écriture du ticket, les trois comptes sont identiques. L'inventaire **dérivé**
(script bootstrappant Laravel, casts lus dans le conteneur) ajoute la quatrième forme que le
comptage à trois lignes ne montrait pas : **28 `$this->iso(…)`**, soit **138 lignes** au total.

Les chaînes ont été vérifiées **en exécutant Carbon 3.13.2**, pas déduites des noms :

```
UTC     toISOString      : 2026-08-17T12:34:56.000000Z
UTC     toIso8601String  : 2026-08-17T12:34:56+00:00
UTC     format(ATOM)     : 2026-08-17T12:34:56+00:00
UTC     toDateString     : 2026-08-17
Paris   toISOString      : 2026-08-17T10:34:56.000000Z     ← normalise vers UTC
Paris   format(ATOM)     : 2026-08-17T12:34:56+02:00       ← conserve le décalage local
```

### 2. Ce que l'inventaire dérivé a trouvé, et qu'aucun comptage n'aurait montré

**Un désaccord cast ↔ forme, et un seul.** `PlatformPayout::$casts` déclare `period_start` et
`period_end` en `'date'` — une période comptable, sans heure — et
`Api/Admin/PlatformPayoutResource.php:15-16` les émettait par `iso()`, donc
`2026-08-17T00:00:00+00:00`. Les **deux** autres ressources portant exactement le même couple de
champs sur un cast identique — `PayoutResource:21-22`, `Accounting/BankStatementResource:20-21` —
émettaient `2026-08-17`.

*Le même concept, le même cast, deux contrats.* Invisible de tout test : les deux valeurs sont des
`string` que `new Date(…)` parse. C'est ce fait qui a fixé la règle d'ADR-0018 — **la forme se
déduit du CAST du modèle**, pas du goût de l'auteur de la ressource.

### 3. La décision (ADR-0018), et pourquoi la forme MAJORITAIRE a perdu

`…T12:34:56+00:00` retenu contre `…T12:34:56.000000Z`, qui était pourtant majoritaire à 55 :

- **Coût de contrat** : retenir `+00:00` déplace **55** champs ; retenir `.000000Z` en aurait
  déplacé **65** (37 + 28) *et* aurait exigé de redéfinir `iso()`, trois jours après que TCK-308
  l'ait généralisé.
- **La forme majoritaire est celle qu'aucun consommateur JS ne sait reproduire.** Carbon émet six
  chiffres de fraction, `Date.prototype.toISOString()` en émet trois. Mesuré :
  ```
  new Date('2026-08-17T12:34:56.000000Z').toISOString() → '2026-08-17T12:34:56.000Z'
  aller-retour identique ?                              → false
  ```
- Ce que `.000000Z` avait pour lui — la normalisation UTC systématique — a été **absorbé** :
  `iso()` fait désormais `Carbon::instance($date)->utc()->format(ATOM)`. Le trou était fermé par
  `config/app.php` → `'timezone' => 'UTC'`, il l'est maintenant par le code. Aucune sortie ne
  change aujourd'hui ; `DateRepresentationTest::test_iso_normalise_vers_utc_meme_sur_une_instance_non_utc`
  est le seul endroit du dépôt où la différence est observable.
- `Carbon::instance()` et non `$date->utc()` : le second **muterait** le Carbon reçu, donc
  l'attribut du modèle. Le test l'assert aussi.

### 4. Les 18 `toDateString()` : EXCLUS, et la raison est mesurée

Ils passent par un helper **nommé** — `calendarDate()` — plutôt que de rester des appels bruts :
la décision devient lisible dans le code, et la garde peut distinguer « date calendaire délibérée »
de « conversion oubliée ».

L'inventaire des appelants front a trouvé **deux dépendances littérales**, toutes deux sur des
dates calendaires. Les convertir les aurait cassées **en silence** :

| Site | Dépendance |
|---|---|
| `takussan-web/src/lib/schemas/payment.ts:71` | `data.due_date < data.issue_date` — comparaison **lexicographique**, juste sur `YYYY-MM-DD` et sur lui seul |
| `takussan-web/src/components/leases/LeaseRenewalDialog.tsx:97-98` | `form.start_date !== parent.start_date` — égalité **littérale** avec une valeur d'`<input type="date">`, toujours `YYYY-MM-DD` |

### 5. Inventaire des appelants front — trois familles, aucune adaptation nécessaire

1. **Parser** (majorité) — `new Date(…)`, `parseServerDate` (`src/lib/calendar-date.ts`), puis
   `formatDate` / `formatDateTime` (`src/lib/format.ts`). Les deux formes donnent le **même
   instant** : `new Date(A).getTime() === new Date(B).getTime()` → `true`.
2. **Découper** — `valeur.slice(0, 10)`, 4 sites : `PropertyDetailTabs.tsx:105`,
   `PropertyOverviewPanel.tsx:201`, `overview/owner/page.tsx:146`, plus les `period.start`/`.end`
   des vues d'aperçu (ceux-là viennent d'`AgencyStatsController`, **hors** `app/Http/Resources/`,
   donc inchangés). Les dix premiers caractères sont **identiques** entre les deux formes —
   mesuré, pas supposé.
3. **Comparer littéralement** — les deux sites du tableau ci-dessus, sur des dates calendaires
   non converties.

**Aucun site ne trie des chaînes de date d'API** : le seul tri trouvé
(`BookingDetail.tsx:559`) passe par `new Date(a.at).getTime()`.

Consigné et **figé** par `takussan-web/src/lib/__tests__/api-date-forms.test.ts` — 7 tests, dont
le contre-exemple qui rougirait si quelqu'un « harmonisait » un jour les dates calendaires.

> **Remarque annexe** : les fixtures des tests front encodent **trois** formes différentes
> (`.000000Z` dans `NotificationBell.test.tsx` et `ProfileHeader.test.tsx`, `.000Z` dans
> `MaintenanceDetail.test.tsx`, `+00:00` dans `AgencyModerationCard.test.tsx`) — dont certaines
> qui ne correspondaient déjà à aucune sortie réelle de l'API. C'est une preuve de plus que le
> front ne dépendait d'aucune forme d'instant. Elles n'ont pas été touchées : ce sont des entrées
> fabriquées, pas des assertions de contrat.

### 6. Preuve par ABLATION du correctif

> ℹ️ Comptes de cette section **dépassés** : le fichier porte 27 tests / 116 assertions depuis la
> reprise du § 10 (5 champs ajoutés au fournisseur d'instants, 2 tests nouveaux sur la cinquième
> forme). L'ablation rejouée est au § 10.6.

Le test a été écrit **avant** le correctif (TDD). Rouge de départ, sur `BaseResource` et les 45
ressources encore intactes :

```
$ php artisan test tests/Unit/Http/Resources/DateRepresentationTest.php
  Tests:    14 failed, 9 passed (66 assertions)
```

Après conversion :

```
  Tests:    23 passed (102 assertions)
```

Ablation ciblée, protocole complet — `BookingResource.php` remis à sa version d'avant le correctif
(`git show HEAD:…`), le reste inchangé :

```
$ git show HEAD:takussan-api/app/Http/Resources/BookingResource.php > …/BookingResource.php
    'confirmed_at' => $this->confirmed_at?->toISOString(),
$ php artisan test tests/Unit/Http/Resources/DateRepresentationTest.php
   FAILED  … > un instant sor…
  -'2026-08-17T12:34:56+00:00'
  +'2026-08-17T12:34:56.000000Z'
  Tests:    1 failed, 22 passed (98 assertions)
```

Restauration → `Tests: 23 passed (102 assertions)`, et la garde reverte.

### 7. Preuve de la garde par MUTATION — 6 mutations, toutes rouges

> ⛔ **SECTION PÉRIMÉE, conservée pour la trace — lire le § 10.5 à la place.** Ces six mutations
> portaient sur la garde en **liste noire d'appels**, et elles étaient toutes rouges *sur les fautes
> qu'elles savaient chercher*. Aucune ne jouait le cas qui l'a fait tomber : une date émise
> **brute**, sans appel de conversion. *Une batterie de mutations ne vaut que ce que vaut son
> inventaire des fautes possibles — six rouges ne prouvent rien sur la septième.*

`scripts/check-resource-date-format.mjs` au vert de base :

```
✓ toutes les dates de l'API passent par BaseResource.
  138 sites dans 45 fichiers — instant `…T12:34:56+00:00`, jour `YYYY-MM-DD` (ADR-0018).
```

| # | Mutation | Résultat |
|---|---|---|
| 1 | un `toISOString()` revient dans `BookingResource` | ✗ sortie 1, cite fichier:ligne + la ligne |
| 2 | un `->format('c')` local (la porte de sortie) | ✗ sortie 1 |
| 3 | `calendarDate()` renommé sur `BaseResource` | ✗ sortie 1 — contrôle A |
| 4 | `->utc()` retiré du corps d'`iso()` | ✗ sortie 1 — contrôle A *(voir ci-dessous)* |
| 5 | l'arbre fond à 3 fichiers (faux dépôt) | ✗ sortie 1 — **2 planchers** : fichiers ET sites |
| 6 | le dossier `Resources` renommé | ✗ sortie 1 — « introuvable », dit plutôt que de passer |

> ⚠️ **La mutation 4 a trouvé un défaut DANS la garde, et c'est le résultat le plus utile de la
> série.** À la première tentative, retirer le `->utc()` du corps d'`iso()` laissait la garde
> **VERTE** — parce que le docblock juste au-dessus explique pourquoi ce `->utc()` existe et le
> cite, et que le motif lisait le fichier brut. *Une garde qui se satisfait de sa propre
> documentation ne garde rien.* Seul `DateRepresentationTest` avait rougi ; il l'aurait fait seul,
> sans que personne ne sache que la garde était creuse. Elle dénude désormais les commentaires
> avant de lire, et la mutation 4 rejouée sort bien en 1.

### 8. Exécutions

| Commande | Résultat |
|---|---|
| `php artisan test tests/Unit/Http/Resources/ tests/Feature/Api/Admin/` | **169 passés**, 848 assertions, 24 s |
| `php artisan test tests/Feature/Api/` | **1098 passés**, 2 ignorés, 3314 assertions, 165 s, sortie 0 |
| `php artisan test tests/Feature/{Public,Auth,Invitation,Profiles,Agency,Admin,Crm,Dashboard,Tenant,Team,Http}/ …` | **567 passés**, 1983 assertions, sortie 0 |
| `php artisan test tests/Unit/ tests/Feature/{Search,Notifications,Onboarding,Validation,Models,Activity,Controllers}/` | **560 passés**, 1838 assertions, sortie 0 |
| `npx tsc --noEmit` | sortie 0 |
| `npx vitest run src/lib/__tests__/ src/components/{leases,maintenance,property-dashboard}/__tests__/ …` | **187 passés**, 24 fichiers |
| `npx eslint src/lib/__tests__/api-date-forms.test.ts` | sortie 0 |
| `./vendor/bin/pint app/Http/Resources/ tests/Unit/Http/Resources/DateRepresentationTest.php` | `passed` |
| `for g in scripts/check-*.mjs; do node "$g"; done` | toutes vertes |

Machine 8 cœurs, `load average` 7,19 au départ.

> ⚠️ **AC4 et AC5 restent NON COCHÉS, délibérément.** Ils exigent « la suite ENTIÈRE reste verte »,
> et la suite entière n'a **pas** été exécutée ici : la règle du dépôt réserve `php artisan test`
> sans filtre et `npm run test` sans fichier à la session déléguante, une fois, à la fin. Quatre
> lots ciblés totalisant **2394 exécutions de test à 0 échec** ne sont pas cette preuve — ils la
> rendent probable, pas établie. **Cocher sur cette base serait exactement la faute payée sur
> TCK-320 AC7** : un critère validé sur une lecture plutôt que sur une exécution. Les deux cases se
> cochent quand les deux suites auront tourné en entier, et pas avant.

**Aucune assertion n'a été assouplie** — et il n'y en avait aucune à assouplir : avant ce ticket,
**aucun test du dépôt n'assertait la forme d'une date émise**. Les seules assertions existantes sur
un format (`UserDetailTest.php:38`, `AgencyModerationTest.php:61-62`) portaient déjà sur `+00:00`
et sont restées vertes telles quelles.

### 9. Ce que ce ticket NE couvre pas

Les dates émises **hors** `app/Http/Resources/` — `AgencyStatsController:72` (`toIso8601String`),
`CalendarController:143` (`toDateTimeString`), payloads de notification, exports. Frontière
assumée et écrite dans ADR-0018 : le dossier des ressources est celui où le contrat est *déclaré*.
Mesuré à titre indicatif : `app/` entier compte 95 `toISOString`, 107 `toIso8601String`, 92
`toDateString` — le dossier des ressources en portait 110.

### 10. REPRISE du 2026-08-20 — la garde mesurait la mauvaise chose

Une revue adverse a **refusé** la première livraison. Le constat a été **re-mesuré** avant d'être
traité, et il tient entièrement.

#### 10.1 Le défaut : une liste noire d'appels n'est pas un inventaire de dates

La garde refusait `toISOString`, `toIso8601String`, `toDateString`, `toDateTimeString`, `->format(`
— c'est-à-dire les façons d'écrire une conversion **à la main**. Elle ne voyait donc rien de la
façon la plus courte, la plus naturelle et la plus fréquente d'émettre une date : **ne rien écrire
du tout**. Mutation rejouée sur `BookingResource:24` :

```
$ sed -i '' "s|'confirmed_at' => \$this->iso(\$this->confirmed_at),|'confirmed_at' => \$this->confirmed_at,|" …
$ node scripts/check-resource-date-format.mjs
✓ toutes les dates de l'API passent par BaseResource.
  137 sites dans 45 fichiers — instant `…T12:34:56+00:00`, jour `YYYY-MM-DD` (ADR-0018).
SORTIE=0
```

Le compte descend de 138 à 137 et **rien ne rougit** : le nombre était un *plancher*, pas un
*inventaire*. Or `JsonResource` sérialise ensuite ce Carbon brut par `Model::serializeDate()`, qui
rend `2026-08-17T12:34:56.000000Z` — précisément l'ancienne forme que ce ticket retire.

#### 10.2 Le trou était DÉJÀ OUVERT dans l'arbre livré — mesuré en exécutant, pas en lisant

Un test jetable a instancié les ressources et imprimé ce qu'elles émettent :

```
SettingResource.updated_at              = '2026-08-17T12:34:56.000000Z'   (type PHP Carbon)
IntegrationResource.last_used_at        = '2026-08-17T12:34:56.000000Z'
IntegrationResource.last_health_check_at= '2026-08-17T12:34:56.000000Z'
IntegrationResource.created_at          = '2026-08-17T12:34:56.000000Z'
IntegrationResource.updated_at          = '2026-08-17T12:34:56.000000Z'
ModerationItemResource.reported_at      = '2026-08-17 12:34:56'           (type PHP string)
ModerationItemResource.created_at       = '2026-08-17 12:34:56'
MatchCandidateResource.paid_at          = '2026-08-17'                    (cast datetime !)
```

**Huit champs**, et une **CINQUIÈME forme** que ni le ticket ni ADR-0018 n'avaient inventoriée :
`2026-08-17 12:34:56`, ni `T`, ni fuseau. Elle vient d'un `DB::table(…)->selectRaw(…)` — la
ressource enveloppe un **tableau**, ces colonnes n'ont jamais traversé un cast Eloquent, et il n'y
avait donc **aucun appel de conversion à trouver**.

Coût mesuré, et il est de la famille la plus coûteuse — invisible là où on développe :

```
TZ=Europe/Paris   new Date('2026-08-17 12:34:56').toISOString()        →  2026-08-17T10:34:56.000Z
TZ=Europe/Paris   new Date('2026-08-17T12:34:56+00:00').toISOString()  →  2026-08-17T12:34:56.000Z
                  écart → 2 heures
TZ=UTC            écart → 0
```

#### 10.3 `MatchCandidateResource.paid_at` — tracé, et c'est un AUTRE défaut

La revue le donnait « du même profil, non confirmé ». Il ne l'est pas. Ce n'est ni un Carbon brut
ni une chaîne SQL : c'est une date calendaire **délibérément tronquée en amont**.

```
$ grep -rn "paidAt" app/
app/Services/Accounting/MatchCandidate.php:14:        public ?string $paidAt,
app/Services/Accounting/PaymentSearchService.php:56:   paidAt: $p->paid_at?->toDateString(),
app/Services/Accounting/PaymentSearchService.php:77:   paidAt: $p->paid_at?->toDateString(),
app/Services/Accounting/PaymentSearchService.php:107:  paidAt: $p->issue_date?->toDateString(),

$ (mesuré) BookingPayment::findOrFail(…)->getCasts()['paid_at']  →  'datetime'
```

C'est **le défaut de `PlatformPayout::period_start` retourné** : `BookingPaymentResource.paid_at`
émet `2026-08-17T12:34:56+00:00` pour la *même colonne du même modèle*. Il n'est pas corrigé ici —
la ressource ne peut pas récupérer une heure jetée dans le service, et le correctif (retyper le DTO
en `?DateTimeInterface`) touche `app/Services/Accounting/`, **hors périmètre**. Il est inscrit dans
`EXCEPTIONS_JUSTIFIEES` avec sa raison écrite, et la garde **rougit si cette exception cesse de
correspondre à un site réel**. *Le trou est compté, pas pardonné.* → ticket à ouvrir.

#### 10.4 La garde retournée — inventaire positif

`scripts/check-resource-date-format.mjs` réécrite : chaque entrée `'clé' => valeur` dont la **clé
est un nom de date** doit avoir une **valeur** qui passe par un helper, ou figurer dans les
exceptions écrites. L'analyseur masque commentaires et chaînes puis équilibre `()[]{}`, ce qui
couvre les ternaires multi-lignes (`Api/Admin/AgencyResource:33-35`, faux positif de toute lecture
ligne-à-ligne).

⚠️ **L'heuristique de nom de clé est un PLANCHER, et la garde l'écrit dans sa propre sortie.**
`PropertyResource` émet `'member_since'` : le suffixe `_since` a été ajouté **après** l'avoir
constaté, pas avant. Symétriquement, `'quarter'` désigne ici un *quartier* sénégalais et non un
trimestre — une heuristique de nom porte la langue et le domaine du dépôt où elle est écrite.

#### 10.5 Preuve de la garde par MUTATION — 8 mutations, toutes en sortie 1

État de base : `✓ 146 clés de date dans 45 fichiers — 145 conformes, 1 exception(s) écrite(s).`

| # | Mutation | Contrôle | Sortie |
|---|---|---|---|
| 1 | `'confirmed_at' => $this->confirmed_at` (**attribut Carbon BRUT**) | B | **1** |
| 2 | `'reported_at' => $this->resource['reported_at']` (**chaîne SQL brute**) | B | **1** |
| 3 | `'archived_at' => $this->archived_at` (**clé de date AJOUTÉE** sans helper) | B | **1** |
| 4 | `'issue_date' => $this->issue_date` (date calendaire brute) | B | **1** |
| 5 | `'key' => $this->updated_at->toDateString()` (conversion sous clé non date-ish) | C | **1** |
| 6 | le site d'une exception repasse conforme → **exception périmée** | A | **1** |
| 7 | `iso()` renommé sur `BaseResource` | A | **1** |
| 8 | `->utc()` retiré du CODE mais toujours cité dans le DOCBLOCK | A | **1** |

Les mutations 1 à 3 sont celles que la version précédente laissait passer en **sortie 0**.

#### 10.6 Preuve du correctif par ABLATION

Correctif retiré (les trois ressources remises à leur version livrée par TCK-327) :

```
$ php artisan test tests/Unit/Http/Resources/DateRepresentationTest.php
   FAILED … > un instant sor…    Failed asserting that Illuminate\Support\Carbon Object …
   FAILED … > une date venue…    Failed asserting that two strings are identical.
   FAILED … > une colonne nu…    Failed asserting that '' is null.
  Tests:    4 failed, 23 passed (109 assertions)

$ node scripts/check-resource-date-format.mjs
✗ 7 écart(s) — le format des dates de l'API (ADR-0018) :
  B — …/Api/Admin/ModerationItemResource.php:23 : « reported_at » …
  B — …/Api/Admin/ModerationItemResource.php:24 : « created_at » …
  B — …/IntegrationResource.php:17 : « last_used_at » …
  B — …/IntegrationResource.php:18 : « last_health_check_at » …
  B — …/IntegrationResource.php:21 : « created_at » …
  B — …/IntegrationResource.php:22 : « updated_at » …
  B — …/SettingResource.php:19 : « updated_at » …
CODE DE SORTIE = 1
```

Correctif restauré :

```
$ php artisan test tests/Unit/Http/Resources/DateRepresentationTest.php
  Tests:    27 passed (116 assertions)
$ node scripts/check-resource-date-format.mjs
✓ toutes les dates ÉMISES par l'API passent par BaseResource.
  146 clés de date dans 45 fichiers — 145 conformes, 1 exception(s) écrite(s).
CODE DE SORTIE = 0
```

⚠️ Le test `une colonne nulle du selectraw reste nulle` n'est pas décoratif :
`Carbon::parse(null)` rend **l'instant courant**, pas `null`. Sans garde explicite, « jamais
signalé » serait devenu « signalé à l'instant » — faux, plausible, et impossible à repérer en
lecture.

#### 10.7 Exécutions de la reprise

| Commande | Résultat |
|---|---|
| `php artisan test tests/Unit/Http/Resources/DateRepresentationTest.php` | **27 passés**, 116 assertions |
| `php artisan test` sur les **22 classes** que `tests/impact-map.json` associe aux 4 fichiers touchés | **148 passés**, 541 assertions, 20,6 s |
| `php artisan test` (5 classes de modération) | **43 passés**, 172 assertions |
| `php artisan test` (Setting / Integration / AdminConsoleValidation) | **23 passés**, 115 assertions |
| `node scripts/check-resource-date-format.mjs` | sortie 0 |
| `./vendor/bin/pint <les 4 fichiers>` | `passed` |

⚠️ **La suite entière n'a PAS été lancée** — règle du dépôt : elle appartient à la session
déléguante, une fois, à la fin. `php bin/impacted-tests.php` répond d'ailleurs `SUITE ENTIÈRE`, mais
à cause d'un fichier du **lot précédent** (`StoreSavedSearchRequest.php`), pas des changements de
cette reprise. AC4 et AC5 restent donc décochés, pour le même motif qu'au § 8.


### 11. REPRISE du 2026-08-22 — l'inventaire par VALEUR, et AC2 recoché

Le § 10 laissait deux issues ouvertes. **C'est la seconde qui est prise, sous une forme plus forte
que celle qu'il proposait** : on n'essaie plus de deviner quelles clés sont des dates. On instancie
la ressource, on regarde ce qu'elle ÉMET, et on refuse toute valeur qui EST une date sous une forme
non conforme. *Une date se reconnaît alors à ce qu'elle est, pas à comment on l'a nommée.*

**La garde statique n'est pas remplacée, elle est complétée — et les deux se trompent
DIFFÉREMMENT.** C'est la seule raison d'en avoir deux :

| | `check-resource-date-format.mjs` | `DateInventoryByValueTest` |
|---|---|---|
| lit | le SOURCE | la VALEUR ÉMISE |
| voit les branches non exécutées | **oui** | non |
| voit une date sous une clé non nommée `*_at`/`*_date`/… | **non** | **oui** |
| voit un désaccord cast ↔ forme (`datetime` rendu en jour) | **oui** | non |

#### Ce qui a été écrit

- `takussan-api/tests/Support/ResourceInventory.php` — l'énumération **dérivée** des 44 ressources
  concrètes (Finder + ReflectionClass + cache statique, patron copié de `SearchableModels`), plus
  **trois registres gardés dans les deux sens** : `MODELES_EXPLICITES` (5 ressources que la
  convention `<Modele>Resource` ne résout pas), `SUJETS_SUR_MESURE` (5 ressources qu'aucun modèle
  n'adosse), `NON_ENUMERABLES` (**vide, et c'est un résultat**).
- `takussan-api/tests/Support/ResourceSubjects.php` — la fabrication du sujet. Les colonnes de date
  sont **lues dans le conteneur** (`getCasts()` + `getDates()`), jamais devinées ; les modèles sans
  factory sont instanciés non persistés avec toutes leurs colonnes présentes ; les relations citées
  par le SOURCE de la ressource sont chargées, et greffées quand la base ne les fournit pas.
- `takussan-api/tests/Support/WireDateForm.php` — la reconnaissance de forme, ancrée, avec ses faux
  positifs éprouvés (numéro de version, uuid, téléphone, iban, montant, slug, url signée…).
- `takussan-api/tests/Unit/Http/Resources/DateInventoryByValueTest.php` — le parcours **récursif**
  de `resolve()`, tableaux imbriqués compris. `DateRepresentationTest` n'est pas touché : il fige la
  correspondance cast ↔ forme **champ par champ**, ce que l'énumération ne fait pas.

**Les dix ressources que le § 10 pressentait non énumérables le sont TOUTES** — cinq modèles sans
factory par `new Modele` non persisté, cinq non-modèles par une recette écrite (DTO `readonly`,
tableau de `selectRaw`, tableau `{agency, admin}`, `Spatie\…\Media`). *Une ressource éprouvée vaut
mieux qu'une ressource excusée* : `NON_ENUMERABLES` reste écrit, vide, parce que sa raison d'être
n'est pas de porter des entrées mais d'être le seul endroit où une ressource peut légitimement
échapper au test.

#### Ce que le dispositif mesure — chiffres du 2026-08-22

```
$ php artisan test tests/Unit/Http/Resources/
  Tests:    66 passed (214 assertions)   Duration: 8.68s
$ node scripts/check-resource-date-format.mjs
  ✓ toutes les dates ÉMISES par l'API passent par BaseResource.        → sortie 0
```

- **96 résolutions** : 44 ressources → 48 sujets (`ProfileResource` comptant pour ses cinq profils
  polymorphes) × 2 variantes d'appelant (liste / route de détail) ;
- **386 valeurs de date** reconnues à leur forme, **0 non conforme** ;
- **28 paires (ressource, relation) `whenLoaded`/`relationLoaded` sur 28** exécutées au moins une
  fois — c'était 27 avant la greffe des relations, et **0 pour les cinq modèles sans factory** ;
- **2 clés** que le parcours n'atteint jamais, écrites et gardées à l'égalité stricte.

⚠️ **Deux pièges payés, tous deux SILENCIEUX, et le second vaut d'être retenu hors de ce ticket.**

1. `resolve()` ne récurse pas dans un tableau PHP nu — seulement dans `MergeValue` et
   `JsonResource`. Un Carbon imbriqué survit donc au filtrage. Le parcours doit être récursif ; la
   mutation (f) ci-dessous le prouve à trois niveaux (`property.owner.member_since`).
2. **`$this->app->instance('request', $r)` ÉCRASE le résolveur d'utilisateur de `$r`.**
   `Application::instance()` déclenche les rappels de rebinding, et
   `AuthServiceProvider::registerRequestRebindHandler()` repose alors un résolveur adossé au garde.
   Poser `setUserResolver()` AVANT cette liaison le perd : `$request->user()` redevient `null`, les
   quatre clés que `PropertyResource` conditionne à un appelant authentifié — **dont trois dates** —
   quittent la sortie, et **rien ne rougit**. Mesuré : 176 dates vues dans le mauvais ordre, 191
   dans le bon.

#### Preuve par MUTATION — 7 mutations, toutes rouges, toutes restaurées

| # | mutation | inventaire par valeur | garde statique |
|---|---|---|---|
| a | `UserResource` émet `created_at` en **Carbon brut** | ✗ `→ created_at : objet Illuminate\Support\Carbon NON CONVERTI` | ✗ (plancher de sites conformes) |
| b | `ModerationItemResource` recopie la **chaîne SQL brute** | ✗ `« 2026-08-17 12:34:56 » — c'est une chaîne SQL BRUTE` | ✗ |
| c | ressource **nouvelle**, ni énumérable ni inscrite | ✗ `n'est adossée à AUCUN modèle […] et n'est inscrite à aucun registre` | dépend du nom de la clé |
| d | entrée de registre **sans fichier réel** | ✗ `SUJETS_SUR_MESURE inscrit « …MediaLegacyResource », qui n'est plus une ressource concrète` | — |
| e | date sous la clé **`horodatage`** (nom non reconnu) | ✗ `→ horodatage : objet …Carbon NON CONVERTI` | **✓ sortie 0 — AVEUGLE** |
| f | date **imbriquée** dans un tableau PHP nu | ✗ `→ property.owner.member_since : objet …Carbon NON CONVERTI` | ✗ |
| g | une entrée de `CLES_JAMAIS_ATTEINTES` retirée | ✗ `L'ensemble des clés que le parcours n'atteint jamais a changé` | — |

**La ligne (e) est le cœur du chantier.** Sur cette mutation, `check-resource-date-format.mjs`
imprime *« ✓ toutes les dates ÉMISES par l'API passent par BaseResource »* et sort en **0**, alors
qu'un objet `Carbon` part sur le fil. C'est exactement le défaut nommé par le § 10 — et il n'est
plus une hypothèse, il est reproduit.

#### Pourquoi AC2 est recoché, et ce qui le décocherait

L'AC dit *« toute date émise »*. La question n'est donc plus « la garde connaît-elle les noms ? »
mais **« reste-t-il une branche capable d'émettre une date que ni l'une ni l'autre ne regarde ? »**.
Trois résidus, tous nommés, aucun ouvert :

1. **Un horodatage Unix est indiscernable d'un identifiant** — aucune forme ne les sépare, et
   `WireDateForm` l'écrit dans son propre docblock. Le dépôt n'en émet aucun ; le jour où il en
   émettrait un, ce dispositif serait muet.
2. **Les branches de relation de SECOND niveau** — la greffe ne descend que d'un cran. Deux sites :
   `MaintenanceRequestResource:51` (`$property->address`) et `PropertyResource:128`
   (`$collaborator->user`). Les deux ont été **lus** : le premier émet `neighborhood/city/region/
   country`, le second `id/name/email`. **Aucune date.**
3. **La conformité SÉMANTIQUE** — un champ casté `datetime` rendu en jour calendaire est conforme
   *par valeur*, et le restera. C'est le cas de `MatchCandidateResource::paid_at`, que la garde
   statique porte en exception écrite parce qu'elle connaît le cast. Le trou est COMPTÉ, pas
   pardonné, et il n'est pas dans le périmètre de ce ticket (la troncature a lieu dans un DTO de
   service).

Ce qui décocherait AC2 : une quatrième famille de résidu apparaissant sans être écrite. C'est
précisément ce que `CLES_JAMAIS_ATTEINTES` empêche — toute clé qui cesse d'être atteinte fait
rougir, avec ou sans date.

⚠️ **Ce que ce § n'établit PAS** : la suite entière n'a pas été jouée par l'agent délégué (règle du
dépôt) — seuls `tests/Unit/Http/Resources/` et la garde statique l'ont été. La session déléguante la
joue une fois, à la fin.

## Reste sur dev

**Le delta est mergé ; AC2 reste NON TENU, et il ne peut pas l'être sous la forme où il est écrit.**

AC2 exige que « **toute** date émise par `app/Http/Resources/` respecte le format retenu ». Ce que
la garde établit réellement est plus faible, et il faut le dire tel quel : elle reconnaît une date à
son **NOM de clé** (`*_at`, `*_date`, `*_since`, `period_start`…). C'est un **plancher, jamais un
inventaire** — le dépôt en porte la preuve dans le ticket lui-même : `member_since` échappait à
l'heuristique jusqu'à ce qu'on ajoute `_since`, et rien ne dit qu'il n'en reste pas.

*Une garde qui ne peut pas énumérer sa cible ne peut pas établir un « toutes ».*

Ce qui EST établi, et qui est déjà beaucoup :

- 146 clés de date dans 45 fichiers, **145 conformes, 1 exception écrite** ;
- la garde retournée en **inventaire positif** (elle ne cherche plus des appels interdits, elle
  exige que chaque date émise passe par le helper), prouvée par **8 mutations** en sortie 1, dont
  l'attribut Carbon brut, la chaîne SQL brute et une clé de date ajoutée sans helper ;
- deux trous refermés après coup, mesurés : le repérage ignorait les **guillemets doubles**
  (`"confirmed_at" =>`, un caractère de différence, laissait la garde verte), et les planchers
  valaient 100 pour 146 clés réelles — 46 pouvaient disparaître en silence. Ce sont désormais des
  cliquets posés au niveau mesuré.

**Deux issues possibles, et c'est une décision, pas un oubli :**

1. **Reformuler AC2** en ce que la garde peut tenir (« toute date reconnue par l'heuristique de nom
   respecte le format, ou figure dans la liste d'exceptions ; l'heuristique est un plancher
   documenté ») et clore le ticket.
2. **Ouvrir un ticket** pour un inventaire qui ne dépende plus du nom — lire les `$casts` dans le
   conteneur Laravel et confronter au `toArray()` de chaque ressource. C'est faisable, c'est plus
   cher, et ça vaut d'être décidé plutôt que subi.

En attendant, le ticket reste `doing` : son delta est livré, son AC2 ne l'est pas, et le premier ne
rachète pas le second.

## Clôture — 2026-08-22

**Les six critères sont tenus, et le dernier l'a été par un changement de MÉTHODE, pas par plus de
travail de conversion.**

AC2 exigeait « TOUTE date émise ». La garde statique ne pouvait pas l'établir : elle reconnaît une
date à son NOM de clé, ce qui est un plancher et jamais un inventaire. Le ticket proposait de
reformuler l'AC à la baisse ou d'ouvrir un ticket pour un inventaire dérivé des `$casts`. **C'est
la seconde issue qui a été prise, sous une forme plus forte encore** : un inventaire par VALEUR,
qui n'essaie plus de deviner quelles clés sont des dates — il instancie la ressource, appelle
`resolve()`, parcourt la sortie récursivement et refuse toute valeur qui EST une date sous une
forme non conforme.

Les deux gardes restent, et c'est délibéré : **elles se trompent différemment.** La mutation qui le
prouve est la plus utile de la série — une date émise sous la clé `horodatage` fait rougir
l'inventaire par valeur pendant que la garde statique imprime *« ✓ toutes les dates ÉMISES par
l'API passent par BaseResource »* et sort en 0.

Fermé par la session principale, sur exécution : `php artisan test` → **2734 passés, 2 ignorés,
0 échec**, 8791 assertions, 468 s, machine au repos. `npm run test` → 191 fichiers, 1328 tests,
0 échec. `npx tsc --noEmit` sortie 0. `node scripts/check-resource-date-format.mjs` sortie 0.
