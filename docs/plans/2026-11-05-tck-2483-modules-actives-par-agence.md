# TCK-2483 — Modules par agence : plan d'implémentation

> **Pour les agents :** sous-compétence requise — `superpowers:subagent-driven-development` (recommandé)
> ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`). Règles communes :
> `brief-commun.md` de la session (tests ciblés seulement, ablations dans un script, rapport au fil de l'eau).
>
> ⚠ **Le ticket dit `depends_on: [TCK-2478]`, mais ce plan est écrit contre l'état que TCK-2479 laisse**
> (`AppSidebar` avec la bande « À traiter », relevé sur `feat/bande-a-traiter-tck-2479`, b837e053e).
> Branche à tirer de `dev` à jour : `feat/modules-par-agence-tck-2483`. **La tâche 1 (API) est
> indépendante** et peut partir tout de suite ; les tâches 2 à 5 attendent TCK-2479 sur `dev`.
>
> ⚠ Si TCK-2480, TCK-2481 ou TCK-2482 est sur `dev` quand on commence, lire d'abord la section
> « Ce qu'on suppose des tickets voisins ».

**But :** l'admin d'une agence `standard` décoche, dans la fiche de son agence, les modules que
l'agence n'utilise pas ; ils disparaissent du menu de son personnel — le sien compris — sans qu'aucun
droit ne change ni qu'aucune page ne cesse d'être servie.

**Architecture :**
- **API** : `agencies.settings.hidden_modules`, une liste fermée (`App\Models\Enums\AgencyModule`),
  déclarée dans le catalogue `AgencySettings` (nouveau type `list`), écrite par la route existante
  `PATCH /api/agencies/{id}` sous `configure`, refusée à une agence `individual`.
- **Navigation pure** : `src/lib/navigation/modules.ts` (codes, table code → identifiants du
  catalogue, lecture tolérante, `destinationsMasquees`) ; `ContexteDeMenu.masquees` ; `estOuverte`
  la refuse ; `composerMenu` ne la garde pour juger le persona que s'il est `agent` ou `admin-agence`
  (le complément, jugé sur l'espace, la garde toujours).
- **Câblage** : le layout de `/app` lit les modules sur l'agence qu'il lit déjà ; `AppShell` →
  `AppSidebar` → contexte du menu.
- **Écran** : section « Menu de l'équipe » d'`AgencyConfigForm`.

**Pile :** Laravel 13 / PHP 8.4 ; Next.js 16, React 19, TypeScript 5, zod 4, react-hook-form,
vitest 4 + Testing Library, next-intl.

**Références :** [ADR-0089, amendement « modules par agence »](../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md#amendement--modules-par-agence-tck-2483-2026-11-05) ·
[TCK-2483](../backlog/tickets/done/TCK-2483-modules-actives-par-agence.md) (contrat backend PRESCRIPTIF) ·
plans précédents : [TCK-2478](2026-11-05-tck-2478-dispositions-par-persona.md),
[TCK-2479](2026-11-05-tck-2479-bande-a-traiter-et-demarrer.md).

## Contraintes globales

- **Affichage seulement.** Ni l'API ni une garde de page ne lisent `hidden_modules` ; une page
  masquée reste servie par lien direct. Une garde (tâche 2) le tient côté front.
- **Le persona non-personnel garde ce qu'il ouvre** (bailleur, locataire, client, prestataire) ;
  le masquage ne vaut que pour la disposition de l'agent et de l'admin, et pour « Aussi … ».
- **Une seule porte** : `estOuverte` n'est appelée que dans `src/lib/navigation/` ; tout appelant de
  `composerMenu` pose `masquees` (garde, tâche 2).
- Chaque clé i18n neuve en `fr`, `en`, `wo` (le `wo` porte le français tel quel, wolof en pause).
- Pas de `useMemo`/`useCallback` neuf (React Compiler). Aucune dépendance neuve. Aucune Radix.
  `md:` n'est pas le bureau dans `/app` (TCK-505) : la section reste en une colonne.
- Tests : les fichiers touchés, jamais une suite entière. Ablations dans UN script écrit avec Write,
  lancé par `bash fichier.sh`, puis `git diff` vide de toute mutation.
- Commits en français, préfixés, citant `TCK-2483`, terminés par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. API : `./vendor/bin/pint` sur les fichiers
  touchés ; front : `npx tsc --noEmit && npm run lint && npm run check:i18n` avant chaque commit.

---

## Relevés (mesurés le 2026-11-05 sur `feat/bande-a-traiter-tck-2479`, b837e053e)

> Re-mesurer avant d'implémenter : le code a pu bouger. Un écart se corrige au plus juste et s'écrit.

### R1 — Le catalogue des réglages d'agence

`takussan-api/app/Domain/Settings/AgencySettings.php` : `catalog()` (sept clés, types `bool`, `int`,
`string`), `rules()` (préfixe `settings.`), `read()` — qui rend le défaut sur toute valeur non
scalaire **avant** le `match` des types (l. « ⚠ Avant `filter_var` ») : une liste y retomberait
toujours au défaut, d'où un traitement du type `list` AVANT cette garde. `Rule` y est déjà importé.

### R2 — L'écriture

- `AgencyUpdateRequest::authorize()` → `can('configure', agency)` (TCK-2024) : l'agent rend **403**
  avant toute validation. `rules()` étale `...AgencySettings::rules()` puis `legalRules()` et
  `slugRules()` ; `isIndividual()` lit l'agence de la route.
- `AgencyController::update` : `array_replace($locked->settings ?? [], $data['settings'])` puis
  `array_filter(… !== null)` — fusion de **premier niveau** : la liste est remplacée en bloc, `null`
  retire la clé, `[]` est gardé.
- Laravel 13 : `list` = `is_array && array_is_list` ; `prohibited` = « non requis » (donc `null` et
  `[]` passent) — relus dans `ValidatesAttributes.php`.

### R3 — La lecture

- `AgencyResource` rend `settings` (moins les clés d'onboarding) sans condition de capacité ;
  `AgencyController::show` charge le modèle lié à la route (les `fields[agencies]` du front ne
  s'appliquent pas à `show`, et `settings` n'est pas dans `$queryFields` : sans effet ici).
- Le layout `src/app/(dashboard)/app/layout.tsx` lit l'agence par `resolveAgencyOrNull` (mise en
  cache pour le rendu) dans deux branches : `agency_admin`, puis agent OU bailleur. Rien d'autre à
  lire.

### R4 — Le moteur du menu

- `estOuverte` (`src/lib/navigation/catalogue.ts`, fin du fichier) : `accessible(ctx) && !(ecriture &&
  agenceSuspendue)`. Appelée, hors tests, par `composer-menu.ts` seul.
- `composerMenu` (`composer-menu.ts`) construit `ctxPersona = { ...ctx, roles: rolesDuPersona(…),
  rolesDeLEspace: ctx.roles }` ; `juge(d)` = `ctx` pour une destination `surLEspace`, sinon
  `ctxPersona` ; « Aussi … » : `if (estOuverte(d, juge(d))) continue;` puis `prendre(d, 'aussi', ctx)`.
  Appelée, hors tests, par `AppSidebar.tsx` seul.
- Les destinations des modules : `commissions` (`personnel`), `etats-des-lieux` (client, personnel,
  bailleur), `entrees-en-attente` (`personnel`), `carnet-prestataires` (`isAdmin`), `calendrier`
  (agent, bailleur, admin, prestataire), `credits` (`isAdmin`), `kpis`, `alertes` (`isAdmin`),
  `exports` (admin, agent, bailleur). **Aucune ne porte de compteur**, aucune n'est `ecriture`,
  `surLEspace`, page d'agence ni action d'une disposition. Toutes sont au menu de `admin-agence`.
- Les onglets proposés par le plan de TCK-2481 (R6) ne citent aucune destination de module.

### R5 — Le formulaire de la fiche

- `src/components/admin-agency/AgencyConfigForm.tsx` : `toDefaults(agency)`, `normaliseAgencyForm`
  (`src/lib/schemas/agency.ts`) n'émet dans `settings` que `require_team_two_factor` et
  `late_fee_online_collection` (TCK-593) ; `individual = agency.kind === 'individual'` ; la dernière
  section est « Sécurité » (`t('security.title')`, encadré cliquable, case native) ; `t` =
  `useTranslations('admin.agencyConfig')`. `onSuccess` appelle `router.refresh()` : le layout de
  `/app` est rejoué, le menu suit sans rechargement.
- Trois tests figent EXACTEMENT les clés de `settings` envoyées et changeront exprès :
  `AgencyConfigForm.penalites.test.tsx` (« n'envoie que les clés gérées »),
  `AgencyConfigForm.test.tsx` (TCK-962, `Object.keys(payload.settings)`), et
  `src/lib/__tests__/admin-schemas.test.ts` (TCK-962, plus deux objets `base` à compléter).

### R6 — Le patron de parité

`src/types/__tests__/user-status.parity.test.ts` lit l'enum PHP par expression régulière
(`case\s+\w+\s*=\s*'([a-z_]+)';`). `.github/workflows/web-ci.yml` liste, dans ses deux blocs
`paths:` (`pull_request` et `push`), les fichiers de l'API qu'une garde du front compare
(`ActiveProfileResolver.php`…) : *les deux côtés qu'une garde compare doivent la déclencher.*

## Ce qu'on suppose des tickets voisins

- **TCK-2480** (épingles) : son plan juge une épingle par `estOuverte` (« un identifiant inconnu ou
  fermé est ignoré au rendu ») → une épingle vers une destination masquée est ignorée sans rien
  ajouter. S'il est sur `dev`, l'appel de `composerMenu` dans `AppSidebar` a pris un argument de
  préférences : ajouter `masquees` au contexte, quelle que soit la forme de l'appel.
- **TCK-2481** (onglets) : `ongletsDuMenu` lit le menu COMPOSÉ → hérite. S'il compose son propre
  menu ailleurs qu'`AppSidebar`, la garde « tout appelant de `composerMenu` pose `masquees` » le
  dira ; y poser `masquees` de la même façon.
- **TCK-2482** (palette) : doit lister le menu composé ; la garde « `estOuverte` seulement dans
  `lib/navigation/` » refuse l'autre voie. S'il est sur `dev`, ajouter le test de l'AC10 sur la
  palette montée.

## Carte des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| Créer `takussan-api/app/Models/Enums/AgencyModule.php` | la liste fermée | 1 |
| Modifier `takussan-api/app/Domain/Settings/AgencySettings.php` | type `list`, `hidden_modules` | 1 |
| Modifier `takussan-api/app/Http/Requests/AgencyUpdateRequest.php` | `prohibited` en `individual` | 1 |
| Créer `takussan-api/tests/Feature/Api/Agency/AgencyModulesSettingsTest.php` | le contrat | 1 |
| Créer `takussan-web/src/lib/navigation/modules.ts` | codes, table, lecture, ensemble masqué | 2 |
| Modifier `takussan-web/src/lib/navigation/types.ts` | `ContexteDeMenu.masquees` | 2 |
| Modifier `takussan-web/src/lib/navigation/catalogue.ts` | `estOuverte` | 2 |
| Modifier `takussan-web/src/lib/navigation/composer-menu.ts` | la règle du personnel | 2 |
| Créer `src/lib/navigation/__tests__/modules.test.ts`, `modules.parity.test.ts` | gardes | 2 |
| Modifier `src/lib/navigation/__tests__/composer-menu.test.ts` | sémantique + invariant | 2 |
| Modifier `.github/workflows/web-ci.yml` | déclenchement sur l'enum | 2 |
| Modifier `takussan-web/src/types/agency.ts` | `AgencySettings.hidden_modules` | 3 |
| Modifier `src/app/(dashboard)/app/layout.tsx`, `src/components/layout/AppShell.tsx`, `AppSidebar.tsx` | câblage | 3 |
| Créer `src/app/(dashboard)/app/__tests__/layout.modules.test.tsx` | le layout lit | 3 |
| Modifier `src/components/layout/__tests__/AppSidebar.test.tsx` | la barre montée | 3 |
| Modifier `src/lib/schemas/agency.ts`, `src/components/admin-agency/AgencyConfigForm.tsx` | l'écran | 4 |
| Modifier `src/messages/{fr,en,wo}.json` | `admin.agencyConfig.modules.*` | 4 |
| Créer `src/components/admin-agency/__tests__/AgencyConfigForm.modules.test.tsx` | l'écran | 4 |
| Modifier les trois tests de R5 | clés de `settings` | 4 |

---

### Tâche 1 : l'API — `hidden_modules` (indépendante)

**Fichiers :** voir la carte, lignes « 1 ». Dossier de travail : `takussan-api/`.

**Interfaces :**
- Produit : `App\Models\Enums\AgencyModule` (7 cas) ; `AgencySettings::rules()` porte
  `settings.hidden_modules` et `settings.hidden_modules.*` ; `AgencySettings::read($s, 'hidden_modules'): list<string>`.

- [ ] **Étape 1 : écrire le test qui échoue** — créer `tests/Feature/Api/Agency/AgencyModulesSettingsTest.php` :

```php
<?php

namespace Tests\Feature\Api\Agency;

use App\Domain\Settings\AgencySettings;
use App\Http\Requests\AgencyUpdateRequest;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — `settings.hidden_modules` : les modules
 * qu'un admin d'agence `standard` retire du menu de son personnel.
 *
 * Un réglage d'AFFICHAGE : ce test n'éprouve que son écriture et sa lecture. Qu'aucun droit ni
 * aucune page n'en dépende se garde côté front (`modules.test.ts`).
 */
class AgencyModulesSettingsTest extends ApiTestCase
{
    use RefreshDatabase;

    /**
     * @param  array<string, mixed>  $settings
     * @return array{User, Agency}
     */
    private function admin(array $settings = [], bool $individual = false): array
    {
        $admin = User::factory()->create();
        $factory = $individual ? Agency::factory()->individual() : Agency::factory();
        $agency = $factory->create(['primary_admin_id' => $admin->id, 'settings' => $settings]);

        return [$admin, $agency];
    }

    private function agentDe(Agency $agency): User
    {
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);

        return $agent;
    }

    public function test_l_admin_masque_des_modules_et_l_agent_les_relit(): void
    {
        [$admin, $agency] = $this->admin();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", [
            'settings' => ['hidden_modules' => ['commissions', 'analytics']],
        ])->assertOk();

        $this->assertSame(['commissions', 'analytics'], $agency->refresh()->settings['hidden_modules']);

        Sanctum::actingAs($this->agentDe($agency));
        $this->getJson("/api/agencies/{$agency->id}")
            ->assertOk()
            ->assertJsonPath('data.settings.hidden_modules', ['commissions', 'analytics']);
    }

    public function test_les_autres_reglages_sont_intacts(): void
    {
        [$admin, $agency] = $this->admin(['watermark_enabled' => false]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", [
            'settings' => ['hidden_modules' => ['calendar']],
        ])->assertOk();

        $this->assertFalse($agency->refresh()->settings['watermark_enabled']);
    }

    /**
     * @return array<string, array{mixed, string}>
     */
    public static function valeursRefusees(): array
    {
        return [
            'code inconnu' => [['payments'], 'settings.hidden_modules.0'],
            'doublon' => [['calendar', 'calendar'], 'settings.hidden_modules.1'],
            'objet, pas une liste' => [['a' => 'calendar'], 'settings.hidden_modules'],
            'chaîne' => ['calendar', 'settings.hidden_modules'],
            'entier' => [[1], 'settings.hidden_modules.0'],
        ];
    }

    #[DataProvider('valeursRefusees')]
    public function test_une_valeur_hors_regle_est_refusee(mixed $valeur, string $cleEnErreur): void
    {
        [$admin, $agency] = $this->admin(['hidden_modules' => ['credits']]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => $valeur]])
            ->assertStatus(422)
            ->assertJsonValidationErrors($cleEnErreur);

        $this->assertSame(['credits'], $agency->refresh()->settings['hidden_modules']);
    }

    public function test_null_rend_le_defaut(): void
    {
        [$admin, $agency] = $this->admin(['hidden_modules' => ['credits']]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => null]])->assertOk();

        $agency->refresh();
        $this->assertArrayNotHasKey('hidden_modules', $agency->settings ?? []);
        $this->assertSame([], $agency->setting('hidden_modules'));
    }

    public function test_une_liste_vide_est_acceptee(): void
    {
        [$admin, $agency] = $this->admin(['hidden_modules' => ['credits']]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => []]])->assertOk();

        $this->assertSame([], $agency->refresh()->setting('hidden_modules'));
    }

    public function test_une_agence_individuelle_ne_masque_rien(): void
    {
        [$admin, $agency] = $this->admin(individual: true);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => ['calendar']]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings.hidden_modules');

        $this->assertArrayNotHasKey('hidden_modules', $agency->refresh()->settings ?? []);
    }

    public function test_un_agent_ne_peut_pas_ecrire(): void
    {
        [, $agency] = $this->admin();
        Sanctum::actingAs($this->agentDe($agency));

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => ['calendar']]])
            ->assertForbidden();

        $this->assertArrayNotHasKey('hidden_modules', $agency->refresh()->settings ?? []);
    }

    public function test_la_lecture_ne_rend_que_des_codes_connus(): void
    {
        $this->assertSame(['calendar'], AgencySettings::read(['hidden_modules' => ['calendar', 'obsolete', 3, 'calendar']], 'hidden_modules'));
        $this->assertSame([], AgencySettings::read(['hidden_modules' => 'calendar'], 'hidden_modules'));
        $this->assertSame([], AgencySettings::read(['hidden_modules' => ['x' => 'calendar']], 'hidden_modules'));
        $this->assertSame([], AgencySettings::read(null, 'hidden_modules'));
    }

    public function test_les_regles_viennent_du_catalogue(): void
    {
        $regles = (new AgencyUpdateRequest)->rules();

        $this->assertArrayHasKey('settings.hidden_modules', $regles);
        $this->assertArrayHasKey('settings.hidden_modules.*', $regles);
    }
}
```

- [ ] **Étape 2 : lancer, constater l'échec**

Run : `php artisan test tests/Feature/Api/Agency/AgencyModulesSettingsTest.php`
Attendu : FAIL — la clé n'a pas de règle (`validated()` la retire : 200 sans rien écrire, `Undefined
array key`), `AgencySettings::read` lève `InvalidArgumentException`.

⚠ Si `test_l_admin_masque…` rougit sur le `GET` de l'agent (404), c'est `visibleAgencyIds` qui ne
voit pas l'agence sans profil actif : poser l'en-tête `X-Active-Profile-Hint` du profil d'agent
(`agent:<id>`) dans l'appel, et l'écrire dans les notes — ne pas changer le contrôleur.

- [ ] **Étape 3 : l'enum** — créer `app/Models/Enums/AgencyModule.php` :

```php
<?php

namespace App\Models\Enums;

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — les modules qu'un admin d'agence
 * `standard` peut masquer du menu de son personnel (`agencies.settings.hidden_modules`).
 *
 * AFFICHAGE seulement : aucun code de l'API ne lit ce réglage pour décider d'un droit. Le front
 * associe chaque cas aux destinations de son catalogue (`takussan-web/src/lib/navigation/modules.ts`),
 * et `modules.parity.test.ts` y lit CE fichier : un cas ajouté ici sans le front rougit là-bas.
 */
enum AgencyModule: string
{
    case Commissions = 'commissions';
    case Inventories = 'inventories';
    case MoveInFollowUp = 'move_in_follow_up';
    case ProviderBook = 'provider_book';
    case Calendar = 'calendar';
    case Credits = 'credits';
    case Analytics = 'analytics';
}
```

- [ ] **Étape 4 : le type `list` d'`AgencySettings`** — dans `app/Domain/Settings/AgencySettings.php` :

Ajouter `use App\Models\Enums\AgencyModule;`, la constante `private const LIST = 'list';` sous
`STRING`, et compléter le docblock de `catalog()` :

```php
     * @return array<string, array{type: string, default: mixed, rules: array<int, mixed>, enum?: class-string<\BackedEnum>}>
```

En fin du tableau de `catalog()` :

```php
            // TCK-2483 (ADR-0089, amendement « modules par agence ») — les modules que l'agence retire
            // du menu de son personnel. AFFICHAGE : aucun droit, aucune garde n'en dépend.
            // `AgencyUpdateRequest` la refuse à une agence `individual` (aucune équipe). Liste remplacée
            // en bloc par la fusion de premier niveau du contrôleur ; `null` rend le défaut.
            'hidden_modules' => [
                'type' => self::LIST, 'default' => [], 'enum' => AgencyModule::class,
                'rules' => ['sometimes', 'nullable', 'array', 'list', 'max:'.count(AgencyModule::cases())],
            ],
```

Remplacer le corps de `rules()` :

```php
        $rules = [];
        foreach (self::catalog() as $key => $entry) {
            $rules["settings.{$key}"] = $entry['rules'];
            // TCK-2483 — une liste valide aussi chacun de ses éléments : un cas de son enum, une fois.
            if ($entry['type'] === self::LIST) {
                $rules["settings.{$key}.*"] = ['string', 'distinct', Rule::enum($entry['enum'])];
            }
        }

        return $rules;
```

Dans `read()`, juste après `$value = $settings[$key] ?? null;` :

```php
        // TCK-2483 — une liste se lit AVANT la garde des scalaires, qui la renverrait au défaut. Un code
        // que l'enum ne connaît plus (module retiré) est ignoré, pas une erreur.
        if ($entry['type'] === self::LIST) {
            return is_array($value) && array_is_list($value)
                ? self::knownCases($value, $entry['enum'])
                : $entry['default'];
        }
```

et, avant `entry()` :

```php
    /**
     * TCK-2483 — les seules valeurs d'une liste qui sont des cas de son enum, sans doublon.
     *
     * @param  list<mixed>  $values
     * @param  class-string<\BackedEnum>  $enum
     * @return list<string>
     */
    private static function knownCases(array $values, string $enum): array
    {
        $known = array_filter($values, static fn (mixed $v): bool => is_string($v) && $enum::tryFrom($v) !== null);

        return array_values(array_unique($known));
    }
```

- [ ] **Étape 5 : l'agence `individual`** — dans `AgencyUpdateRequest::rules()`, juste après
  `...AgencySettings::rules(),` :

```php
            // TCK-2483 (ADR-0089, amendement) — une agence `individual` n'a pas d'équipe dont masquer
            // le menu : la clé y serait un réglage sans effet. `null` et `[]` passent (`prohibited`).
            ...($this->isIndividual() ? ['settings.hidden_modules' => ['prohibited']] : []),
```

- [ ] **Étape 6 : vert, et les voisins**

Run : `php artisan test tests/Feature/Api/Agency/AgencyModulesSettingsTest.php tests/Feature/Api/Agency/AgencySettingsWritableTest.php tests/Feature/Api/Agency/AgencySettingAccessorTest.php tests/Feature/Api/Agency/AgencySettingsMergeTest.php`
Attendu : tout vert. Puis `php bin/impacted-tests.php --run --connus`.

- [ ] **Étape 7 : ablations** — un script `scratchpad/ablations-2483-api.sh` (Write, puis `bash`) qui,
  pour chacune, applique la mutation par `perl -0pi`, lance le seul test visé, note rouge/vert, puis
  `git checkout -- <fichier>` :
  1. retirer `, Rule::enum($entry['enum'])` → « code inconnu » rougit ;
  2. retirer `'distinct', ` → « doublon » rougit ;
  3. retirer `'list', ` → « objet, pas une liste » rougit ;
  4. retirer la ligne `...($this->isIndividual() ? …` → `test_une_agence_individuelle…` rougit ;
  5. remplacer le corps de `knownCases` par `return array_values($values);` → `test_la_lecture…` rougit.

  Puis `git diff --stat` : seuls les fichiers de la tâche.

- [ ] **Étape 8 : commit** — `./vendor/bin/pint app/Models/Enums/AgencyModule.php app/Domain/Settings/AgencySettings.php app/Http/Requests/AgencyUpdateRequest.php tests/Feature/Api/Agency/AgencyModulesSettingsTest.php`,
  `status: doing` dans le ticket + `node docs/backlog/ranger-tickets.mjs`. Commit :
  `feat(api): les modules qu'une agence masque du menu de son personnel, liste fermée (TCK-2483)`.

---

### Tâche 2 : la navigation pure — modules, `masquees`, gardes

**Fichiers :** voir la carte, lignes « 2 ». Dossier : `takussan-web/`.

**Interfaces :**
- Produit : `CODES_DE_MODULE`, `type CodeDeModule`, `MODULES_D_AGENCE`, `PERSONAS_DU_PERSONNEL`,
  `modulesMasquesDe(settings: unknown): CodeDeModule[]`,
  `destinationsMasquees(modules: readonly string[]): ReadonlySet<IdDestination>` ;
  `ContexteDeMenu.masquees?: ReadonlySet<string>`.

- [ ] **Étape 1 : les tests qui échouent** — créer `src/lib/navigation/__tests__/modules.test.ts` :

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, type IdDestination } from '../catalogue';
import { composerMenu, entreesDuMenu } from '../composer-menu';
import { DISPOSITIONS } from '../dispositions';
import { CODES_DE_MODULE, destinationsMasquees, MODULES_D_AGENCE, modulesMasquesDe } from '../modules';
import { PERSONAS } from '../personas';
import type { ContexteDeMenu } from '../types';

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — les gardes des modules : ce qui ne se
 * masque jamais, et les portes par lesquelles le masquage ne se contourne pas.
 */
const PAR_ID = new Map(CATALOGUE.map((d) => [d.id, d]));
const MASQUABLES = CODES_DE_MODULE.flatMap((c) => MODULES_D_AGENCE[c]);
/** La liste de l'amendement, point 3. Le reste des interdits est une RÈGLE, éprouvée plus bas. */
const JAMAIS: readonly IdDestination[] = ['tableau-de-bord', 'messagerie', 'mes-biens', 'baux', 'paiements', 'demandes'];

describe('TCK-2483 — les modules d’agence', () => {
  it('chaque module retire au moins une destination, et une destination n’est que dans un module', () => {
    for (const code of CODES_DE_MODULE) expect(MODULES_D_AGENCE[code].length, code).toBeGreaterThan(0);
    expect(new Set(MASQUABLES).size).toBe(MASQUABLES.length);
  });

  it('jamais l’indispensable (liste de l’amendement)', () => {
    expect(MASQUABLES.filter((id) => JAMAIS.includes(id))).toEqual([]);
  });

  it('jamais par règle : compteur, page d’agence, écriture, jugée sur l’espace, action principale', () => {
    const actions = new Set<string>(PERSONAS.flatMap((p) => DISPOSITIONS[p].action));
    for (const id of MASQUABLES) {
      const d = PAR_ID.get(id)!;
      expect(d.compteur, `${id} porte un compteur : ce qui attend ne disparaît pas`).toBeUndefined();
      expect(d.espace, `${id} est une page d’agence (PAGES_ADMIN)`).toBeUndefined();
      expect(d.ecriture, id).toBeUndefined();
      expect(d.surLEspace, id).toBeUndefined();
      expect(actions.has(id), `${id} est une action principale`).toBe(false);
    }
  });

  it('chaque destination masquable est au menu de l’agent ou de l’admin (sinon le module ne retire rien)', () => {
    const admin: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [] };
    const agent: ContexteDeMenu = { roles: ['customer', 'agent'], capacites: ['properties.create'], cheminsAdmin: [] };
    const rendus = new Set(
      [...entreesDuMenu(composerMenu(admin, 'admin-agence')), ...entreesDuMenu(composerMenu(agent, 'agent'))].map((e) => e.id),
    );
    expect(MASQUABLES.filter((id) => !rendus.has(id))).toEqual([]);
  });

  it('lit `settings.hidden_modules` avec tolérance, dans l’ordre des codes', () => {
    expect(modulesMasquesDe(null)).toEqual([]);
    expect(modulesMasquesDe({})).toEqual([]);
    expect(modulesMasquesDe({ hidden_modules: 'calendar' })).toEqual([]);
    expect(modulesMasquesDe({ hidden_modules: ['analytics', 'obsolete', 3, 'calendar'] })).toEqual(['calendar', 'analytics']);
  });

  it('destinationsMasquees déroule les modules et ignore un code inconnu', () => {
    expect([...destinationsMasquees(['analytics', 'obsolete'])].sort()).toEqual(['alertes', 'exports', 'kpis']);
    expect(destinationsMasquees([]).size).toBe(0);
  });
});

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

describe('TCK-2483 — le masquage ne se contourne pas', () => {
  const SOURCES = fichiers(SRC).map((f) => ({ f: relative(SRC, f), texte: readFileSync(f, 'utf8') }));

  it('aucun fichier hors de lib/navigation n’appelle `estOuverte` (la palette lit le menu composé)', () => {
    const fautifs = SOURCES.filter(({ f, texte }) => !f.startsWith('lib/navigation/') && /\bestOuverte\(/.test(texte));
    expect(fautifs.map(({ f }) => f)).toEqual([]);
  });

  it('tout appelant de `composerMenu` pose `masquees` (`destinationsMasquees`)', () => {
    const appelants = SOURCES.filter(({ f, texte }) => f !== 'lib/navigation/composer-menu.ts' && /\bcomposerMenu\(/.test(texte));
    expect(appelants.length, 'aucun appelant trouvé : le motif est à revoir').toBeGreaterThan(0);
    expect(appelants.filter(({ texte }) => !/\bdestinationsMasquees\(/.test(texte)).map(({ f }) => f)).toEqual([]);
  });

  it('`hidden_modules` n’est lu par aucune page ni aucune garde — affichage seulement', () => {
    const AUTORISES = ['lib/navigation/modules.ts', 'lib/schemas/agency.ts', 'types/agency.ts', 'components/admin-agency/AgencyConfigForm.tsx'];
    const lecteurs = SOURCES.filter(({ texte }) => texte.includes('hidden_modules')).map(({ f }) => f);
    expect(lecteurs.filter((f) => !AUTORISES.includes(f))).toEqual([]);
  });
});
```

Créer `src/lib/navigation/__tests__/modules.parity.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CODES_DE_MODULE } from '../modules';

/**
 * TCK-2483 — parité des codes de module entre le front et `App\Models\Enums\AgencyModule`, qui VALIDE
 * `settings.hidden_modules`. Un code seulement au front serait refusé en 422 à l'enregistrement ; un
 * code seulement à l'API se masquerait sans rien retirer.
 *
 * ⚠ CE QU'IL NE PROUVE PAS : que la table code → destinations soit juste (c'est `modules.test.ts`).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const ENUM = join(ROOT, 'takussan-api', 'app', 'Models', 'Enums', 'AgencyModule.php');

function codesDuBack(): string[] {
  const php = readFileSync(ENUM, 'utf8');
  expect(php, `enum AgencyModule introuvable dans ${ENUM}`).toContain('enum AgencyModule: string');
  const codes = [...php.matchAll(/case\s+\w+\s*=\s*'([a-z_]+)';/g)].map((m) => m[1]);
  expect(codes.length, 'aucun cas extrait d’AgencyModule — la garde n’aurait rien vérifié').toBeGreaterThan(0);
  return codes;
}

describe('parité CODES_DE_MODULE ↔ App\\Models\\Enums\\AgencyModule', () => {
  it('le front déclare exactement les modules que l’API accepte, dans le même ordre', () => {
    expect([...CODES_DE_MODULE]).toEqual(codesDuBack());
  });
});
```

Ajouter à `src/lib/navigation/__tests__/composer-menu.test.ts` (imports : `destinationsMasquees`,
`PERSONAS_DU_PERSONNEL` de `../modules`) :

```ts
describe('TCK-2483 — les modules masqués par l’agence', () => {
  const ids = (menu: ReturnType<typeof composerMenu>) => [
    ...entreesDuMenu(menu).map((e) => e.id),
    ...(menu.action ? [menu.action.id] : []),
    ...(menu.carte ? [menu.carte.id] : []),
  ];
  const groupe = (menu: ReturnType<typeof composerMenu>, id: string) =>
    menu.groupes.find((g) => g.id === id)?.entrees.map((e) => e.id) ?? [];

  it('l’agent ne voit plus ce que l’agence masque — ni groupe, ni « Plus », ni « Aussi »', () => {
    const ctx: ContexteDeMenu = {
      roles: ['customer', 'agent', 'agency_admin'],
      capacites: ['properties.create'],
      cheminsAdmin: [],
      masquees: destinationsMasquees(['commissions', 'inventories', 'analytics']),
    };
    const rendus = ids(composerMenu(ctx, 'agent'));
    for (const id of ['commissions', 'etats-des-lieux', 'kpis', 'alertes', 'exports'] as const) {
      expect(rendus, id).not.toContain(id);
    }
    expect(rendus).toContain('calendrier');
  });

  it('l’admin aussi : il voit le menu de son équipe', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [], masquees: destinationsMasquees(['credits']) };
    expect(ids(composerMenu(ctx, 'admin-agence'))).not.toContain('credits');
  });

  it.each([
    ['bailleur', ['customer', 'owner'], 'mon-patrimoine'],
    ['locataire', ['customer', 'tenant'], 'mon-logement'],
  ] as const)('%s garde ses états des lieux dans « %s »', (persona, roles, idGroupe) => {
    const ctx: ContexteDeMenu = { roles: [...roles], capacites: [], cheminsAdmin: [], masquees: destinationsMasquees(['inventories']) };
    expect(groupe(composerMenu(ctx, persona), idGroupe)).toContain('etats-des-lieux');
  });

  it('le bailleur qui est aussi admin : « Aussi administrateur » perd les modules masqués, pas ses paiements', () => {
    const ctx: ContexteDeMenu = {
      roles: ['customer', 'agency_admin', 'owner'],
      capacites: ['properties.create'],
      cheminsAdmin: [],
      masquees: destinationsMasquees(['commissions', 'analytics']),
    };
    const aussi = groupe(composerMenu(ctx, 'bailleur'), 'aussi');
    expect(aussi).not.toContain('commissions');
    expect(aussi).not.toContain('kpis');
    expect(aussi).toContain('vue-agence');
    expect(groupe(composerMenu(ctx, 'admin-agence'), 'aussi')).toContain('paiements');
  });

  // AC5 — l'invariant « rien n'est perdu », tous modules masqués : ce que la règle de l'amendement
  // ouvre, ni plus ni moins. Le persona non-personnel se juge SANS masque ; l'espace, AVEC.
  it.each(PERSONAS)('%s : rien n’est perdu, tous modules masqués', (persona) => {
    const masquees = destinationsMasquees(['commissions', 'inventories', 'move_in_follow_up', 'provider_book', 'calendar', 'credits', 'analytics']);
    for (const base of contextes()) {
      const ctx: ContexteDeMenu = { ...base, masquees };
      const menu = composerMenu(ctx, persona);
      const ctxPersona: ContexteDeMenu = {
        ...ctx,
        roles: rolesDuPersona(ctx.roles, persona),
        rolesDeLEspace: ctx.roles,
        masquees: PERSONAS_DU_PERSONNEL.has(persona) ? masquees : new Set(),
      };
      const rendus = new Set([...entreesDuMenu(menu).map((e) => e.href), ...(menu.carte ? [menu.carte.href] : [])]);
      if (menu.action) rendus.add(menu.action.href);
      const attendus = new Set(
        CATALOGUE.filter((d) => estOuverte(d, ctx) || estOuverte(d, d.surLEspace ? ctx : ctxPersona)).map((d) => d.href),
      );
      expect(rendus, `${persona} / ${ctx.roles.join('+')}`).toEqual(attendus);
    }
  });
});
```

- [ ] **Étape 2 : lancer, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/modules.test.ts src/lib/navigation/__tests__/modules.parity.test.ts src/lib/navigation/__tests__/composer-menu.test.ts`
Attendu : FAIL (`../modules` introuvable).

- [ ] **Étape 3 : `types.ts`** — dans `ContexteDeMenu`, après `rolesDeLEspace` :

```ts
  /**
   * TCK-2483 (ADR-0089, amendement « modules par agence ») — les destinations que l'agence du profil
   * actif retire du menu de son personnel (`destinationsMasquees`). Un fait de l'AGENCE, comme
   * `agenceSuspendue` : `estOuverte` le refuse, et `composerMenu` ne le garde, pour juger le
   * persona, que si le persona est du personnel ; il le garde toujours pour juger l'espace.
   */
  readonly masquees?: ReadonlySet<string>;
```

- [ ] **Étape 4 : `catalogue.ts`** — remplacer `estOuverte` :

```ts
/**
 * Ouverte au compte : son prédicat d'accès, jamais une écriture dans un espace suspendu (TCK-600),
 * jamais une destination que l'agence masque quand le contexte la porte (TCK-2483).
 *
 * ⚠ TCK-2483 — appelée dans `src/lib/navigation/` SEULEMENT (`modules.test.ts`) : la palette, les
 * onglets et tout autre écran lisent le menu COMPOSÉ, qui sait à quel persona le masque s'applique.
 */
export function estOuverte(destination: Destination, ctx: ContexteDeMenu): boolean {
  return (
    destination.accessible(ctx) &&
    !(destination.ecriture && ctx.agenceSuspendue) &&
    !ctx.masquees?.has(destination.id)
  );
}
```

- [ ] **Étape 5 : créer `src/lib/navigation/modules.ts`**

```ts
import type { IdDestination } from './catalogue';
import type { Persona } from './personas';

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — les modules qu'un admin d'agence
 * `standard` retire du menu de son personnel (`agencies.settings.hidden_modules`).
 *
 * Les CODES sont ceux de `App\Models\Enums\AgencyModule`, qui valide l'écriture
 * (`modules.parity.test.ts`) ; la TABLE vers le catalogue appartient au front (principe 5).
 * AFFICHAGE seulement : aucune page, aucune garde ne lit ce réglage (`modules.test.ts`).
 *
 * Ne s'y ajoute jamais une destination à compteur, d'écriture, jugée sur l'espace, une page
 * d'agence ni une action principale — `modules.test.ts` le refuse.
 */
export const CODES_DE_MODULE = [
  'commissions',
  'inventories',
  'move_in_follow_up',
  'provider_book',
  'calendar',
  'credits',
  'analytics',
] as const;

export type CodeDeModule = (typeof CODES_DE_MODULE)[number];

export const MODULES_D_AGENCE: Record<CodeDeModule, readonly IdDestination[]> = {
  commissions: ['commissions'],
  inventories: ['etats-des-lieux'],
  // La liste suit la checklist d'onboarding du locataire, pas les seuls états des lieux : un module à part.
  move_in_follow_up: ['entrees-en-attente'],
  provider_book: ['carnet-prestataires'],
  calendar: ['calendrier'],
  credits: ['credits'],
  // Les statistiques (`/app/overview`) et la vue d'agence restent : ce module est le pilotage AVANCÉ.
  analytics: ['kpis', 'alertes', 'exports'],
};

/** Les personas dont la DISPOSITION se masque. Les autres ne perdent que leur complément « Aussi … ». */
export const PERSONAS_DU_PERSONNEL: ReadonlySet<Persona> = new Set<Persona>(['agent', 'admin-agence']);

/** `agency.settings.hidden_modules`, tel que l'API le rend : seuls les codes connus, dans leur ordre. */
export function modulesMasquesDe(settings: unknown): CodeDeModule[] {
  const brut =
    settings !== null && typeof settings === 'object' ? (settings as { hidden_modules?: unknown }).hidden_modules : undefined;
  if (!Array.isArray(brut)) return [];
  return CODES_DE_MODULE.filter((code) => brut.includes(code));
}

/** Les destinations que retirent ces modules ; un code inconnu ne retire rien. */
export function destinationsMasquees(modules: readonly string[]): ReadonlySet<IdDestination> {
  return new Set(CODES_DE_MODULE.filter((code) => modules.includes(code)).flatMap((code) => MODULES_D_AGENCE[code]));
}
```

- [ ] **Étape 6 : `composer-menu.ts`** — importer `PERSONAS_DU_PERSONNEL` de `./modules`, poser au
  niveau du module `const SANS_MASQUE: ReadonlySet<string> = new Set();`, et remplacer la ligne de
  `ctxPersona` :

```ts
  // TCK-2483 (ADR-0089, amendement « modules par agence ») — les modules que l'agence masque ne
  // retirent que ce qu'un profil du PERSONNEL apporte : la disposition de l'agent et de l'admin, et le
  // complément (jugé sur `ctx`, qui garde `masquees`). Le bailleur, le locataire, le client et le
  // prestataire gardent ce qu'ils ouvrent eux-mêmes.
  const ctxPersona: ContexteDeMenu = {
    ...ctx,
    roles: rolesDuPersona(ctx.roles, persona),
    rolesDeLEspace: ctx.roles,
    masquees: PERSONAS_DU_PERSONNEL.has(persona) ? ctx.masquees : SANS_MASQUE,
  };
```

et ajouter au point 3 du docblock de `composerMenu` : « TCK-2483 — une destination masquée par
l'agence est fermée au persona du personnel et au complément ; elle ne tombe ni sous « Plus » ni sous
« Aussi … ». »

- [ ] **Étape 7 : `web-ci.yml`** — dans les DEUX blocs `paths:` (`pull_request`, puis `push`), sous
  la ligne `takussan-api/app/Services/Profiles/ActiveProfileResolver.php` :

```yaml
      # `src/lib/navigation/__tests__/modules.parity.test.ts` (TCK-2483) compare `CODES_DE_MODULE` aux
      # cas d'`AgencyModule` : un module ajouté côté back seul doit déclencher la garde.
      - 'takussan-api/app/Models/Enums/AgencyModule.php'
```

(Dans le bloc `push`, sans répéter le commentaire, comme les lignes voisines.)

- [ ] **Étape 8 : vert**

Run : `npx vitest run src/lib/navigation/__tests__/`
Attendu : tout vert, sortie 0. ⚠ La garde « tout appelant de `composerMenu` pose `masquees` » est
ROUGE jusqu'à la tâche 3 (`AppSidebar.tsx`) : la marquer `it.todo` dans ce commit n'est PAS permis —
faire les tâches 2 et 3 dans le même commit si l'on veut un arbre vert à chaque commit, ou commiter la
tâche 2 avec ce seul rouge connu, écrit dans le message. Choix recommandé : un commit commun 2+3.

- [ ] **Étape 9 : ablations** — script `scratchpad/ablations-2483-nav.sh`, chaque mutation par
  `perl -0pi`, test visé, `git checkout -- <fichier>` :
  1. `estOuverte` sans `&& !ctx.masquees?.has(destination.id)` → « l'agent ne voit plus… » rougit ;
  2. `masquees: ctx.masquees` (sans la condition) dans `composerMenu` → « bailleur garde ses états des
     lieux » et « locataire » rougissent ;
  3. `masquees: SANS_MASQUE` toujours → « l'agent ne voit plus… » et « Aussi administrateur » rougissent ;
  4. `calendar: ['calendrier', 'messagerie']` → « jamais l'indispensable » rougit ;
  5. `analytics: ['kpis', 'alertes', 'exports', 'agence-equipe']` → « jamais par règle » rougit ;
  6. ajouter `'archives'` à `CODES_DE_MODULE` (et `archives: ['documents']`) → parité rougit ;
  7. ajouter `import { estOuverte } from '@/lib/navigation/catalogue'; estOuverte;` en tête de
     `src/components/layout/AppTopbar.tsx` → « aucun fichier hors de lib/navigation » rougit.

---

### Tâche 3 : le câblage — layout, coque, barre

**Fichiers :** voir la carte, lignes « 3 ».

- [ ] **Étape 1 : les tests qui échouent** — créer `src/app/(dashboard)/app/__tests__/layout.modules.test.tsx`,
  sur le patron de `bandeau-suspension.test.tsx` (mêmes `vi.mock`, même sonde `coque`) :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { User } from '@/types/user';

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — le layout de `/app` lit les modules masqués
 * sur l'agence qu'il lit DÉJÀ (aucune requête de plus) et les passe à la coque. Il ne décide pas à
 * quel persona ils s'appliquent : c'est `composerMenu`.
 */
const getMeAction = vi.fn();
const resolveAgencyOrNull = vi.fn();
const coque = vi.fn();

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton', getActiveProfileId: async () => undefined }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => resolveAgencyOrNull(...args),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({
  accesAdmin: async () => ({ chemins: [], espaceIndividuel: false }),
  capacitesAmorcees: async () => null,
}));
vi.mock('@/lib/queries/agency-upgrade', () => ({ fetchAgencyUpgradeRequests: async () => ({ data: [] }) }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({ IntlProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: (props: Record<string, unknown>) => {
    coque(props);
    return null;
  },
}));

const { default: AppLayout } = await import('../layout');

const agence = (settings: unknown) => ({ id: 7, kind: 'standard', status: 'active', settings });

async function modules(roles: string[], lue: unknown): Promise<unknown> {
  getMeAction.mockResolvedValue({ id: 1, roles, agency_id: 7 } as unknown as User);
  resolveAgencyOrNull.mockResolvedValue(lue);
  render(await AppLayout({ children: null }));
  return coque.mock.lastCall?.[0]?.modulesMasques;
}

describe('espace applicatif — les modules masqués par l’agence (TCK-2483)', () => {
  beforeEach(() => coque.mockClear());

  it.each([
    [['agency_admin', 'customer'], agence({ hidden_modules: ['calendar', 'obsolete'] }), ['calendar']],
    [['agent', 'customer'], agence({ hidden_modules: ['analytics', 'commissions'] }), ['commissions', 'analytics']],
    // Le bailleur reçoit le fait de l'agence ; `composerMenu` ne masque pas sa disposition.
    [['owner', 'customer'], agence({ hidden_modules: ['inventories'] }), ['inventories']],
    [['agent', 'customer'], agence(null), []],
    [['agent', 'customer'], null, []],
    [['customer'], agence({ hidden_modules: ['calendar'] }), []],
  ])('rôles %j → %j', async (roles, lue, attendu) => {
    expect(await modules(roles, lue)).toEqual(attendu);
  });
});
```

Dans `src/components/layout/__tests__/AppSidebar.test.tsx` : ajouter `modulesMasques?: readonly string[]`
au type `options` de `barre` et de `renderSidebar`, passer `modulesMasques={options.modulesMasques}` à
`<AppSidebar>`, puis :

```tsx
describe('TCK-2483 — la barre montée retire les modules masqués par l’agence', () => {
  const lien = (nom: RegExp) => screen.queryByRole('link', { name: nom });

  it('sans module masqué, l’agent a « Commissions » et « États des lieux » (témoin)', () => {
    renderSidebar('agent', '/app');
    expect(lien(/^Commissions/)).not.toBeNull();
    expect(lien(/^États des lieux/)).not.toBeNull();
  });

  it('l’agent les perd quand l’agence les masque', () => {
    renderSidebar('agent', '/app', { modulesMasques: ['commissions', 'inventories'] });
    expect(lien(/^Commissions/)).toBeNull();
    expect(lien(/^États des lieux/)).toBeNull();
  });

  it('le bailleur garde « États des lieux »', () => {
    renderSidebar('bailleur', '/app', { modulesMasques: ['inventories'] });
    expect(lien(/^États des lieux/)).not.toBeNull();
  });
});
```

(Si le nom accessible d'un lien ne commence pas par son libellé — compteur ou texte réservé au lecteur
d'écran en tête —, chercher par `libelle()` sur `nav a`, comme les tests voisins, et l'écrire.)

- [ ] **Étape 2 : lancer, constater l'échec**

Run : `npx vitest run "src/app/(dashboard)/app/__tests__/layout.modules.test.tsx" src/components/layout/__tests__/AppSidebar.test.tsx`
Attendu : FAIL (`modulesMasques` absent ; l'agent garde ses entrées).

- [ ] **Étape 3 : le type** — `src/types/agency.ts`, dans `AgencySettings` :

```ts
  /**
   * TCK-2483 — les modules que l'agence retire du menu de son personnel (codes d'`AgencyModule`).
   * Lu par `modulesMasquesDe`, jamais tel quel : un code inconnu y est ignoré.
   */
  hidden_modules?: readonly string[];
```

- [ ] **Étape 4 : le layout** — `src/app/(dashboard)/app/layout.tsx` : importer
  `modulesMasquesDe, type CodeDeModule` de `@/lib/navigation/modules` ; déclarer avec les autres
  `let` :

```ts
  // TCK-2483 (ADR-0089, amendement « modules par agence ») — les modules que l'agence du profil actif
  // retire du menu de son personnel, lus sur l'agence que ce layout lit déjà : aucune requête de plus.
  // `composerMenu` décide à quel persona ils s'appliquent.
  let modulesMasques: CodeDeModule[] = [];
```

dans la branche `agency_admin`, après `agencySuspended = …` : `modulesMasques = modulesMasquesDe(agency?.settings);` ;
dans la branche agent/bailleur, après `agencySuspended = …` : la même ligne ; et passer
`modulesMasques={modulesMasques}` à `<AppShell>`.

- [ ] **Étape 5 : la coque** — `src/components/layout/AppShell.tsx` : prop

```ts
  /** TCK-2483 — les modules que l'agence masque (codes), lus par le layout ; la barre en tire le contexte. */
  modulesMasques?: readonly string[];
```

déstructurée `modulesMasques = []`, passée `modulesMasques={modulesMasques}` aux DEUX montages
d'`AppSidebar` (barre fixe et tiroir) — et à tout autre consommateur du menu présent à ce moment
(TCK-2481 : la barre d'onglets, si elle compose son menu elle-même).

- [ ] **Étape 6 : la barre** — `src/components/layout/AppSidebar.tsx` : même prop (docblock
  identique) dans `AppSidebarProps`, déstructurée `modulesMasques = []` ; importer
  `destinationsMasquees` de `@/lib/navigation/modules` ; ajouter au contexte passé à `composerMenu` :

```ts
      // TCK-2483 — un fait de l'agence ; `composerMenu` le garde pour le personnel et le complément.
      masquees: destinationsMasquees(modulesMasques),
```

- [ ] **Étape 7 : vert**

Run : `npx vitest run src/lib/navigation/__tests__/ "src/app/(dashboard)/app/__tests__/" src/components/layout/__tests__/`
Attendu : tout vert (la garde de branchement de la tâche 2 comprise).

- [ ] **Étape 8 : ablations** (script) :
  1. layout : supprimer les deux affectations `modulesMasques = …` → `layout.modules.test.tsx` rougit ;
  2. `AppSidebar` : retirer la ligne `masquees:` → « l'agent les perd » ET la garde de branchement
     rougissent ;
  3. `AppShell` : ne pas passer la prop au montage fixe → « l'agent les perd » rougit (le test monte
     `AppSidebar` directement : si l'ablation 3 reste verte, l'écrire — c'est la mesure au navigateur
     qui la couvre, tâche 5).

- [ ] **Étape 9 : commit** (avec la tâche 2) — `npx tsc --noEmit && npm run lint && npm run check:i18n`.
  Commit : `feat(web): le menu retire les modules que l'agence masque, pour son seul personnel (TCK-2483)`.

---

### Tâche 4 : l'écran — « Menu de l'équipe » dans la fiche de l'agence

**Fichiers :** voir la carte, lignes « 4 ».

- [ ] **Étape 1 : les tests qui échouent** — créer
  `src/components/admin-agency/__tests__/AgencyConfigForm.modules.test.tsx`, sur le patron de
  `AgencyConfigForm.penalites.test.tsx` (mêmes `vi.mock`, même `AGENCE` avec `kind: 'standard'`) :

```tsx
const M = fr.admin.agencyConfig.modules;
const caseDe = (code: keyof typeof M.items) => screen.queryByRole('checkbox', { name: M.items[code].label });

describe('AgencyConfigForm — menu de l’équipe (TCK-2483)', () => {
  it('une agence sans la clé : les sept modules sont affichés (cases cochées)', () => {
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));
    for (const code of Object.keys(M.items) as (keyof typeof M.items)[]) {
      expect(caseDe(code), code).toBeChecked();
    }
    expect(Object.keys(M.items)).toHaveLength(7);
  });

  it('un module masqué a sa case décochée, et la case dit ce qu’elle retire', () => {
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { hidden_modules: ['commissions'] } }} />));
    expect(caseDe('commissions')).not.toBeChecked();
    expect(caseDe('analytics')).toHaveAccessibleDescription(M.items.analytics.hint);
  });

  it('décocher « Calendrier » puis enregistrer envoie la liste dans l’ordre des codes', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { hidden_modules: ['analytics'] } }} />));
    await user.click(caseDe('calendar')!);
    const payload = await enregistrer(user);
    expect(payload.settings).toMatchObject({ hidden_modules: ['calendar', 'analytics'] });
  });

  it('tout recocher envoie une liste vide (le réaffichage s’enregistre)', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, settings: { hidden_modules: ['credits'] } }} />));
    await user.click(caseDe('credits')!);
    expect((await enregistrer(user)).settings).toMatchObject({ hidden_modules: [] });
  });

  it('une agence individuelle n’a pas la section et n’envoie pas la clé', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, kind: 'individual' }} />));
    expect(screen.queryByRole('heading', { name: M.title })).toBeNull();
    expect(caseDe('calendar')).toBeNull();
    expect((await enregistrer(user)).settings).not.toHaveProperty('hidden_modules');
  });
});
```

(`enregistrer` : la fonction du test des pénalités, recopiée. Si le type `Agency` exige d'autres champs
pour `kind`, les reprendre de `AgencyConfigForm.moderation.test.tsx`.)

Modifier les trois tests de R5 :
- `AgencyConfigForm.penalites.test.tsx`, « n'envoie que les clés gérées » : ajouter
  `hidden_modules: [],` à l'objet attendu, avec le commentaire `// TCK-2483 — clé gérée par la
  section « Menu de l'équipe », toujours émise pour une agence standard.` ;
- `AgencyConfigForm.test.tsx` (TCK-962) : la liste triée devient
  `['hidden_modules', 'late_fee_online_collection', 'require_team_two_factor']` ;
- `src/lib/__tests__/admin-schemas.test.ts` : `hidden_modules: [],` dans les DEUX objets `base`, et
  `'hidden_modules'` en tête de la liste attendue du test TCK-962 ; ajouter

```ts
  it('TCK-2483 — `hidden_modules` part pour une agence standard, jamais pour une individuelle', () => {
    expect(normaliseAgencyForm({ ...base, hidden_modules: ['analytics', 'calendar'] }).settings).toMatchObject({
      hidden_modules: ['calendar', 'analytics'],
    });
    expect(
      normaliseAgencyForm({ ...base, hidden_modules: ['calendar'] }, { individual: true, initialThreshold: '' }).settings,
    ).not.toHaveProperty('hidden_modules');
    expect(agencyFormSchema.safeParse({ ...base, hidden_modules: ['payments'] }).success).toBe(false);
  });
```

- [ ] **Étape 2 : lancer, constater l'échec**

Run : `npx vitest run src/components/admin-agency/__tests__/ src/lib/__tests__/admin-schemas.test.ts`
Attendu : FAIL (section absente ; `hidden_modules` inconnu du schéma).

- [ ] **Étape 3 : le schéma** — `src/lib/schemas/agency.ts` : importer `CODES_DE_MODULE` de
  `@/lib/navigation/modules` ; dans `agencyFormSchema`, après `late_fee_online_collection` :

```ts
  /** TCK-2483 — `settings.hidden_modules` : les modules retirés du menu de l'équipe (agence `standard`). */
  hidden_modules: z.array(z.enum(CODES_DE_MODULE)),
```

dans `normaliseAgencyForm`, après `settings.late_fee_online_collection = …` :

```ts
  // TCK-2483 — toujours émis pour une agence `standard`, `[]` compris (tout réafficher doit
  // s'enregistrer), dans l'ordre des codes. Jamais pour une `individual` : l'API la refuse (422).
  if (!context.individual) {
    settings.hidden_modules = CODES_DE_MODULE.filter((code) => values.hidden_modules.includes(code));
  }
```

- [ ] **Étape 4 : le formulaire** — `AgencyConfigForm.tsx` : importer `Controller` de
  `react-hook-form`, `CODES_DE_MODULE, modulesMasquesDe` de `@/lib/navigation/modules` ; dans
  `toDefaults`, après `late_fee_online_collection` : `hidden_modules: modulesMasquesDe(agency.settings),` ;
  puis, après la section « Sécurité » et avant la rangée de boutons :

```tsx
      {/* TCK-2483 (ADR-0089, amendement « modules par agence ») — un réglage d'AFFICHAGE : le menu de
          toute l'équipe, l'admin compris. Pas pour une agence `individual` (aucune équipe ; l'API refuse
          la clé). Cochée = affichée : on décoche ce que l'agence n'utilise pas. */}
      {individual ? null : (
        <section className="rounded-xl bg-card p-6 space-y-4" aria-labelledby="modules-titre">
          <div>
            <h2 id="modules-titre" className="text-base font-semibold text-foreground">{t('modules.title')}</h2>
            <p className="mt-1 text-pretty text-xs text-muted-foreground">{t('modules.description')}</p>
          </div>
          <Controller
            control={control}
            name="hidden_modules"
            render={({ field }) => (
              <ul className="space-y-2">
                {CODES_DE_MODULE.map((code) => {
                  const id = `module-${code}`;
                  return (
                    <li
                      key={code}
                      className="relative flex items-start gap-4 rounded-lg border border-input bg-background px-4 py-3 transition-colors hover:bg-muted/40"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={!field.value.includes(code)}
                        aria-describedby={`${id}-hint`}
                        onChange={(e) =>
                          field.onChange(
                            e.target.checked ? field.value.filter((c) => c !== code) : [...field.value, code],
                          )
                        }
                        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
                      />
                      <div>
                        <label
                          htmlFor={id}
                          className="cursor-pointer text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-lg"
                        >
                          {t(`modules.items.${code}.label`)}
                        </label>
                        <p id={`${id}-hint`} className="mt-0.5 text-pretty text-xs text-muted-foreground">
                          {t(`modules.items.${code}.hint`)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          />
        </section>
      )}
```

- [ ] **Étape 5 : les libellés** — sous `admin.agencyConfig.modules`, dans `fr.json` (et `wo.json` À
  L'IDENTIQUE, wolof en pause) :

```json
"modules": {
  "title": "Menu de l'équipe",
  "description": "Décochez ce que votre agence n'utilise pas : l'entrée quitte le menu de vos agents, et le vôtre. Aucun droit ne change — une page reste accessible par un lien direct — et vos bailleurs et locataires gardent leur menu.",
  "items": {
    "commissions": { "label": "Commissions", "hint": "Le grand livre des commissions de l'équipe." },
    "inventories": { "label": "États des lieux", "hint": "Les états des lieux d'entrée et de sortie." },
    "move_in_follow_up": { "label": "Suivi des entrées", "hint": "Les locataires dont l'installation attend depuis plus de 7 jours." },
    "provider_book": { "label": "Carnet de prestataires", "hint": "Les prestataires de maintenance de l'agence." },
    "calendar": { "label": "Calendrier", "hint": "Le calendrier des visites, réservations et interventions." },
    "credits": { "label": "Crédits", "hint": "Le portefeuille de crédits de mise en avant." },
    "analytics": { "label": "Pilotage avancé", "hint": "Indicateurs, alertes et exports — les statistiques restent." }
  }
}
```

`en.json` :

```json
"modules": {
  "title": "Team menu",
  "description": "Untick what your agency doesn't use: the entry leaves your agents' menu, and yours. No permission changes — a page stays reachable by a direct link — and your landlords and tenants keep their menu.",
  "items": {
    "commissions": { "label": "Commissions", "hint": "The team's commission ledger." },
    "inventories": { "label": "Inventories", "hint": "Move-in and move-out inventories." },
    "move_in_follow_up": { "label": "Move-in follow-up", "hint": "Tenants whose move-in has been pending for more than 7 days." },
    "provider_book": { "label": "Service provider book", "hint": "The agency's maintenance providers." },
    "calendar": { "label": "Calendar", "hint": "The calendar of visits, bookings and interventions." },
    "credits": { "label": "Credits", "hint": "The promotion credits wallet." },
    "analytics": { "label": "Advanced analytics", "hint": "KPIs, alerts and exports — statistics stay." }
  }
}
```

(Reprendre les libellés EXACTS du menu si le relevé les donne autrement : `nav.sidebar.inventories`,
`commissions`, `calendar`, `credits`, `providerBook` — la case doit nommer ce que l'admin voit au menu.
« Suivi des entrées » nomme l'entrée « Onboardings en attente » : l'écrire dans le `hint` si la revue
le demande.)

- [ ] **Étape 6 : vert** — `npx vitest run src/components/admin-agency/__tests__/ src/lib/__tests__/admin-schemas.test.ts`,
  puis `npx tsc --noEmit && npm run lint && npm run check:i18n`.

- [ ] **Étape 7 : ablations** (script) :
  1. retirer le bloc `if (!context.individual) { settings.hidden_modules = … }` → « décocher
     Calendrier » et le test du schéma rougissent ;
  2. retirer la condition (émettre toujours) → « une agence individuelle… n'envoie pas la clé » rougit ;
  3. `checked={field.value.includes(code)}` (sens inversé) → « sept modules affichés » rougit ;
  4. `toDefaults` sans `modulesMasquesDe` (`hidden_modules: []`) → « un module masqué a sa case
     décochée » rougit.

- [ ] **Étape 8 : commit** — `feat(web): la fiche de l'agence choisit les modules du menu de l'équipe (TCK-2483)`.

---

### Tâche 5 : mesure au navigateur et livraison

- [ ] **Étape 1 :** `./dev.sh` ; un admin d'agence `standard`, un agent et un bailleur de la MÊME
  agence (relever les e-mails dans `takussan-api/database/seeders/`). Mesurer, et joindre les relevés
  aux notes du ticket (AC9) :
  1. l'admin décoche « Commissions », enregistre : l'entrée quitte SON menu sans rechargement
     (`router.refresh()`) ;
  2. l'agent, après navigation : pas de « Commissions » ;
  3. l'agent ouvre `/app/commissions` par l'URL : la page est servie (200, contenu rendu) ;
  4. l'admin masque « États des lieux » : le bailleur de l'agence le garde dans « Mon patrimoine » ;
  5. à 390 px, la section se lit en une colonne, `scrollWidth − innerWidth = 0` (méthode
     `docs/qa/responsive-2026-09-02.md`, CDP direct) ;
  6. remettre l'agence dans son état d'origine.
- [ ] **Étape 2 :** AC10 — si TCK-2481/2482 sont sur `dev`, le test de l'onglet / de la palette (voir
  « Ce qu'on suppose »).
- [ ] **Étape 3 :** notes du ticket (écarts au plan, ablations et leur résultat, relevés), cocher les
  AC tenus ; les gardes du dépôt (`for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done`),
  `node docs/backlog/check-backlog.mjs`, `node docs/backlog/ranger-tickets.mjs --check` ; demander au
  porteur l'accord de push ; avec l'accord : push, PR vers `dev`, la CI joue les suites. Après la
  fusion : `/sync-specs` (`features.md`, `models-spec.md` §2 : la clé `hidden_modules`).

## Couverture des critères

| AC | Tâche | Test | Ablations | Mesure |
|---|---|---|---|---|
| AC1 — décision écrite | — | amendement d'ADR-0089 | — | — |
| AC2 — contrat API | 1 | `AgencyModulesSettingsTest` | T1-1..5 | — |
| AC3 — l'agent perd les modules | 2, 3 | `composer-menu.test.ts`, `AppSidebar.test.tsx` | T2-1, T3-2 | T5-2 |
| AC4 — bailleur, locataire, « Aussi » | 2 | `composer-menu.test.ts` | T2-2, T2-3 | T5-4 |
| AC5 — rien n'est perdu | 2 | `composer-menu.test.ts` (invariant) | T2-1, T2-2 | — |
| AC6 — gardes | 2 | `modules.test.ts`, `modules.parity.test.ts` | T2-4..7 | — |
| AC7 — le layout lit | 3 | `layout.modules.test.tsx` | T3-1 | — |
| AC8 — l'écran | 4 | `AgencyConfigForm.modules.test.tsx`, `admin-schemas.test.ts` | T4-1..4 | T5-1, T5-5 |
| AC9 — au navigateur | 5 | — | — | T5-1..6 |
| AC10 — onglets, palette | 5 | selon les tickets voisins | — | — |
| AC11 — pint, tsc, lint, i18n, CI | 1-5 | — | — | CI |
