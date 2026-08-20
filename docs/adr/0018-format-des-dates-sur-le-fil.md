# ADR-0018 — L'API émet deux types de date, et un seul format pour chacun

- **Statut** : Accepté, **amendé le 2026-08-20** (cf. § *Amendement — la cinquième forme*)
- **Date** : 2026-08-20
- **Tickets** : TCK-327 (décision), TCK-308 (le socle : `BaseResource` étendue partout)

## Contexte

`app/Http/Resources/` émettait des dates sous **quatre formes** appelées, pour **trois chaînes
distinctes** sur le fil. Mesuré le 2026-08-20 par un inventaire **dérivé** — les casts sont lus dans
le conteneur Laravel, pas déduits d'un grep — sur les 45 fichiers du dossier, 138 lignes émettant
une date :

> ⚠️ **Ce tableau compte des APPELS DE CONVERSION, pas des dates ÉMISES**, et l'écart n'est pas
> anodin : il y a **146 clés de date** dans ces mêmes 45 fichiers. Les huit qui manquaient
> n'appelaient rien — elles rendaient l'attribut brut. Le § *Amendement* ci-dessous les traite ;
> le compte se prend désormais à la source, par
> `node scripts/check-resource-date-format.mjs --report`.

| Appel | Occurrences | Chaîne émise |
|---|---|---|
| `toISOString()` | **55** | `2026-08-17T12:34:56.000000Z` |
| `toIso8601String()` | **37** | `2026-08-17T12:34:56+00:00` |
| `$this->iso(…)` (`format(ATOM)`) | **28** | `2026-08-17T12:34:56+00:00` |
| `toDateString()` | **18** | `2026-08-17` |

Les trois cohabitaient parfois dans le **même fichier** — `LeaseResource` émet `start_date` en
`toDateString()`, `signed_at` en `toISOString()` ; `KycDossierResource` mélange `iso()` et
`toISOString()` à quatre lignes d'intervalle.

**Le défaut n'est pas cosmétique, et il a une victime mesurée.** `PlatformPayout::$casts` déclare
`period_start` et `period_end` en `'date'` — une **période comptable**, sans heure. Or
`Api/Admin/PlatformPayoutResource.php:15-16` les émettait par `iso()`, donc
`2026-08-17T00:00:00+00:00`. Les deux autres ressources portant exactement le même couple de champs
sur un cast identique — `PayoutResource:21-22` et `Accounting/BankStatementResource:20-21` — les
émettaient en `2026-08-17`. **Le même concept, le même cast, deux contrats.** C'est le seul
désaccord cast↔forme du dossier, et il n'est visible d'aucun test : les deux valeurs sont des
`string` que `new Date(…)` parse.

### Ce que TCK-308 a livré, et pourquoi ça ne suffisait pas

TCK-308 a migré les 44 ressources vers `BaseResource`, donc rendu `iso()` **disponible** partout.
Ce fut délibérément un échange de parent, deux lignes par fichier, aucun corps de `toArray()`
touché — précisément pour ne changer **aucune** sortie. La disponibilité n'est pas l'emploi :
`scripts/check-resources-extend-base.mjs` écrit cette limite dans sa propre sortie, et l'ardoise la
porte en **D-36bis**.

## Décision

**L'API distingue deux types de date, et la forme se DÉDUIT du cast du modèle, jamais du goût de
l'auteur de la ressource.**

| Type | Cast Eloquent | Helper | Chaîne émise |
|---|---|---|---|
| **Instant** | `datetime`, `immutable_datetime`, `created_at`/`updated_at` | `BaseResource::iso()` | `2026-08-17T12:34:56+00:00` |
| **Date calendaire** | `date`, `immutable_date` | `BaseResource::calendarDate()` | `2026-08-17` |

`iso()` est en outre **durci** : il normalise vers UTC **en code**
(`Carbon::instance($date)->utc()->format(DateTimeInterface::ATOM)`) au lieu de compter sur
`config/app.php` → `'timezone' => 'UTC'`. Sur une instance non-UTC, `format(ATOM)` conservait le
décalage local (`…T12:34:56+02:00`) : l'instant restait juste, mais la chaîne cessait d'être
comparable lexicographiquement à ses voisines. Mesuré :

```
Paris   toISOString      : 2026-08-17T10:34:56.000000Z
Paris   toIso8601String  : 2026-08-17T12:34:56+02:00
Paris   format(ATOM)     : 2026-08-17T12:34:56+02:00
```

Le durcissement ne change **aucune sortie aujourd'hui** — la configuration est déjà UTC. Il ferme le
trou dans le code plutôt que dans une valeur de configuration.

### Pourquoi `…+00:00` et non `…000000Z`, alors que ce dernier est majoritaire

Quatre raisons, chiffrées :

1. **Coût de contrat plus faible.** Retenir `+00:00` déplace **55** champs (les `toISOString()`).
   Retenir `.000000Z` en aurait déplacé **65** (37 `toIso8601String()` + 28 `iso()`) — *et* aurait
   exigé de redéfinir `iso()`, c'est-à-dire d'inverser un helper que TCK-308 venait de généraliser.
2. **La forme majoritaire est celle qu'aucun consommateur JavaScript ne sait reproduire.** Carbon
   émet **six** chiffres de fraction, `Date.prototype.toISOString()` en émet **trois**. Mesuré :

   ```
   new Date('2026-08-17T12:34:56.000000Z').toISOString()  →  '2026-08-17T12:34:56.000Z'
   aller-retour identique ?                               →  false
   ```

   Un front qui renvoie une date reçue ne renvoie donc pas la chaîne reçue. `+00:00` n'a pas ce
   défaut : il ne porte pas de fraction du tout.
3. **La précision annoncée est fausse.** `.000000` promet la microseconde sur des colonnes MySQL
   `TIMESTAMP` sans précision fractionnaire : six zéros décoratifs à chaque champ, 92 fois par
   réponse paginée.
4. **`format(ATOM)` est déjà ce que rend `BaseResource::iso()`.** Retenir cette forme **ratifie**
   le socle existant ; retenir l'autre l'aurait contredit trois jours après sa livraison.

Ce que `.000000Z` avait pour lui — la normalisation UTC systématique — est repris par le
durcissement de `iso()` ci-dessus. Le candidat perdant ne perd donc aucune de ses qualités : elles
sont absorbées.

### Pourquoi les 18 `toDateString()` ne sont PAS convertis

Une date calendaire porte une **intention métier** : `due_date`, `period_start`,
`early_termination_effective_date`, `issue_date`. La convertir en horodatage ajouterait une heure
(`T00:00:00`) et un fuseau qui n'existent pas dans le domaine — c'est une précision fausse, et c'est
exactement le défaut mesuré sur `PlatformPayoutResource`.

**Deux appelants du front en dépendent littéralement**, et la conversion les aurait cassés en
silence :

- `takussan-web/src/lib/schemas/payment.ts:71` — `data.due_date < data.issue_date`, comparaison
  **lexicographique** de deux `YYYY-MM-DD`. Elle est juste sur ce format et sur lui seul.
- `takussan-web/src/components/leases/LeaseRenewalDialog.tsx:97-98` —
  `form.start_date !== parent.start_date`, égalité **littérale** entre une valeur d'`<input
  type="date">` (toujours `YYYY-MM-DD`) et une valeur d'API.

Ces deux sites ne sont pas des maladresses : ils sont la raison pour laquelle une date calendaire
doit rester une date calendaire.

## Amendement du 2026-08-20 — la CINQUIÈME forme, et pourquoi l'inventaire l'avait manquée

**Cet ADR a été écrit à partir d'un inventaire des CONVERSIONS ÉCRITES.** C'est ce qui l'a rendu
aveugle à la façon la plus courte, la plus naturelle et la plus fréquente d'émettre une date depuis
un `toArray()` : ne rien écrire du tout.

    'confirmed_at' => $this->iso($this->confirmed_at),   ← conforme, et compté
    'confirmed_at' => $this->confirmed_at,               ← l'attribut BRUT, et invisible

*Un inventaire des conversions écrites ne trouve jamais les dates qu'on n'a pas converties.* Huit
champs manquaient donc au tableau du § *Contexte*, et ils étaient encore ouverts dans l'arbre que
TCK-327 livrait. Mesurés le 2026-08-20 **en exécutant les ressources**, pas en les lisant :

| Site | Émettait | Nature |
|---|---|---|
| `SettingResource.updated_at` | `2026-08-17T12:34:56.000000Z` | attribut Carbon brut, sérialisé par `Model::serializeDate()` |
| `IntegrationResource` × 4 (`last_used_at`, `last_health_check_at`, `created_at`, `updated_at`) | `2026-08-17T12:34:56.000000Z` | idem |
| `Api/Admin/ModerationItemResource` × 2 (`reported_at`, `created_at`) | **`2026-08-17 12:34:56`** | **cinquième forme** — chaîne SQL brute |
| `Accounting/MatchCandidateResource.paid_at` | `2026-08-17` | date calendaire sur un cast `datetime` |

### La cinquième chaîne : `2026-08-17 12:34:56`

Elle n'est pas ISO 8601 — **ni `T`, ni fuseau**. Elle vient de
`UnifiedModerationService::unionQuery()`, qui construit trois `DB::table(…)->selectRaw(…)` unis :
la ressource enveloppe un **tableau**, pas un modèle, et ces colonnes n'ont donc jamais traversé un
cast Eloquent. Aucune lecture de `$casts` ne pouvait la signaler ; aucun appel de conversion
n'existait à trouver.

**Son coût est mesuré, et il est de la famille la plus coûteuse : invisible là où on développe.**

```
TZ=Europe/Paris   new Date('2026-08-17 12:34:56').toISOString()        →  2026-08-17T10:34:56.000Z
TZ=Europe/Paris   new Date('2026-08-17T12:34:56+00:00').toISOString()  →  2026-08-17T12:34:56.000Z
                  écart                                                →  2 heures
TZ=UTC            écart                                                →  0
```

Le navigateur lit une chaîne sans fuseau comme une heure **locale**. Sur une machine de
développement en UTC, l'écart est nul et rien ne se voit. Chez l'utilisateur — Dakar, Paris — la
date affichée est fausse de l'offset, sans message d'erreur.

**Décision, sans changer la règle** : la règle du § *Décision* est inchangée — deux types, deux
helpers. Elle est simplement **étendue aux ressources qui n'enveloppent pas un modèle** : une
colonne venue d'un `selectRaw` est parsée dans la ressource (`Carbon::parse`) *puis* passée à
`iso()`. Le parse est le cast que la requête n'a pas fait, pas une conversion de confort.

⚠️ Il se garde explicitement contre `null` : `Carbon::parse(null)` rend **l'instant courant**, pas
`null`. Sans la garde, « jamais signalé » serait devenu « signalé à l'instant » — une valeur fausse,
plausible, et impossible à repérer en lecture. `DateRepresentationTest` fige les deux cas.

### Le cas laissé ouvert, et compté

`Accounting/MatchCandidateResource.paid_at` émet `2026-08-17` pour un champ dont le cast est
`datetime` (`BookingPayment::paid_at`, vérifié par `getCasts()`). **C'est le défaut de
`PlatformPayout::period_start` retourné** : `BookingPaymentResource.paid_at` émet
`2026-08-17T12:34:56+00:00` pour la *même colonne du même modèle*.

Il n'est **pas corrigé ici**, et pour une raison de structure : la troncature n'a pas lieu dans la
ressource. Le DTO `App\Services\Accounting\MatchCandidate::$paidAt` est déclaré `?string` et
reçoit déjà `$p->paid_at?->toDateString()` de `PaymentSearchService` (lignes 56, 77, 107). La
ressource ne peut pas récupérer l'heure — elle a été jetée en amont. Le correctif exige de retyper
le DTO et de toucher `app/Services/Accounting/`, hors du périmètre de TCK-327.

Il est inscrit dans `EXCEPTIONS_JUSTIFIEES` de la garde, avec sa raison écrite, et la garde
**rougit si cette exception cesse de correspondre à un site réel**. *Le trou est compté, pas
pardonné.*

### Ce que l'amendement change dans la garde

`scripts/check-resource-date-format.mjs` était une **liste noire d'appels**. Elle est désormais un
**inventaire positif des dates émises** : chaque entrée `'clé' => valeur` dont la clé est un nom de
date doit passer par un helper, ou figurer dans la liste d'exceptions écrites. L'ancienne liste
noire est conservée en contrôle complémentaire — elle attrape les conversions posées sous une clé
que l'heuristique de nom ne reconnaît pas.

⚠️ **L'heuristique de nom de clé est un PLANCHER, pas un inventaire**, et l'ADR ne doit pas être lu
comme si elle en était un. `PropertyResource` émet `'member_since'` : le suffixe `_since` a été
ajouté à l'heuristique **après** l'avoir constaté, pas avant. Il en reste sûrement d'autres. La
garde l'écrit dans sa propre sortie.

## Conséquences

**Ce que ça coûte.** 57 champs changent de valeur sur le fil : les 55 `toISOString()` passent de
`…T12:34:56.000000Z` à `…T12:34:56+00:00`, et les 2 champs de `PlatformPayoutResource` passent de
`2026-08-17T00:00:00+00:00` à `2026-08-17`. C'est une **rupture de contrat**, assumée,
et faite en une fois plutôt qu'endurée champ par champ.

**Ce que ça interdit.** Plus aucune date émise sans helper dans un corps de `toArray()` — l'attribut
brut compris, depuis l'amendement. Et plus aucun appel de conversion de date :
`toISOString`, `toIso8601String`, `toDateString`, `toDateTimeString`, `->format(` y sont refusés par
la CI. Une ressource qui a besoin d'une autre forme n'existe pas — elle a besoin d'un helper de plus
sur `BaseResource`, et d'un amendement à cet ADR.

**Ce que ça rend possible.** Le front peut traiter tout champ `*_at` comme un instant et tout champ
`*_date` / `period_*` comme une date calendaire, sans table de correspondance par endpoint. Le tri
lexicographique d'une liste d'instants redevient équivalent au tri chronologique — ce qu'il n'était
pas tant que deux suffixes cohabitaient.

**Ce que ça NE couvre PAS.** Les dates émises **hors** `app/Http/Resources/` — contrôleurs qui
composent une réponse à la main (`AgencyStatsController:72`, `CalendarController:143`), payloads de
notification, exports. La garde ne les regarde pas, et cet ADR ne prétend pas les avoir corrigés.
C'est une frontière assumée : le dossier des ressources est celui où le contrat est *déclaré*.

## Application

- `app/Http/Resources/Bases/BaseResource.php` — `iso()` durci, `calendarDate()` ajouté.
- Les 45 fichiers de `app/Http/Resources/` — 138 lignes converties, **puis 7 champs de plus le
  2026-08-20** (`SettingResource`, `IntegrationResource`, `Api/Admin/ModerationItemResource`), que
  l'inventaire initial n'avait pas vus faute de conversion écrite à trouver. Compte courant :
  **146 clés de date, 145 conformes, 1 exception écrite.**
- `takussan-api/tests/Unit/Http/Resources/DateRepresentationTest.php` — fige les deux chaînes
  exactes, y compris sur une instance non-UTC (le seul cas où l'ancien `iso()` divergeait).
- `scripts/check-resource-date-format.mjs` (Repo CI) — **inventaire positif** des dates émises
  (contrôle B), liste noire des conversions écrites à la main (contrôle C), et **non-vacuité**
  (contrôle A) : dossier présent, planchers de fichiers / de clés de date / de sites conformes,
  helpers et formats toujours déclarés sur `BaseResource`, `->utc()` présent dans le **code** et pas
  seulement dans son docblock, et chaque exception justifiée correspondant encore à un site réel.
  Prouvée par **huit mutations**, chacune faisant sortir la garde en 1 — dont l'attribut Carbon
  brut, la chaîne SQL brute et une clé de date ajoutée sans helper.
- `node scripts/check-resource-date-format.mjs --report` — l'inventaire, **dérivé à chaque
  exécution**, jamais recopié.
