# TCK-633 lot C — publication sans friction, numéros, contacts sur place Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** « Publier » crée l'espace individuel sans question (drapeau `host_auto_space`). La publication exige un contact joignable (prénom, numéro vérifié) et des CGU datées. Un compte porte un second numéro vérifié par code. Chaque numéro dit s'il reçoit WhatsApp. Un bien porte jusqu'à trois contacts sur place. L'endpoint public de contact rend la liste de ces numéros.

**Architecture:** côté API, la création automatique réutilise `HostIndividualOnboardingService` (méthode `autoOnboard()`, même `createAgency` et mêmes profils, sans OTP ni CGU). Le second numéro passe par `PhoneVerificationService`, avec une portée de code distincte (`secondary-phone:{id}`) ; ce service reste le seul à écrire les colonnes de vérification. `PublishReadiness` juge la publication en un seul endroit, appelé par les quatre chemins qui rendent un bien public. `PropertyContactNumbers` construit la liste publique des numéros. Côté front, une action serveur par geste. Les composants neufs vivent sous `components/contact/**` et `components/profile/security/**`, et les fichiers co-tenus ne reçoivent que des insertions courtes.

**Tech Stack:** Laravel 13 / PHP 8.4, PostgreSQL 17, PHPUnit (Feature) ; Next.js 16, React 19, TypeScript 5, next-intl, vitest + Testing Library.

---

## Contraintes globales (à relire avant chaque tâche)

1. **Arbre partagé.** Aucune commande git qui écrit (`add`, `commit`, `checkout`, `stash`, `restore`, `reset`, `switch`, `merge`, `push`). L'agent édite, la session commite. Chaque étape « commit » du gabarit devient : *« signaler à la session les fichiers à commiter »*. La liste de ces fichiers va dans le rapport.
2. **Territoire C seul.** Un fichier hors territoire ne s'édite pas : il va dans `collisions`. Il y a deux exceptions, présentées comme des extensions à confirmer par la session **avant le lancement** (cf. « Écarts relevés », E1 et E2) : `AuthController::updateProfile` (une insertion) et `UserResource` (une insertion). Si la session refuse, l'agent saute les étapes marquées **[EXT]** et les inscrit dans `collisions` avec le code exact donné ici.
3. **Fichiers co-tenus** : `Flag.php` (avec A), `Property.php` (avec D et F), `PublicPropertyController.php` (avec F), `lang/{fr,en,wo}/errors.php` (avec D et F), `PropertyWizard.tsx` (avec D), `messages/{fr,en,wo}.json` (tous). Ils s'éditent **avec l'outil Edit uniquement**, par petits blocs ancrés sur un texte stable cité dans ce plan. Jamais par `sed`, ni par un script, ni par `Write`. Si Edit signale un changement, **relire le fichier, puis rejouer l'édition**. Les numéros de ligne cités sont ceux du 2026-10-12 : ils dérivent dès qu'un autre lot écrit. **L'ancre textuelle fait foi.**
4. **Ablation.** On ablate **jamais dans un fichier co-tenu** : la restauration par `cp` y écraserait l'édition concurrente d'un autre lot. Chaque ablation de ce plan vise un fichier tenu par C seul. Le répertoire de sauvegarde est `ABL=/private/tmp/claude-501/tck-633-lot-c-ablation`, ou le scratchpad de la session d'exécution, pourvu qu'il soit hors du dépôt. Restauration par `cp`, preuve par `md5 -q`, **jamais `git checkout`**.
5. **Tests.** Un agent lance ses classes (`php artisan test <fichier>`, `npx vitest run <fichier>`) ou `php bin/impacted-tests.php --run`. **Jamais la suite entière.** Rien de plus de 10 minutes.
6. **PostgreSQL** (CLAUDE.md, pièges) :
   - noms d'index et de FK explicites, de 63 caractères au plus ;
   - jamais `enum()` ;
   - `jsonb`, jamais `json` ;
   - **tester avant d'écrire**, plutôt qu'attraper une violation d'unicité (piège n° 1) ;
   - verrou sur la **ligne parent**, jamais sur un agrégat (piège n° 2) ;
   - `CanonicalPhone::sql`/`fold` vont par paire.
7. **Erreurs** par `abort_code(...)` ou `new ApiError(...)`, avec leurs clés ×3 dans `lang/{fr,en,wo}/errors.php`. `tests/Unit/Lang/LangGroupParityTest.php` le vérifie.
8. **i18n front.** C écrit sous `publishRedirect.auto.*`, `profile.contact.*` (ajouts), `property.form.publishContact.*` et `property.contacts.*`. Aucun littéral affiché en dur dans un fichier neuf (`check:i18n`, cliquet B) : pas de `placeholder="123456"`.
9. **Pint** sur les seuls fichiers PHP touchés (`./vendor/bin/pint <fichiers>`), jamais sur tout le dépôt, qui reformaterait le travail des autres lots. Côté web : `npx tsc --noEmit`, `npm run lint`, `npm run check:i18n`.
10. **Rapport** : `docs/plans/rapports/tck-633-lot-c.json` (outil Write), le verdict en premier, puis `fichiers`, `tests`, `ablations`, `ecarts_au_ticket`, `collisions`. Le message final tient en une ligne.

Chemins : `API=/Users/aminethiam/Documents/perso/takussan/takussan-api`, `WEB=/Users/aminethiam/Documents/perso/takussan/takussan-web`. Toutes les commandes PHP se lancent depuis `$API`, toutes les commandes npm depuis `$WEB`.

---

## Carte des fichiers (lus le 2026-10-12)

### API — modifiés

| Fichier | Lignes lues | Ce que C y change |
|---|---|---|
| `app/Domain/Features/Flag.php` (co-tenu A) | L15-34 : enum vide, `clientVisible()`, `catalogue()` | `case HostAutoSpace = 'host_auto_space';` |
| `app/Services/Onboarding/HostIndividualOnboardingService.php` | `onboard()` L62-125, `createAgency()` L150-187, profils L195-223, `uniqueSlug()` L241-256 | `autoOnboard()`, paramètre `$source` de `createAgency`, `SpaceCreated` |
| `app/Services/Auth/PhoneVerificationService.php` | `isVerifiedElsewhere()` L156-164, `markVerified()` L172-183, `sendCodeTo`/`verifyCodeFor`/`sendToAvailableIn`/`holdCooldownFor` | `PhoneVerified` ; portée et méthodes du second numéro |
| `routes/api/onboarding.php` | groupe `auth:sanctum` L16-52, `host/individual/onboard` L23-25 | route `auto-onboard` |
| `routes/api/auth.php` | groupe authentifié L54-129, `phone/change-code` L78-80 | trois routes `secondary-phone` |
| `routes/api/properties.php` | groupe L16-…, collaborateurs L62-67 | `GET|PUT properties/{property}/contacts` |
| `app/Http/Requests/Auth/UpdateProfileRequest.php` | `rules()` L28-57 | `phone_whatsapp`, `secondary_phone_whatsapp` |
| `app/Http/Controllers/Api/Auth/AuthController.php` **[EXT]** | `updateProfile()` L158-219, `$data = $request->only(...)` L163 | les deux cases WhatsApp |
| `app/Http/Resources/UserResource.php` **[EXT]** | `toArray()` L11-63 | cinq champs, pour soi seul |
| `app/Models/User.php` (C seul) | `$fillable` L52-71, `casts()` L88-110, `getActivitylogOptions()` L336-356 (liste blanche) | fillable WhatsApp, casts ; **rien** dans `logOnly` |
| `app/Models/Property.php` (co-tenu D, F) | relations, `collaborators()` L846-849 | relation `contacts()` |
| `app/Http/Controllers/Api/PropertyController.php` (C seul) | `store()` L99-151, `update()` L168-200, `publish()` L211-234, `updateVisibility()` L270-281 | `PublishReadiness` sur les quatre chemins |
| `app/Http/Controllers/Public/PublicPropertyController.php` (co-tenu F) | imports L52-56, `show()` L579-608 (with L582-596), `contact()` L1180-1201 | liste de numéros, `contacts` chargé dans `show()` |
| `lang/{fr,en,wo}/errors.php` (co-tenu) | `onboarding` L317-324, `property` L413-424, `search_alert` L453 / `segregation` L457 | `onboarding.auto_space_disabled`, `property.publish_contact_incomplete`, groupe `secondary_phone` |
| `lang/{fr,en,wo}/onboarding.php` | `host_individual.errors` seulement | `auto_space.name_with_first_name`, `auto_space.name_default` |

### API — créés

- `database/migrations/2026_10_12_300000_enable_host_auto_space_flag.php`
- `database/migrations/2026_10_12_300100_add_contact_preferences_to_users_table.php`
- `database/migrations/2026_10_12_300200_create_property_contacts_table.php`
- `app/Events/Auth/PhoneVerified.php`, `app/Events/Onboarding/SpaceCreated.php`
- `app/Http/Controllers/HostAutoOnboardController.php`, `app/Http/Requests/Onboarding/HostAutoOnboardRequest.php`
- `app/Http/Controllers/Api/Auth/SecondaryPhoneController.php`, `app/Http/Requests/Auth/SecondaryPhoneRequest.php`, `app/Http/Requests/Auth/VerifySecondaryPhoneRequest.php`
- `app/Models/PropertyContact.php`, `app/Http/Controllers/Api/PropertyContactController.php`, `app/Http/Requests/Api/ReplacePropertyContactsRequest.php`
- `app/Services/Property/PublishReadiness.php`, `app/Services/Property/PropertyContactNumbers.php`
- Tests :
  - `tests/Feature/Onboarding/HostAutoOnboardTest.php`
  - `tests/Feature/Onboarding/SpaceCreatedEventTest.php`
  - `tests/Feature/Auth/Phone/PhoneVerifiedEventTest.php`
  - `tests/Feature/Auth/ContactPreferencesTest.php`
  - `tests/Feature/Auth/Phone/SecondaryPhoneTest.php`
  - `tests/Feature/Property/PropertyContactsTest.php`
  - `tests/Feature/Public/PublicContactEndpointTest.php`
  - `tests/Feature/Api/PublishReadinessTest.php`
  - `tests/Support/PubliePret.php`

### API — tests existants à mettre à jour (cassés par le contrat du ticket)

| Fichier | Ligne(s) | Cause |
|---|---|---|
| `tests/Feature/Api/Admin/FeatureFlagTest.php` | L45-53, L65 | catalogue non vide, ligne insérée par la migration |
| `tests/Feature/Public/PropertyContactTest.php` | L36-37 | `/contact` rend une liste |
| `tests/Unit/Services/PrimaryPropertyContactEligibilityTest.php` | L67-69 | idem |
| `tests/Feature/Property/PrimaryAgentDesignationTest.php` | L86-87 | idem |
| `tests/Feature/Admin/Platform/AccountErasureListingsTest.php` | L140 | idem |
| `tests/Feature/Api/ProprietaireDuBienTest.php` | L72, L126, L148, L160 | idem |
| `tests/Feature/Public/PropertyPrimaryContactTest.php` | L202-204, L228-230 | idem |
| `tests/Feature/Api/PropertyCollaboratorTest.php` | L430-432 | idem |
| `tests/Feature/Api/PropertyCrudTest.php` | L247-273 | publication désormais gardée |
| `tests/Feature/Api/PropertyModerationGateTest.php` | `setUp` L33-42 | idem |
| `tests/Feature/Api/PropertyAuthorizationTest.php` | L73-80, L244-252 | idem |
| `tests/Feature/Api/Admin/PropertyReportDecisionTest.php` | `setUp` L42-58 | idem (le 422 `moderation.platform_hold` doit rester le premier refus) |

`BillingPlansTest` L133-141 n'a pas besoin de changer. La factory crée par défaut un bien `Available + Public + published_at`, donc « déjà en ligne » : la republication n'est pas gardée.

### Web — modifiés

| Fichier | Lignes lues | Ce que C y change |
|---|---|---|
| `src/types/user.ts` | type `User` L67-106 | cinq champs optionnels |
| `src/types/property.ts` | `PropertyOwnerLite` L83-102, `has_phone?` L95 | `has_whatsapp?` |
| `src/app/publish/page.tsx` | imports L12-20, effet L47-53, réessai L117 | création automatique |
| `src/hooks/usePublishIntent.ts` | docblock L1-24 | une ligne de doc (le hook ne change pas) |
| `src/components/profile/ProfileContactSection.tsx` | imports L3-17, `{t('phoneHint')}` L324, `htmlFor="contact-bio"` L462 | case WhatsApp, section second numéro |
| `src/app/[locale]/(public)/properties/[slug]/components/PropertyAgentCard.tsx` | `handleCall` L50-67, `WhatsAppButton` L143 | liste de numéros, `hasWhatsApp` |
| `src/components/contact/WhatsAppButton.tsx` | L28-60 | premier numéro WhatsApp de la liste |
| `src/components/property-form/wizard/steps/StepFinition.tsx` | signature L58, fin L103-104 | `children` |
| `src/components/property-form/PropertyWizard.tsx` (co-tenu D) | imports L22-27/L43, état L262, échecs L326, publication L337-343, finition L552 | contacts, publication par `publishPropertyAction`, bloc des coordonnées |
| `src/messages/{fr,en,wo}.json` (co-tenus) | `publishRedirect` L4-15 (fr), `profile.contact.emailLinkSent`, `property.form.footer` | clés de C |

### Web — créés

- Actions serveur :
  - `src/app/actions/auto-onboard.ts`
  - `src/app/actions/contact-preferences.ts`
  - `src/app/actions/secondary-phone.ts`
  - `src/app/actions/publish-property.ts`
  - `src/app/actions/property-contacts.ts`
- Composants de contact :
  - `src/components/contact/numeros-du-bien.ts`
  - `src/components/contact/ListeDeNumeros.tsx`
  - `src/components/contact/ContactsSurPlace.tsx`
  - `src/components/contact/CoordonneesPublication.tsx`
- Composants de profil :
  - `src/components/profile/security/CaseWhatsApp.tsx`
  - `src/components/profile/security/SecondaryPhoneSection.tsx`
- Tests :
  - `src/app/publish/__tests__/page.auto-space.test.tsx`
  - `src/components/profile/security/__tests__/SecondaryPhoneSection.test.tsx`
  - `src/components/profile/security/__tests__/CaseWhatsApp.test.tsx`
  - `src/components/contact/__tests__/ContactsSurPlace.test.tsx`
  - `src/components/contact/__tests__/CoordonneesPublication.test.tsx`
  - `src/components/contact/__tests__/WhatsAppButton.tck-633.test.tsx`
  - `src/app/[locale]/(public)/properties/[slug]/components/__tests__/PropertyAgentCard.tck-633.test.tsx`
  - `src/components/property-form/__tests__/PropertyWizard.publication.tck-633.test.tsx`

### Web — tests existants à mettre à jour

- `src/components/contact/__tests__/WhatsAppButton.tck-590.test.tsx` : `hasPhone` devient `hasWhatsApp`, et `{ phone }` devient `{ data: [...] }`.
- `src/app/[locale]/(public)/properties/[slug]/components/__tests__/PropertyAgentCard.tck-590.test.tsx` : L54-58, `has_whatsapp`.
- `src/components/property-form/__tests__/PropertyWizard.test.tsx` (co-tenu D) : mock L74-79, imports L84-89, `beforeEach` L132-135, publication L819, L826, L837, L854, L861.

---

## Task 1 : drapeau `host_auto_space`

**Files:**
- Modify: `takussan-api/app/Domain/Features/Flag.php:15-17` (co-tenu A, par Edit)
- Create: `takussan-api/database/migrations/2026_10_12_300000_enable_host_auto_space_flag.php`
- Modify: `takussan-api/tests/Feature/Api/Admin/FeatureFlagTest.php:45-53,65`
- Test: `takussan-api/tests/Feature/Onboarding/HostAutoOnboardTest.php` (premier cas ; le fichier grandit à la tâche 3)

**Step 1 : écrire le test qui échoue**

Créer `tests/Feature/Onboarding/HostAutoOnboardTest.php` :

```php
<?php

namespace Tests\Feature\Onboarding;

use App\Domain\Features\Flag;
use App\Models\FeatureFlag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (lot C) — « Publier » crée l'espace individuel sans question, derrière le drapeau
 * `host_auto_space`, allumé par sa migration de données.
 */
class HostAutoOnboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_drapeau_est_allume_par_sa_migration(): void
    {
        $ligne = FeatureFlag::query()->where('key', Flag::HostAutoSpace->value)->first();

        $this->assertNotNull($ligne);
        $this->assertTrue((bool) $ligne->enabled);
        $this->assertNull($ligne->segments_json);
    }
}
```

**Step 2 : le lancer, constater l'échec**

Run : `php artisan test tests/Feature/Onboarding/HostAutoOnboardTest.php`
Expected : FAIL, `Error: Undefined constant App\Domain\Features\Flag::HostAutoSpace`.

**Step 3 : implémenter**

Edit de `app/Domain/Features/Flag.php`. Ancre : `enum Flag: string\n{\n`. Si le lot A a déjà inséré son cas, l'ancre existe toujours ; on insère juste après l'accolade.

```php
enum Flag: string
{
    /**
     * TCK-633 (lot C) — « Publier » crée l'espace individuel sans question
     * (`POST /api/host/individual/auto-onboard`). Lecteur : `HostAutoOnboardController`.
     * Allumé par `2026_10_12_300000_enable_host_auto_space_flag`.
     */
    case HostAutoSpace = 'host_auto_space';

```

Créer `database/migrations/2026_10_12_300000_enable_host_auto_space_flag.php` :

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (lot C) — le drapeau `host_auto_space` naît ALLUMÉ (ticket, « Création automatique »).
 *
 * `insertOrIgnore` (ON CONFLICT DO NOTHING) : une ligne déjà posée par la console garde l'état
 * qu'un opérateur lui a donné — on ne rallume pas un drapeau qu'il a éteint. On teste par la
 * contrainte d'unicité de `key` sans jamais lever d'exception (piège PostgreSQL n° 1).
 * `label` est NOT NULL : la console y écrit la clé (`FeatureFlagController::update`), on fait de même.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('feature_flags')->insertOrIgnore([
            'key' => 'host_auto_space',
            'label' => 'host_auto_space',
            'description' => null,
            'enabled' => true,
            'segments_json' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('feature_flags')->where('key', 'host_auto_space')->delete();
    }
};
```

Mettre à jour `tests/Feature/Api/Admin/FeatureFlagTest.php`. Le catalogue n'est plus vide, et le lot A y ajoute aussi un drapeau : l'assertion doit **tolérer les deux**. Remplacer la méthode `test_the_catalogue_is_empty_and_carries_no_label` (L45-53) par :

```php
    /**
     * AC15 — le catalogue ne sert ni libellé ni description, et chaque entrée a un lecteur
     * (TCK-633 : `host_auto_space`, allumé par sa migration). Tolérant au nombre d'entrées :
     * d'autres lots ajoutent les leurs.
     */
    public function test_the_catalogue_carries_no_label(): void
    {
        $this->assertContains(Flag::HostAutoSpace, Flag::cases());
        $this->actingAsRole('super_admin');

        $entrees = collect($this->getJson('/api/admin/feature-flags')->assertOk()->json('data'));
        $this->assertCount(count(Flag::cases()), $entrees);
        foreach ($entrees as $entree) {
            $this->assertSame(['key', 'client_visible', 'enabled', 'segments', 'updated_at'], array_keys($entree));
        }
        $this->assertTrue($entrees->firstWhere('key', 'host_auto_space')['enabled']);
        $this->getJson('/api/feature-flags/me')->assertOk()->assertJsonPath('data.host_auto_space', true);
    }
```

Puis, dans `test_any_key_is_unknown_to_the_console`, remplacer la ligne L65 :

```php
        $this->assertSame(0, FeatureFlag::query()->count());
```

par :

```php
        $this->assertNull(FeatureFlag::query()->where('key', 'property_compare')->first());
```

**Step 4 : lancer les tests, constater le vert**

Run : `php artisan test tests/Feature/Onboarding/HostAutoOnboardTest.php tests/Feature/Api/Admin/FeatureFlagTest.php`
Expected : PASS (tous verts).

Run : `node ../scripts/check-platform-catalogue-readers.mjs`
Expected : **rouge attendu jusqu'à la tâche 3**, puisque `Flag::HostAutoSpace` n'a pas encore de lecteur dans `app/`. On le relance à la tâche 3.

**Step 5 : ablation** (fichier tenu par C seul : la migration)

```bash
ABL=/private/tmp/claude-501/tck-633-lot-c-ablation; mkdir -p "$ABL"
F=database/migrations/2026_10_12_300000_enable_host_auto_space_flag.php
cp "$F" "$ABL/t1.php"; md5 -q "$F" > "$ABL/t1.md5"
```

Par Edit, remplacer `'enabled' => true,` par `'enabled' => false,` dans la migration.

Run : `php artisan test tests/Feature/Onboarding/HostAutoOnboardTest.php`
Expected : FAIL, `Failed asserting that false is true`.

```bash
cp "$ABL/t1.php" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t1.md5")" && echo RESTAURE
```

Expected : `RESTAURE`, puis relancer le test : PASS.

**Step 6 : signaler à la session les fichiers à commiter** : `Flag.php`, la migration `300000`, `FeatureFlagTest.php`, `HostAutoOnboardTest.php`.

---

## Task 2 : événements `PhoneVerified` et `SpaceCreated` (interfaces dues à F)

**Files:**
- Create: `takussan-api/app/Events/Auth/PhoneVerified.php`, `takussan-api/app/Events/Onboarding/SpaceCreated.php`
- Modify: `takussan-api/app/Services/Auth/PhoneVerificationService.php:172-183`
- Modify: `takussan-api/app/Services/Onboarding/HostIndividualOnboardingService.php:94-125`
- Test: `takussan-api/tests/Feature/Auth/Phone/PhoneVerifiedEventTest.php`, `takussan-api/tests/Feature/Onboarding/SpaceCreatedEventTest.php`

**Step 1 : écrire les tests qui échouent**

`tests/Feature/Auth/Phone/PhoneVerifiedEventTest.php` :

```php
<?php

namespace Tests\Feature\Auth\Phone;

use App\Events\Auth\PhoneVerified;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ReadsPhoneCodes;
use Tests\TestCase;

/**
 * TCK-633 (lot C, interface C → F) — `PhoneVerified` part du seul écrivain de
 * `phone_verified_at` (`PhoneVerificationService::markVerified`), une fois par vérification réelle.
 */
class PhoneVerifiedEventTest extends TestCase
{
    use ReadsPhoneCodes, RefreshDatabase;

    public function test_la_verification_du_numero_principal_annonce_phone_verified_une_fois(): void
    {
        Cache::flush();
        Event::fake([PhoneVerified::class]);
        $user = User::factory()->create(['phone' => '+221770000555', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);
        $code = $this->issuePhoneCode($user);

        $this->postJson('/api/auth/phone/verify-otp', ['code' => $code])->assertOk();

        Event::assertDispatchedTimes(PhoneVerified::class, 1);
        Event::assertDispatched(PhoneVerified::class, fn (PhoneVerified $e) => $e->user->is($user));

        // Le même numéro, déjà vérifié : `markVerified` sort tôt, rien de plus n'est annoncé.
        app(PhoneVerificationService::class)->markVerified($user->fresh(), '+221770000555');
        Event::assertDispatchedTimes(PhoneVerified::class, 1);
    }
}
```

`tests/Feature/Onboarding/SpaceCreatedEventTest.php` :

```php
<?php

namespace Tests\Feature\Onboarding;

use App\Events\Onboarding\SpaceCreated;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** TCK-633 (lot C, interface C → F) — l'assistant hôte annonce l'espace qu'il crée. */
class SpaceCreatedEventTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_assistant_annonce_l_espace_cree(): void
    {
        Event::fake([SpaceCreated::class]);
        $user = User::factory()->create(['phone' => '+221770000123', 'phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        $id = $this->postJson('/api/host/individual/onboard', [
            'agency' => ['name' => 'Espace de Fatou', 'primary_city' => 'Dakar', 'currency' => 'XOF'],
            'phone_otp' => ['phone' => '+221770000123'],
            'preferences' => ['primary_property_type' => 'apartment'],
            'cgu_accepted' => true,
        ])->assertCreated()->json('data.agency.id');

        Event::assertDispatchedTimes(SpaceCreated::class, 1);
        Event::assertDispatched(SpaceCreated::class, fn (SpaceCreated $e) => $e->agency->is(Agency::query()->findOrFail($id)));
    }
}
```

**Step 2 : les lancer, constater l'échec**

Run : `php artisan test tests/Feature/Auth/Phone/PhoneVerifiedEventTest.php tests/Feature/Onboarding/SpaceCreatedEventTest.php`
Expected : FAIL, `Class "App\Events\Auth\PhoneVerified" not found` (et de même pour `SpaceCreated`).

**Step 3 : implémenter**

`app/Events/Auth/PhoneVerified.php` :

```php
<?php

namespace App\Events\Auth;

use App\Models\User;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-633 (lot C) — un numéro PRINCIPAL vient d'être vérifié. Émis par le seul écrivain de
 * `phone_verified_at` ({@see \App\Services\Auth\PhoneVerificationService::markVerified}), après
 * le commit : un écouteur (l'offre de bienvenue du lot F) ne voit jamais une vérification défaite.
 * Le second numéro n'émet PAS cet événement : il n'ouvre ni compte, ni offre.
 */
class PhoneVerified implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(public User $user) {}
}
```

`app/Events/Onboarding/SpaceCreated.php` :

```php
<?php

namespace App\Events\Onboarding;

use App\Models\Agency;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-633 (lot C) — un espace individuel vient de naître : par l'assistant hôte ou par la
 * création automatique de « Publier ». Après le commit : la transaction d'onboarding peut encore
 * se défaire (409 `phone.taken`), et l'écouteur ne doit pas voir un espace qui n'existe plus.
 */
class SpaceCreated implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(public Agency $agency) {}
}
```

`PhoneVerificationService.php` (C seul) : ajouter `use App\Events\Auth\PhoneVerified;` sous `use App\Models\User;`, puis remplacer la dernière ligne de `markVerified()` :

```php
        $user->forceFill(['phone' => $phone, 'phone_verified_at' => now()])->save();
    }
```

par :

```php
        $user->forceFill(['phone' => $phone, 'phone_verified_at' => now()])->save();

        // TCK-633 (lot C) — l'interface C → F : une vérification RÉELLE (le retour anticipé
        // ci-dessus n'annonce rien).
        PhoneVerified::dispatch($user);
    }
```

`HostIndividualOnboardingService.php` : ajouter `use App\Events\Onboarding\SpaceCreated;` sous `use App\Models\User;`, puis, dans `onboard()`, insérer juste avant `            return [\n                'agency' => $agency->refresh(),` (ancre L113) :

```php
            // TCK-633 (lot C) — l'interface C → F, après commit (`ShouldDispatchAfterCommit`).
            SpaceCreated::dispatch($agency);

```

**Step 4 : lancer les tests, constater le vert**

Run : `php artisan test tests/Feature/Auth/Phone/PhoneVerifiedEventTest.php tests/Feature/Onboarding/SpaceCreatedEventTest.php tests/Feature/Onboarding/HostIndividualOnboardingTest.php`
Expected : PASS.

**Step 5 : ablation**

```bash
F=app/Services/Auth/PhoneVerificationService.php
cp "$F" "$ABL/t2.php"; md5 -q "$F" > "$ABL/t2.md5"
```

Par Edit, supprimer la ligne `        PhoneVerified::dispatch($user);`.

Run : `php artisan test tests/Feature/Auth/Phone/PhoneVerifiedEventTest.php`
Expected : FAIL, `The expected [App\Events\Auth\PhoneVerified] event was dispatched 0 times instead of 1 times.`

```bash
cp "$ABL/t2.php" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t2.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter** : les deux événements, les deux services, les deux tests.

---

## Task 3 : création automatique de l'espace

**Files:**
- Modify: `takussan-api/app/Services/Onboarding/HostIndividualOnboardingService.php` (`createAgency` L150-187, nouvelle méthode `autoOnboard`)
- Create: `takussan-api/app/Http/Requests/Onboarding/HostAutoOnboardRequest.php`, `takussan-api/app/Http/Controllers/HostAutoOnboardController.php`
- Modify: `takussan-api/routes/api/onboarding.php:1-7,23-25`
- Modify: `takussan-api/lang/{fr,en,wo}/onboarding.php`, `takussan-api/lang/{fr,en,wo}/errors.php` (groupe `onboarding`, par Edit)
- Test: `takussan-api/tests/Feature/Onboarding/HostAutoOnboardTest.php`

**Step 1 : écrire les tests qui échouent**

Compléter `HostAutoOnboardTest.php`. Ajouter aux `use` :

```php
use App\Events\Onboarding\SpaceCreated;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
```

puis ces méthodes dans la classe :

```php
    private const ROUTE = '/api/host/individual/auto-onboard';

    private function cookieDeProfil(TestResponse $reponse): ?string
    {
        foreach ($reponse->headers->getCookies() as $cookie) {
            if ($cookie->getName() === 'active_profile_id') {
                return $cookie->getValue();
            }
        }

        return null;
    }

    public function test_cree_l_espace_sans_question(): void
    {
        Event::fake([SpaceCreated::class]);
        $user = User::factory()->create(['first_name' => 'Awa']);
        Sanctum::actingAs($user);

        $reponse = $this->postJson(self::ROUTE, ['primary_city' => 'Thiès'])
            ->assertCreated()
            ->assertJsonPath('data.created', true)
            ->assertJsonPath('data.agency.name', 'Espace de Awa')
            ->assertJsonPath('data.agency.kind', 'individual');

        $agency = Agency::query()->findOrFail($reponse->json('data.agency.id'));
        $this->assertSame(AgencyKind::Individual, $agency->kind);
        $this->assertSame('XOF', $agency->currency->value);
        $this->assertSame($user->id, $agency->primary_admin_id);
        $this->assertSame('Thiès', $agency->settings['primary_city']);
        $this->assertNull($agency->settings['primary_property_type']);
        $this->assertSame('host_auto_space', $agency->settings['onboarding_source']);

        $admin = AgencyAdminProfile::query()->where('user_id', $user->id)->where('agency_id', $agency->id)->sole();
        $this->assertTrue(OwnerProfile::query()->where('user_id', $user->id)->where('agency_id', $agency->id)->exists());
        $this->assertSame("agency_admin:{$admin->id}", $reponse->json('data.active_profile_id'));
        $this->assertSame("agency_admin:{$admin->id}", $this->cookieDeProfil($reponse));
        $this->assertSame(0, Property::query()->count());
        Event::assertDispatched(SpaceCreated::class, fn (SpaceCreated $e) => $e->agency->is($agency));
    }

    public function test_idempotent_un_espace_existant_est_rendu_en_200(): void
    {
        Event::fake([SpaceCreated::class]);
        Sanctum::actingAs(User::factory()->create(['first_name' => 'Awa']));

        $premier = $this->postJson(self::ROUTE)->assertCreated()->json('data.agency.id');
        $this->postJson(self::ROUTE)
            ->assertOk()
            ->assertJsonPath('data.created', false)
            ->assertJsonPath('data.agency.id', $premier);

        $this->assertSame(1, Agency::query()->count());
        Event::assertDispatchedTimes(SpaceCreated::class, 1);
    }

    public function test_ville_absente_dakar_et_prenom_absent_mon_espace(): void
    {
        $user = User::factory()->create();
        $user->forceFill(['first_name' => ''])->save();
        Sanctum::actingAs($user);

        $id = $this->postJson(self::ROUTE, [])->assertCreated()
            ->assertJsonPath('data.agency.name', 'Mon espace')
            ->json('data.agency.id');

        $this->assertSame('Dakar', Agency::query()->findOrFail($id)->settings['primary_city']);
    }

    public function test_drapeau_eteint_403_auto_space_disabled(): void
    {
        FeatureFlag::query()->where('key', Flag::HostAutoSpace->value)->update(['enabled' => false]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson(self::ROUTE)->assertForbidden()->assertJsonPath('code', 'onboarding.auto_space_disabled');
        $this->assertSame(0, Agency::query()->count());
    }

    public function test_ville_trop_longue_refusee(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson(self::ROUTE, ['primary_city' => str_repeat('a', 121)])
            ->assertUnprocessable()->assertJsonValidationErrors(['primary_city']);
    }

    public function test_anonyme_401(): void
    {
        $this->postJson(self::ROUTE)->assertUnauthorized();
    }

    /** L'espace INDIVIDUEL d'un autre, où l'on n'est que bailleur, n'est jamais « le sien ». */
    public function test_n_adopte_pas_l_espace_d_un_autre(): void
    {
        $autre = User::factory()->create();
        $sienne = Agency::factory()->create(['kind' => AgencyKind::Individual, 'primary_admin_id' => $autre->id]);
        $user = User::factory()->create(['first_name' => 'Awa']);
        OwnerProfile::query()->create(['user_id' => $user->id, 'agency_id' => $sienne->id, 'status' => 'active']);
        Sanctum::actingAs($user);

        $id = $this->postJson(self::ROUTE)->assertCreated()->json('data.agency.id');

        $this->assertNotSame($sienne->id, $id);
        $this->assertFalse(AgencyAdminProfile::query()->where('user_id', $user->id)->where('agency_id', $sienne->id)->exists());
    }
```

**Step 2 : lancer, constater l'échec**

Run : `php artisan test tests/Feature/Onboarding/HostAutoOnboardTest.php`
Expected : FAIL. Les cas HTTP rendent 404 (la route n'existe pas) ; `test_le_drapeau_est_allume_par_sa_migration` reste vert.

**Step 3 : implémenter**

*a) Service.* Dans `HostIndividualOnboardingService.php`, ajouter aux `use` : `use App\Models\Enums\AgencyKind;` (déjà présent), rien d'autre. Ajouter sous la déclaration de classe :

```php
    /** TCK-633 (lot C) — la ville d'un espace créé sans question, quand rien n'est reçu. */
    public const AUTO_SPACE_DEFAULT_CITY = 'Dakar';
```

Remplacer la signature et l'en-tête de `createAgency` (L150-156) :

```php
    private function createAgency(User $user, array $payload): Agency
    {
        $name = (string) data_get($payload, 'agency.name');
        $primaryCity = (string) data_get($payload, 'agency.primary_city');
        $currencyValue = (string) data_get($payload, 'agency.currency', Currency::default()->value);
        $primaryPropertyType = (string) data_get($payload, 'preferences.primary_property_type');
        $preferredProvider = data_get($payload, 'payment_setting.preferred_provider');
```

par :

```php
    private function createAgency(User $user, array $payload, string $source = 'host_individual_wizard'): Agency
    {
        $name = (string) data_get($payload, 'agency.name');
        $primaryCity = (string) data_get($payload, 'agency.primary_city');
        $currencyValue = (string) data_get($payload, 'agency.currency', Currency::default()->value);
        // TCK-633 (lot C) — « aucun type de bien préféré » s'écrit `null`, pas `''` : la création
        // automatique ne le demande pas (même raisonnement que TCK-496 pour le moyen de paiement).
        $primaryPropertyType = data_get($payload, 'preferences.primary_property_type');
        $preferredProvider = data_get($payload, 'payment_setting.preferred_provider');
```

et, dans le tableau `$settings` de la même méthode :

```php
            'primary_property_type' => $primaryPropertyType,
            // Marker so downstream surfaces can distinguish between an
            // individual created via the wizard and one provisioned by a
            // super-admin (see TCK-263).
            'onboarding_source' => 'host_individual_wizard',
```

par :

```php
            'primary_property_type' => is_string($primaryPropertyType) && $primaryPropertyType !== '' ? $primaryPropertyType : null,
            // Marker so downstream surfaces can distinguish between an
            // individual created via the wizard and one provisioned by a
            // super-admin (see TCK-263). TCK-633 : `host_auto_space` pour la création automatique.
            'onboarding_source' => $source,
```

Ajouter la méthode publique après `onboard()` (avant `protected function verifyOtp`) :

```php
    /**
     * TCK-633 (lot C) — l'espace individuel créé SANS question, au clic sur « Publier ».
     *
     * Même agence, mêmes deux profils que l'assistant ({@see self::createAgency()},
     * {@see self::createAgencyAdminProfile()}, {@see self::createOwnerProfile()}), sans OTP ni CGU :
     * le numéro et les CGU se demandent au moment de PUBLIER (`PublishReadiness`), pas avant.
     *
     * Idempotent : l'espace individuel dont l'utilisateur est `primary_admin_id` est rendu tel
     * quel (`created = false`, jamais un 409). « Le sien » se juge par `primary_admin_id`, pas
     * par un profil propriétaire : un bailleur dans l'espace individuel d'un AUTRE ne doit pas
     * en devenir administrateur. Deux clics simultanés sont sérialisés sur la ligne du compte
     * (piège PostgreSQL n° 2 : la ligne parent, jamais un agrégat).
     *
     * @return array{created: bool, agency: Agency, agency_admin_profile: AgencyAdminProfile, owner_profile: OwnerProfile, active_profile: AgencyAdminProfile}
     */
    public function autoOnboard(User $user, ?string $primaryCity): array
    {
        return DB::transaction(function () use ($user, $primaryCity): array {
            User::query()->whereKey($user->getKey())->lockForUpdate()->firstOrFail();

            $existante = Agency::query()
                ->where('primary_admin_id', $user->id)
                ->where('kind', AgencyKind::Individual)
                ->orderBy('id')
                ->first();
            $created = $existante === null;

            $agency = $existante ?? $this->createAgency($user, [
                'agency' => [
                    'name' => $this->autoSpaceName($user),
                    'primary_city' => $this->autoSpaceCity($primaryCity),
                    'currency' => Currency::XOF->value,
                ],
            ], 'host_auto_space');

            $agencyAdminProfile = $this->createAgencyAdminProfile($user, $agency);
            $ownerProfile = $this->createOwnerProfile($user, $agency);

            if ($created) {
                activity('Onboarding')
                    ->causedBy($user)
                    ->performedOn($agency)
                    ->withProperties([
                        'user_id' => $user->id,
                        'agency_id' => $agency->id,
                        'source' => 'auto',
                    ])
                    ->event('host_individual_onboarded')
                    ->log('host_individual_onboarded');

                SpaceCreated::dispatch($agency);
            }

            return [
                'created' => $created,
                'agency' => $agency->refresh(),
                'agency_admin_profile' => $agencyAdminProfile->refresh(),
                'owner_profile' => $ownerProfile->refresh(),
                'active_profile' => $agencyAdminProfile,
            ];
        });
    }

    /** « Espace de {prénom} », « Mon espace » sans prénom — dans la langue du compte. */
    private function autoSpaceName(User $user): string
    {
        $prenom = trim((string) $user->first_name);
        $locale = is_string($user->preferred_language) && $user->preferred_language !== '' ? $user->preferred_language : null;

        return $prenom !== ''
            ? (string) __('onboarding.auto_space.name_with_first_name', ['first_name' => $prenom], $locale)
            : (string) __('onboarding.auto_space.name_default', [], $locale);
    }

    /** La ville reçue (texte libre, 120 caractères au plus), Dakar à défaut — sans le référentiel du lot D. */
    private function autoSpaceCity(?string $primaryCity): string
    {
        $ville = trim((string) $primaryCity);

        return $ville !== '' ? $ville : self::AUTO_SPACE_DEFAULT_CITY;
    }
```

*b) Requête.* `app/Http/Requests/Onboarding/HostAutoOnboardRequest.php` :

```php
<?php

namespace App\Http\Requests\Onboarding;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 (lot C) — le corps de `POST /api/host/individual/auto-onboard` : une ville, facultative. */
class HostAutoOnboardRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'primary_city' => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }
}
```

*c) Contrôleur.* `app/Http/Controllers/HostAutoOnboardController.php` :

```php
<?php

namespace App\Http\Controllers;

use App\Domain\Features\Flag;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Onboarding\HostAutoOnboardRequest;
use App\Services\Onboarding\HostIndividualOnboardingService;
use App\Services\Profiles\ActiveProfileResolver;
use App\Support\Feature;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * TCK-633 (lot C) — « Publier » sans assistant : l'espace individuel naît sans question.
 *
 * Derrière `host_auto_space` : éteint, 403 `onboarding.auto_space_disabled`, et le front reprend
 * l'assistant actuel, intact (le serveur arbitre, le front n'a pas à lire le drapeau). Idempotent :
 * 201 à la création, 200 pour l'espace existant. Pose le cookie du profil actif comme
 * {@see HostOnboardingController::individual()}.
 */
class HostAutoOnboardController extends Controller
{
    public function __construct(
        private readonly HostIndividualOnboardingService $service,
        private readonly ActiveProfileResolver $resolver,
    ) {}

    public function store(HostAutoOnboardRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_code_unless(Feature::isEnabled(Flag::HostAutoSpace->value, $user), 403, 'onboarding.auto_space_disabled');

        $city = $request->validated('primary_city');
        $result = $this->service->autoOnboard($user, is_string($city) ? $city : null);
        $compositeId = $this->resolver->compositeId($result['active_profile']);

        return response()->json([
            'data' => [
                'created' => $result['created'],
                'agency' => [
                    'id' => $result['agency']->id,
                    'name' => $result['agency']->name,
                    'slug' => $result['agency']->slug,
                    'kind' => $result['agency']->kind->value,
                    'status' => $result['agency']->status->value,
                ],
                'active_profile_id' => $compositeId,
            ],
        ], $result['created'] ? 201 : 200)->withCookie(Cookie::create(
            name: 'active_profile_id',
            value: $compositeId,
            expire: now()->addDays(30)->getTimestamp(),
            path: '/',
            domain: null,
            secure: (bool) config('session.secure', false),
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        ));
    }
}
```

*d) Route.* Dans `routes/api/onboarding.php`, ajouter `use App\Http\Controllers\HostAutoOnboardController;` sous `use App\Http\Controllers\AgentOnboardingController;`. Puis, après le bloc `host/individual/onboard` (ancre : `        ->name('host.individual.onboard')\n        ->middleware('throttle:5,1');`) :

```php

    // TCK-633 (lot C) — « Publier » sans assistant, derrière `host_auto_space`. Idempotent.
    Route::post('host/individual/auto-onboard', [HostAutoOnboardController::class, 'store'])
        ->name('host.individual.auto-onboard')
        ->middleware('throttle:5,1');
```

*e) Langues.* Dans `lang/fr/onboarding.php`, après le bloc `'host_individual' => [...],` (ancre : `            'already_onboarded' => 'Vous possédez déjà une agence personnelle.',\n        ],\n    ],`) :

```php
    'auto_space' => [
        'name_with_first_name' => 'Espace de :first_name',
        'name_default' => 'Mon espace',
    ],
```

Même insertion pour `lang/en/onboarding.php` (ancre `'already_onboarded' => 'You already own a personal agency.',`) avec `'Space of :first_name'` / `'My space'`. Pour `lang/wo/onboarding.php` (ancre `'already_onboarded' => 'Am nga ba noppi ab ajaãs personnel.',`), avec `'Bérëbu :first_name'` / `'Sama bérëb'`.

Dans `lang/{fr,en,wo}/errors.php` (co-tenu, par Edit), insérer après la ligne `'agent_not_owner' => …` du groupe `onboarding` (ordre alphabétique) :

- fr, ancre `        'agent_not_owner' => 'Vous n\'avez pas accès à ce profil agent.',` :
  `        'auto_space_disabled' => "La création automatique de l'espace est désactivée : passez par l'assistant.",`
- en, ancre `        'agent_not_owner' => 'You don\'t have access to this agent profile.',` :
  `        'auto_space_disabled' => 'Automatic space creation is turned off: use the setup wizard.',`
- wo, ancre `        'agent_not_owner' => 'Amul nga sañ-sañ ci profil agent bii.',` :
  `        'auto_space_disabled' => 'Sos bérëb bu boppam dañu ko fay : jaaral ci wizard bi.',`

**Step 4 : lancer les tests, constater le vert**

Run : `php artisan test tests/Feature/Onboarding/HostAutoOnboardTest.php tests/Feature/Onboarding/HostIndividualOnboardingTest.php tests/Feature/Onboarding/SpaceCreatedEventTest.php tests/Unit/Lang/LangGroupParityTest.php`
Expected : PASS.

Run : `node ../scripts/check-platform-catalogue-readers.mjs && node ../scripts/check-inline-validation.mjs`
Expected : les deux sortent en 0.

**Step 5 : ablation** (contrôleur tenu par C seul)

```bash
F=app/Http/Controllers/HostAutoOnboardController.php
cp "$F" "$ABL/t3.php"; md5 -q "$F" > "$ABL/t3.md5"
```

Par Edit, supprimer la ligne `        abort_code_unless(Feature::isEnabled(…), 403, 'onboarding.auto_space_disabled');`.

Run : `php artisan test tests/Feature/Onboarding/HostAutoOnboardTest.php --filter=drapeau_eteint`
Expected : FAIL, `Expected response status code [403] but received 201.`

```bash
cp "$ABL/t3.php" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t3.md5")" && echo RESTAURE
```

Seconde ablation, sur le service (tenu par C seul) : `cp` du service vers `$ABL/t3b.php` et `md5`. Remplacer `->where('primary_admin_id', $user->id)` par `->whereNotNull('primary_admin_id')`. Run : `--filter=n_adopte_pas`. Expected : FAIL. Restaurer par `cp` et vérifier par `md5`.

**Step 6 : signaler les fichiers à commiter** : le service, le contrôleur, la requête, la route, `lang/*/onboarding.php`, `lang/*/errors.php`, le test.

---

## Task 4 : préférences de contact sur `users` (`/api/auth/me`, cases WhatsApp)

**Files:**
- Create: `takussan-api/database/migrations/2026_10_12_300100_add_contact_preferences_to_users_table.php`
- Modify: `takussan-api/app/Models/User.php:52-71,88-110`
- Modify: `takussan-api/app/Http/Resources/UserResource.php:55-61` **[EXT]**
- Modify: `takussan-api/app/Http/Requests/Auth/UpdateProfileRequest.php:52-55`
- Modify: `takussan-api/app/Http/Controllers/Api/Auth/AuthController.php:163-167` **[EXT]**
- Test: `takussan-api/tests/Feature/Auth/ContactPreferencesTest.php`

**Step 1 : écrire le test qui échoue**

```php
<?php

namespace Tests\Feature\Auth;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** TCK-633 (lot C) — les six colonnes du contrat, `GET /api/auth/me` pour soi seul, les cases WhatsApp. */
class ContactPreferencesTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_schema(): void
    {
        foreach (['phone_whatsapp', 'secondary_phone', 'secondary_phone_verified_at', 'secondary_phone_whatsapp', 'terms_accepted_at', 'terms_version'] as $colonne) {
            $this->assertTrue(Schema::hasColumn('users', $colonne), $colonne);
        }
        $this->assertTrue(DB::table('pg_indexes')
            ->where('tablename', 'users')
            ->where('indexname', 'users_secondary_phone_verified_unique')
            ->exists());
    }

    public function test_me_rend_les_preferences_de_contact(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('phone_whatsapp', false)
            ->assertJsonPath('secondary_phone', null)
            ->assertJsonPath('secondary_phone_verified_at', null)
            ->assertJsonPath('secondary_phone_whatsapp', false)
            ->assertJsonPath('terms_accepted_at', null);
    }

    public function test_les_cases_whatsapp_passent_par_le_profil(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/auth/profile', ['phone_whatsapp' => true, 'secondary_phone_whatsapp' => true])
            ->assertOk()
            ->assertJsonPath('phone_whatsapp', true)
            ->assertJsonPath('secondary_phone_whatsapp', true);
        $this->assertTrue($user->fresh()->phone_whatsapp);

        $this->putJson('/api/auth/profile', ['phone_whatsapp' => 'peut-être'])
            ->assertUnprocessable()->assertJsonValidationErrors(['phone_whatsapp']);
    }

    /** `UserResource` sert aussi les membres d'une agence : le second numéro d'autrui ne sort pas. */
    public function test_les_preferences_ne_sortent_pas_pour_un_autre(): void
    {
        $autre = User::factory()->create();
        $autre->forceFill(['secondary_phone' => '+221770000777', 'secondary_phone_verified_at' => now()])->save();
        $moi = User::factory()->create();
        $requete = Request::create('/');
        $requete->setUserResolver(fn () => $moi);

        $tableau = (new UserResource($autre))->resolve($requete);

        foreach (['phone_whatsapp', 'secondary_phone', 'secondary_phone_verified_at', 'secondary_phone_whatsapp', 'terms_accepted_at'] as $cle) {
            $this->assertArrayNotHasKey($cle, $tableau);
        }
    }
}
```

**Step 2 : lancer, constater l'échec**

Run : `php artisan test tests/Feature/Auth/ContactPreferencesTest.php`
Expected : FAIL, `test_le_schema` en premier (`phone_whatsapp`).

**Step 3 : implémenter**

Migration `database/migrations/2026_10_12_300100_add_contact_preferences_to_users_table.php` :

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (lot C) — les préférences de contact d'un compte : WhatsApp sur chaque numéro, un
 * second numéro VÉRIFIÉ, et l'acceptation datée des CGU (première publication).
 *
 * `users_secondary_phone_verified_unique` : un second numéro n'est vérifié que sur un compte
 * vivant à la fois. Index partiel sur la colonne BRUTE : son seul écrivain
 * (`PhoneVerificationService::markSecondaryVerified`) l'écrit déjà sous la forme canonique
 * (`CanonicalPhone::fold`), et il TESTE avant d'écrire (piège PostgreSQL n° 1) — l'index n'est
 * que le dernier recours. Nom explicite (37 caractères ≤ 63).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('phone_whatsapp')->default(false);
            $table->string('secondary_phone', 30)->nullable();
            $table->timestamp('secondary_phone_verified_at')->nullable();
            $table->boolean('secondary_phone_whatsapp')->default(false);
            $table->timestamp('terms_accepted_at')->nullable();
            $table->string('terms_version', 40)->nullable();
        });

        DB::statement(
            'CREATE UNIQUE INDEX users_secondary_phone_verified_unique ON users (secondary_phone) '
            .'WHERE secondary_phone_verified_at IS NOT NULL AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_secondary_phone_verified_unique');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'phone_whatsapp', 'secondary_phone', 'secondary_phone_verified_at',
                'secondary_phone_whatsapp', 'terms_accepted_at', 'terms_version',
            ]);
        });
    }
};
```

`User.php` (C seul). Dans `$fillable`, après `'phone_verified_at',` :

```php
        // TCK-633 (lot C) — les cases WhatsApp seulement. `secondary_phone*` et `terms_*` ne sont
        // PAS assignables en masse : leurs écrivains (`PhoneVerificationService`,
        // `PublishReadiness`) passent par `forceFill`.
        'phone_whatsapp', 'secondary_phone_whatsapp',
```

Dans `casts()`, après `'phone_verified_at' => 'datetime',` :

```php
            'phone_whatsapp' => 'boolean',
            'secondary_phone_verified_at' => 'datetime',
            'secondary_phone_whatsapp' => 'boolean',
            'terms_accepted_at' => 'datetime',
```

**Ne rien ajouter à `logOnly`** (L341-350). Le second numéro ne doit jamais entrer dans le journal d'activité (contrainte du ticket).

`UserResource.php` **[EXT]** : insérer avant `            'agency_id' => $this->agency_id,` (ancre) :

```php
            // TCK-633 (lot C) — les préférences de contact ne sortent que pour SOI : `UserResource`
            // sert aussi les membres d'une agence (`AgencyController`), et le second numéro d'un
            // collègue n'a rien à faire dans cette liste.
            $this->mergeWhen($request->user()?->getKey() === $this->resource->getKey(), fn () => [
                'phone_whatsapp' => (bool) $this->phone_whatsapp,
                'secondary_phone' => $this->secondary_phone,
                'secondary_phone_verified_at' => $this->iso($this->secondary_phone_verified_at),
                'secondary_phone_whatsapp' => (bool) $this->secondary_phone_whatsapp,
                'terms_accepted_at' => $this->iso($this->terms_accepted_at),
            ]),
```

`UpdateProfileRequest.php` : après `            ...PhoneChangeGuard::PROOF_RULES,` (ancre) :

```php
            // TCK-633 (lot C) — une case WhatsApp par numéro.
            'phone_whatsapp' => ['sometimes', 'boolean'],
            'secondary_phone_whatsapp' => ['sometimes', 'boolean'],
```

`AuthController.php` **[EXT]** : après `        $remplace = null;` (ancre unique, L167) :

```php

        // TCK-633 (lot C) — les cases WhatsApp, une par numéro. `boolean()` lit aussi bien le
        // JSON (`true`) que le FormData du profil (`'1'`).
        foreach (['phone_whatsapp', 'secondary_phone_whatsapp'] as $case) {
            if ($request->has($case)) {
                $data[$case] = $request->boolean($case);
            }
        }
```

**Step 4 : lancer les tests, constater le vert**

Run : `php artisan test tests/Feature/Auth/ContactPreferencesTest.php tests/Feature/Auth/AuthProfileTest.php`
Expected : PASS.

**Step 5 : ablation** (`UserResource` **[EXT]**. Si l'extension est refusée, ablater la case `phone_whatsapp` de `UpdateProfileRequest`)

```bash
F=app/Http/Resources/UserResource.php
cp "$F" "$ABL/t4.php"; md5 -q "$F" > "$ABL/t4.md5"
```

Par Edit, remplacer `$request->user()?->getKey() === $this->resource->getKey()` par `true`.

Run : `php artisan test tests/Feature/Auth/ContactPreferencesTest.php --filter=pour_un_autre`
Expected : FAIL, `Failed asserting that an array does not have the key 'phone_whatsapp'.`

```bash
cp "$ABL/t4.php" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t4.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter.**

---

## Task 5 : second numéro (`/api/auth/secondary-phone/*`)

**Files:**
- Modify: `takussan-api/app/Services/Auth/PhoneVerificationService.php` (après `markVerified`)
- Create: `takussan-api/app/Http/Requests/Auth/SecondaryPhoneRequest.php`, `takussan-api/app/Http/Requests/Auth/VerifySecondaryPhoneRequest.php`, `takussan-api/app/Http/Controllers/Api/Auth/SecondaryPhoneController.php`
- Modify: `takussan-api/routes/api/auth.php:12-13,78-80`
- Modify: `takussan-api/lang/{fr,en,wo}/errors.php` (nouveau groupe `secondary_phone`, par Edit)
- Test: `takussan-api/tests/Feature/Auth/Phone/SecondaryPhoneTest.php`

**Step 1 : écrire le test qui échoue**

```php
<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\Support\JournalCapture;
use Tests\TestCase;

/**
 * TCK-633 (lot C, AC8) — le second numéro : vérifié par code (portée distincte), refusé s'il est
 * le principal du compte ou un numéro vérifié d'un autre compte, jamais un identifiant de
 * connexion, jamais en clair dans les journaux.
 */
class SecondaryPhoneTest extends TestCase
{
    use JournalCapture, RefreshDatabase;

    private const PRINCIPAL = '+221770000601';

    private const SECOND = '+221770000602';

    private FakeSmsRouter $sms;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
        $this->user = User::factory()->create(['phone' => self::PRINCIPAL, 'phone_verified_at' => now()]);
        Sanctum::actingAs($this->user);
    }

    private function envoyer(string $numero): TestResponse
    {
        return $this->postJson('/api/auth/secondary-phone/send-otp', ['phone' => $numero]);
    }

    private function ajouter(string $numero, bool $whatsapp = false): TestResponse
    {
        $this->envoyer($numero)->assertOk()->assertJsonPath('data.sent', true);

        return $this->postJson('/api/auth/secondary-phone/verify', [
            'phone' => $numero,
            'code' => $this->sms->lastCodeFor($numero),
            'whatsapp' => $whatsapp,
        ]);
    }

    public function test_ajoute_verifie_et_retire_un_second_numero(): void
    {
        $this->ajouter(self::SECOND, true)->assertOk()
            ->assertJsonPath('secondary_phone', self::SECOND)
            ->assertJsonPath('secondary_phone_whatsapp', true);
        $this->assertNotNull($this->user->fresh()->secondary_phone_verified_at);
        $this->assertSame(self::PRINCIPAL, $this->user->fresh()->phone);

        $this->deleteJson('/api/auth/secondary-phone')->assertOk()->assertJsonPath('secondary_phone', null);
        $frais = $this->user->fresh();
        $this->assertNull($frais->secondary_phone);
        $this->assertNull($frais->secondary_phone_verified_at);
        $this->assertFalse($frais->secondary_phone_whatsapp);
    }

    public function test_un_mauvais_code_ne_verifie_rien(): void
    {
        $this->envoyer(self::SECOND)->assertOk();
        $faux = $this->sms->lastCodeFor(self::SECOND) === '000000' ? '111111' : '000000';

        $this->postJson('/api/auth/secondary-phone/verify', ['phone' => self::SECOND, 'code' => $faux])
            ->assertUnprocessable()->assertJsonPath('code', 'secondary_phone.code_invalid');
        $this->assertNull($this->user->fresh()->secondary_phone);
    }

    /** Le code du numéro principal ne vérifie pas le second : la portée est distincte. */
    public function test_le_code_du_principal_ne_vaut_pas_pour_le_second(): void
    {
        $this->user->forceFill(['phone_verified_at' => null])->save();
        $this->postJson('/api/auth/phone/send-otp')->assertOk();
        $codeDuPrincipal = $this->sms->lastCodeFor(self::PRINCIPAL);

        $this->postJson('/api/auth/secondary-phone/verify', ['phone' => self::SECOND, 'code' => $codeDuPrincipal])
            ->assertUnprocessable()->assertJsonPath('code', 'secondary_phone.code_invalid');
    }

    public function test_le_numero_principal_du_compte_est_refuse(): void
    {
        $this->envoyer(self::PRINCIPAL)->assertUnprocessable()->assertJsonPath('code', 'secondary_phone.same_as_primary');
        $this->assertSame([], $this->sms->sentTo(self::PRINCIPAL));
    }

    /**
     * Vérification adverse m4 (décision du porteur, `PhoneVerificationController::neutralSend`) :
     * un numéro vérifié AILLEURS reçoit la réponse d'un envoi réel, sans SMS — la réponse ne dit
     * pas qu'il est inscrit. Il n'est jamais enregistré : aucun code n'existe pour lui.
     */
    public function test_le_principal_verifie_d_un_autre_compte_est_refuse_sans_le_dire(): void
    {
        User::factory()->create(['phone' => self::SECOND, 'phone_verified_at' => now()]);

        $this->envoyer(self::SECOND)->assertOk()->assertJsonPath('data.sent', true);
        $this->assertSame([], $this->sms->sentTo(self::SECOND));
        $this->postJson('/api/auth/secondary-phone/verify', ['phone' => self::SECOND, 'code' => '123456'])
            ->assertUnprocessable()->assertJsonPath('code', 'secondary_phone.code_invalid');
        $this->assertNull($this->user->fresh()->secondary_phone);
    }

    public function test_le_second_verifie_d_un_autre_compte_est_refuse(): void
    {
        User::factory()->create()->forceFill(['secondary_phone' => self::SECOND, 'secondary_phone_verified_at' => now()])->save();

        $this->envoyer(self::SECOND)->assertOk();
        $this->assertSame([], $this->sms->sentTo(self::SECOND));
    }

    public function test_un_numero_pris_entre_l_envoi_et_la_verification_rend_409(): void
    {
        $this->envoyer(self::SECOND)->assertOk();
        $code = $this->sms->lastCodeFor(self::SECOND);
        User::factory()->create(['phone' => self::SECOND, 'phone_verified_at' => now()]);

        $this->postJson('/api/auth/secondary-phone/verify', ['phone' => self::SECOND, 'code' => $code])
            ->assertStatus(409)->assertJsonPath('code', 'secondary_phone.taken');
        $this->assertNull($this->user->fresh()->secondary_phone);
    }

    public function test_un_numero_injoignable_est_refuse_a_la_validation(): void
    {
        $this->envoyer('+330612345678')->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    }

    /** AC8 — le second numéro ne permet pas de se connecter au compte qui le porte. */
    public function test_le_second_numero_n_ouvre_pas_le_compte(): void
    {
        config(['auth.phone_login.enabled' => true]);
        $this->ajouter(self::SECOND)->assertOk();
        $this->app['auth']->forgetGuards();
        $this->travel(61)->seconds();

        $this->postJson('/api/auth/phone/request-code', ['phone' => self::SECOND])->assertStatus(202);
        $entree = $this->postJson('/api/auth/phone/verify-code', [
            'phone' => self::SECOND,
            'code' => $this->sms->lastCodeFor(self::SECOND),
        ])->assertOk();

        $this->assertNotSame($this->user->id, $entree->json('user.id'));
        $this->assertTrue($entree->json('is_new_account'));
    }

    public function test_le_numero_n_est_jamais_journalise_en_clair(): void
    {
        $this->captureJournal();
        $this->ajouter(self::SECOND)->assertOk();
        $this->deleteJson('/api/auth/secondary-phone')->assertOk();

        $this->assertJournalSansTemoin(self::SECOND, '770000602');
        $this->assertFalse(Activity::query()->get()->contains(
            fn (Activity $a) => str_contains((string) json_encode($a->properties), '770000602'),
        ));
    }
}
```

**Step 2 : lancer, constater l'échec**

Run : `php artisan test tests/Feature/Auth/Phone/SecondaryPhoneTest.php`
Expected : FAIL, 404 sur `secondary-phone/send-otp`.

**Step 3 : implémenter**

*a) Service.* Dans `PhoneVerificationService.php`, ajouter après `markVerified()` :

```php
    // -----------------------------------------------------------------
    // TCK-633 (lot C) — le second numéro (jamais un identifiant de connexion)
    // -----------------------------------------------------------------

    public const SECONDARY_SCOPE = 'secondary-phone';

    /**
     * La portée du code d'un second numéro : par COMPTE, distincte de celle du principal
     * (`userSubject`) et de l'entrée par téléphone. Un code reçu pour un usage ne vaut pour aucun
     * autre.
     */
    public function secondaryScope(User $user): string
    {
        return self::SECONDARY_SCOPE.':'.$user->getKey();
    }

    /**
     * Ce numéro est-il VÉRIFIÉ sur un autre compte, comme principal ou comme second ? Le principal
     * se compare sur l'expression de `users_phone_verified_unique` (`CanonicalPhone::sql`/`fold`
     * par paire) ; le second est déjà écrit sous forme canonique par {@see self::markSecondaryVerified}.
     */
    public function isSecondaryTaken(string $phone, User $except): bool
    {
        $canonique = CanonicalPhone::fold($phone);

        return User::query()
            ->whereKeyNot($except->getKey())
            ->where(fn ($q) => $q
                ->where(fn ($p) => $p
                    ->whereRaw(CanonicalPhone::sql('phone').' = ?', [$canonique])
                    ->whereNotNull('phone_verified_at'))
                ->orWhere(fn ($s) => $s
                    ->where('secondary_phone', $canonique)
                    ->whereNotNull('secondary_phone_verified_at')))
            ->exists();
    }

    public function isPrimaryOf(User $user, string $phone): bool
    {
        return is_string($user->phone) && $user->phone !== ''
            && CanonicalPhone::fold($user->phone) === CanonicalPhone::fold($phone);
    }

    /**
     * Le seul écrivain de `secondary_phone*`. TESTE avant d'écrire (409 plutôt qu'une violation de
     * `users_secondary_phone_verified_unique`, qui abandonnerait la transaction — piège n° 1).
     * N'émet pas `PhoneVerified` : le second numéro n'ouvre rien.
     */
    public function markSecondaryVerified(User $user, string $phone, bool $whatsapp): void
    {
        abort_code_if($this->isPrimaryOf($user, $phone), 422, 'secondary_phone.same_as_primary');
        abort_code_if($this->isSecondaryTaken($phone, $user), 409, 'secondary_phone.taken');

        $user->forceFill([
            'secondary_phone' => CanonicalPhone::fold($phone),
            'secondary_phone_verified_at' => now(),
            'secondary_phone_whatsapp' => $whatsapp,
        ])->save();
    }

    public function clearSecondary(User $user): void
    {
        $user->forceFill([
            'secondary_phone' => null,
            'secondary_phone_verified_at' => null,
            'secondary_phone_whatsapp' => false,
        ])->save();
    }
```

*b) Requêtes.* `app/Http/Requests/Auth/SecondaryPhoneRequest.php` :

```php
<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;
use App\Rules\TelephoneJoignable;

/** TCK-633 (lot C) — le numéro d'un envoi de code au second numéro. */
class SecondaryPhoneRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'phone' => ['required', 'string', 'max:30', 'regex:/^\+[1-9]\d{6,14}$/', new TelephoneJoignable],
        ];
    }

    public function messages(): array
    {
        return ['phone.regex' => __('validation.rules.phone_e164')];
    }
}
```

`app/Http/Requests/Auth/VerifySecondaryPhoneRequest.php` :

```php
<?php

namespace App\Http\Requests\Auth;

/** TCK-633 (lot C) — le code reçu sur le second numéro, et sa case WhatsApp. */
class VerifySecondaryPhoneRequest extends SecondaryPhoneRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return parent::rules() + [
            'code' => ['required', 'string', 'digits:6'],
            'whatsapp' => ['sometimes', 'boolean'],
        ];
    }
}
```

*c) Contrôleur.* `app/Http/Controllers/Api/Auth/SecondaryPhoneController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Auth;

use App\Exceptions\ApiError;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\SecondaryPhoneRequest;
use App\Http\Requests\Auth\VerifySecondaryPhoneRequest;
use App\Http\Resources\UserResource;
use App\Services\Auth\PhoneSendQuota;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-633 (lot C) — le second numéro d'un compte : envoi du code, vérification, retrait.
 *
 * Mêmes portes que tout code (`PhoneVerificationController::resend`) : indicatif servi, délai
 * de renvoi, borne par numéro (`PhoneSendQuota`), plafond journalier global. Un numéro déjà
 * vérifié AILLEURS reçoit la réponse d'un envoi réel sans SMS (vérification adverse m4) ; le refus
 * ferme est à la vérification (`markSecondaryVerified`, 409). Le numéro n'est jamais journalisé.
 */
class SecondaryPhoneController extends Controller
{
    public function __construct(
        private readonly PhoneVerificationService $service,
        private readonly PhoneSendQuota $quota,
    ) {}

    public function sendOtp(SecondaryPhoneRequest $request): JsonResponse
    {
        $user = $request->user();
        $phone = (string) $request->validated('phone');

        abort_code_if($this->service->isPrimaryOf($user, $phone), 422, 'secondary_phone.same_as_primary');
        abort_code_unless(PhoneVerificationService::countryAllowed($phone), 422, 'secondary_phone.country_not_allowed');

        $scope = $this->service->secondaryScope($user);
        $this->refuseWhileCoolingDown($this->service->sendToAvailableIn($scope, $phone));
        $this->quota->ensureAvailable($phone);

        if ($this->service->isSecondaryTaken($phone, $user)) {
            $this->quota->hit($phone);
            $this->service->holdCooldownFor($scope, $phone);

            return $this->sent();
        }

        abort_code_unless($this->service->sendCodeTo($scope, $phone, $user->preferred_language), 503, 'secondary_phone.capacity_reached');
        $this->quota->hit($phone);

        return $this->sent();
    }

    public function verify(VerifySecondaryPhoneRequest $request): JsonResponse
    {
        $user = $request->user();
        $phone = (string) $request->validated('phone');

        abort_code_unless(
            $this->service->verifyCodeFor($this->service->secondaryScope($user), $phone, (string) $request->validated('code')),
            422,
            'secondary_phone.code_invalid',
        );
        $this->service->markSecondaryVerified($user, $phone, $request->boolean('whatsapp'));

        return $this->json(new UserResource($user->fresh()));
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->service->clearSecondary($user);

        return $this->json(new UserResource($user->fresh()));
    }

    private function sent(): JsonResponse
    {
        return $this->json(['data' => ['sent' => true, 'retry_after' => $this->service->retryAfter()]]);
    }

    /** Même refus que le numéro principal (TCK-622) : 429 `phone.resend_too_soon` et les secondes restantes. */
    private function refuseWhileCoolingDown(int $seconds): void
    {
        if ($seconds > 0) {
            throw (new ApiError(429, 'phone.resend_too_soon', ['seconds' => $seconds], ['Retry-After' => (string) $seconds]))
                ->with(['retry_after' => $seconds]);
        }
    }
}
```

*d) Routes.* Dans `routes/api/auth.php`, ajouter `use App\Http\Controllers\Api\Auth\SecondaryPhoneController;` après `use App\Http\Controllers\Api\Auth\PhoneVerificationController;`. Puis, après le bloc `phone/change-code` (ancre : `        ->name('auth.phone.change-code');`) :

```php

    // TCK-633 (lot C) — le second numéro : jamais un identifiant de connexion (le login par
    // téléphone ne lit que `phone`). Mêmes bornes que `send-otp` ; `auth-phone-send` compte sur
    // le numéro du corps, donc sur le second numéro.
    Route::post('/secondary-phone/send-otp', [SecondaryPhoneController::class, 'sendOtp'])
        ->middleware(['throttle:3,1', 'throttle:auth-phone-send'])
        ->name('auth.secondary-phone.send-otp');
    Route::post('/secondary-phone/verify', [SecondaryPhoneController::class, 'verify'])
        ->middleware('throttle:5,1')
        ->name('auth.secondary-phone.verify');
    Route::delete('/secondary-phone', [SecondaryPhoneController::class, 'destroy'])
        ->name('auth.secondary-phone.destroy');
```

*e) Erreurs.* Dans `lang/{fr,en,wo}/errors.php` (co-tenu, par Edit), insérer le nouveau groupe juste avant `    'segregation' => [` (ancre unique, ordre alphabétique entre `search_alert` et `segregation`).

fr :

```php
    'secondary_phone' => [
        'capacity_reached' => "L'envoi de codes est momentanément suspendu. Réessayez plus tard.",
        'code_invalid' => 'Code de vérification invalide ou expiré.',
        'country_not_allowed' => 'Aucun code ne peut être envoyé vers ce pays.',
        'same_as_primary' => 'Ce numéro est déjà votre numéro principal.',
        'taken' => 'Ce numéro est déjà vérifié sur un autre compte.',
    ],
```

en :

```php
    'secondary_phone' => [
        'capacity_reached' => 'Sending codes is temporarily paused. Please try again later.',
        'code_invalid' => 'Invalid or expired verification code.',
        'country_not_allowed' => 'No code can be sent to this country.',
        'same_as_primary' => 'This number is already your main number.',
        'taken' => 'This number is already verified on another account.',
    ],
```

wo :

```php
    'secondary_phone' => [
        'capacity_reached' => 'Yónnee kood yi taxaw na ci kanam. Jéemaatal ci kanam.',
        'code_invalid' => 'Code dëggal bi baaxul walla jeex na.',
        'country_not_allowed' => 'Mënuñu yónne benn kood ci réew mii.',
        'same_as_primary' => 'Nimero bii mooy sa nimero bu njëkk.',
        'taken' => 'Nimero bii, beneen kont la ko wóor.',
    ],
```

**Step 4 : lancer les tests, constater le vert**

Run : `php artisan test tests/Feature/Auth/Phone/SecondaryPhoneTest.php tests/Feature/Auth/Phone/PhoneLoginTest.php tests/Unit/Lang/LangGroupParityTest.php`
Expected : PASS.

**Step 5 : ablation** (contrôleur tenu par C seul)

```bash
F=app/Http/Controllers/Api/Auth/SecondaryPhoneController.php
cp "$F" "$ABL/t5.php"; md5 -q "$F" > "$ABL/t5.md5"
```

Par Edit, supprimer le bloc `if ($this->service->isSecondaryTaken($phone, $user)) { … }` de `sendOtp`.

Run : `php artisan test tests/Feature/Auth/Phone/SecondaryPhoneTest.php --filter=refuse`
Expected : FAIL. `test_le_principal_verifie_…` : un SMS part (`Failed asserting that two arrays are identical`).

```bash
cp "$ABL/t5.php" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t5.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter.**

---

## Task 6 : contacts sur place (`property_contacts`)

**Files:**
- Create: `takussan-api/database/migrations/2026_10_12_300200_create_property_contacts_table.php`
- Create: `takussan-api/app/Models/PropertyContact.php`, `takussan-api/app/Http/Requests/Api/ReplacePropertyContactsRequest.php`, `takussan-api/app/Http/Controllers/Api/PropertyContactController.php`
- Modify: `takussan-api/app/Models/Property.php:846-849` (co-tenu D, F, par Edit)
- Modify: `takussan-api/routes/api/properties.php:8,67`
- Test: `takussan-api/tests/Feature/Property/PropertyContactsTest.php`

**Step 1 : écrire le test qui échoue**

```php
<?php

namespace Tests\Feature\Property;

use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** TCK-633 (lot C, AC12) — trois contacts sur place au plus, joignables, absents de toute ressource. */
class PropertyContactsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create();
        $this->bien = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => null]);
    }

    /** @return list<array<string, mixed>> */
    private function trois(): array
    {
        return [
            ['label' => 'Gardien', 'phone' => '+221770000701', 'has_whatsapp' => true],
            ['label' => null, 'phone' => '+221770000702', 'has_whatsapp' => false],
            ['label' => 'Voisine', 'phone' => '+221770000703'],
        ];
    }

    public function test_le_schema_et_ses_noms(): void
    {
        $index = DB::table('pg_indexes')->where('tablename', 'property_contacts')->pluck('indexname')->all();
        $this->assertContains('property_contacts_property_position_idx', $index);
        $this->assertTrue(DB::table('information_schema.table_constraints')
            ->where('table_name', 'property_contacts')->where('constraint_name', 'property_contacts_property_fk')->exists());
    }

    public function test_remplace_la_liste_et_la_relit_dans_l_ordre(): void
    {
        Sanctum::actingAs($this->owner);

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => $this->trois()])
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.label', 'Gardien')
            ->assertJsonPath('data.0.has_whatsapp', true)
            ->assertJsonPath('data.2.phone', '+221770000703')
            ->assertJsonPath('data.2.position', 2);

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => [['phone' => '+221770000704']]])
            ->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(1, $this->bien->contacts()->count());

        $this->getJson("/api/properties/{$this->bien->id}/contacts")->assertOk()->assertJsonPath('data.0.phone', '+221770000704');

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => []])->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_plafond_de_trois(): void
    {
        Sanctum::actingAs($this->owner);
        $quatre = [...$this->trois(), ['phone' => '+221770000704']];

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => $quatre])
            ->assertUnprocessable()->assertJsonValidationErrors(['contacts']);
        $this->assertSame(0, $this->bien->contacts()->count());
    }

    public function test_format_joignable(): void
    {
        Sanctum::actingAs($this->owner);

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => [['phone' => '+330612345678']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['contacts.0.phone']);
        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => [['phone' => '+221770000701', 'label' => str_repeat('a', 61)]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['contacts.0.label']);
    }

    public function test_un_tiers_n_y_touche_pas(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/properties/{$this->bien->id}/contacts")->assertForbidden();
        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => $this->trois()])->assertForbidden();
    }

    public function test_absents_de_toute_ressource_de_bien(): void
    {
        $this->bien->contacts()->create(['label' => 'Gardien', 'phone' => '+221771112233', 'has_whatsapp' => true, 'position' => 0]);

        $public = $this->getJson("/api/public/properties/{$this->bien->slug}")->assertOk();
        $this->assertStringNotContainsString('771112233', (string) $public->getContent());

        Sanctum::actingAs($this->owner);
        $prive = $this->getJson("/api/properties/{$this->bien->id}")->assertOk();
        $this->assertStringNotContainsString('771112233', (string) $prive->getContent());
    }
}
```

**Step 2 : lancer, constater l'échec**

Run : `php artisan test tests/Feature/Property/PropertyContactsTest.php`
Expected : FAIL. `relation "property_contacts" does not exist` / `Call to undefined method …::contacts()`.

**Step 3 : implémenter**

Migration `database/migrations/2026_10_12_300200_create_property_contacts_table.php` :

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (lot C) — les contacts SUR PLACE d'un bien (gardien, voisin) : trois au plus, au format
 * joignable mais non vérifiés. Ils ne sortent au public que par l'endpoint de contact limité.
 *
 * Noms explicites (piège PostgreSQL n° 3) ; la FK est indexée par l'index composé, dont elle est
 * la colonne de tête (piège n° 8 : PostgreSQL n'indexe pas une FK de lui-même). Le plafond de 3
 * est une règle applicative (`ReplacePropertyContactsRequest`, verrou sur la ligne du bien).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_contacts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('property_id');
            $table->string('label', 60)->nullable();
            $table->string('phone', 30);
            $table->boolean('has_whatsapp')->default(false);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->foreign('property_id', 'property_contacts_property_fk')
                ->references('id')->on('properties')->cascadeOnDelete();
            $table->index(['property_id', 'position'], 'property_contacts_property_position_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_contacts');
    }
};
```

Modèle `app/Models/PropertyContact.php` :

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-633 (lot C) — un numéro à appeler SUR PLACE (gardien, voisin), titré, non vérifié. Jamais
 * dans `PropertyResource` : il ne sort au public que par `GET /public/properties/{slug}/contact`.
 */
class PropertyContact extends AbstractModel
{
    protected $fillable = ['property_id', 'label', 'phone', 'has_whatsapp', 'position'];

    protected $casts = [
        'has_whatsapp' => 'boolean',
        'position' => 'integer',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
```

`Property.php` (co-tenu, par Edit). Après la méthode `collaborators()` (ancre : `        return $this->hasMany(PropertyCollaborator::class);\n    }`) :

```php

    /** TCK-633 (lot C) — les contacts sur place, dans l'ordre choisi (3 au plus). */
    public function contacts(): HasMany
    {
        return $this->hasMany(PropertyContact::class)->orderBy('position');
    }
```

Requête `app/Http/Requests/Api/ReplacePropertyContactsRequest.php` :

```php
<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Rules\TelephoneJoignable;

/**
 * TCK-633 (lot C) — la liste COMPLÈTE des contacts sur place (remplacement). Autorisation calquée
 * sur la mise à jour du bien (`PropertyPolicy::update`), jugée avant la validation (TCK-305).
 */
class ReplacePropertyContactsRequest extends BaseFormRequest
{
    public const MAX_CONTACTS = 3;

    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'contacts' => ['present', 'array', 'max:'.self::MAX_CONTACTS],
            'contacts.*.label' => ['nullable', 'string', 'max:60'],
            'contacts.*.phone' => ['required', 'string', 'max:30', 'regex:/^\+[1-9]\d{6,14}$/', new TelephoneJoignable],
            'contacts.*.has_whatsapp' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return ['contacts.*.phone.regex' => __('validation.rules.phone_e164')];
    }
}
```

Contrôleur `app/Http/Controllers/Api/PropertyContactController.php` :

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ReplacePropertyContactsRequest;
use App\Models\Property;
use App\Models\PropertyContact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** TCK-633 (lot C) — lire et REMPLACER les contacts sur place d'un bien. */
class PropertyContactController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorize('update', $property);

        return $this->json(['data' => $this->lignes($property)]);
    }

    public function replace(ReplacePropertyContactsRequest $request, Property $property): JsonResponse
    {
        $contacts = array_values((array) $request->validated('contacts'));

        DB::transaction(function () use ($property, $contacts): void {
            // Deux remplacements simultanés se sérialisent sur la ligne du bien (piège n° 2) :
            // sans ce verrou, deux listes de 3 pouvaient en faire 6.
            Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();
            $property->contacts()->delete();

            foreach ($contacts as $position => $contact) {
                $label = isset($contact['label']) ? trim((string) $contact['label']) : '';
                $property->contacts()->create([
                    'label' => $label !== '' ? $label : null,
                    'phone' => (string) $contact['phone'],
                    'has_whatsapp' => (bool) ($contact['has_whatsapp'] ?? false),
                    'position' => $position,
                ]);
            }
        });

        return $this->json(['data' => $this->lignes($property)]);
    }

    /** @return list<array{id: int, label: ?string, phone: string, has_whatsapp: bool, position: int}> */
    private function lignes(Property $property): array
    {
        return $property->contacts()->get()
            ->map(fn (PropertyContact $c) => [
                'id' => $c->id,
                'label' => $c->label,
                'phone' => $c->phone,
                'has_whatsapp' => $c->has_whatsapp,
                'position' => $c->position,
            ])
            ->values()
            ->all();
    }
}
```

Routes `routes/api/properties.php` (C seul) : ajouter `use App\Http\Controllers\Api\PropertyContactController;` après `use App\Http\Controllers\Api\PropertyCollaboratorController;`. Puis, après la ligne `properties.collaborators.destroy` (ancre) :

```php

    // TCK-633 (lot C) — les contacts sur place (3 au plus), lus et REMPLACÉS d'un bloc.
    Route::get('properties/{property}/contacts', [PropertyContactController::class, 'index'])->name('properties.contacts.index');
    Route::put('properties/{property}/contacts', [PropertyContactController::class, 'replace'])->name('properties.contacts.replace');
```

**Step 4 : lancer les tests, constater le vert**

Run : `php artisan test tests/Feature/Property/PropertyContactsTest.php`
Expected : PASS.

**Step 5 : ablation** (requête tenue par C seul)

```bash
F=app/Http/Requests/Api/ReplacePropertyContactsRequest.php
cp "$F" "$ABL/t6.php"; md5 -q "$F" > "$ABL/t6.md5"
```

Par Edit, remplacer `'max:'.self::MAX_CONTACTS` par `'max:10'`.

Run : `php artisan test tests/Feature/Property/PropertyContactsTest.php --filter=plafond`
Expected : FAIL, `Expected response status code [422] but received 200.`

```bash
cp "$ABL/t6.php" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t6.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter.** Rappeler à la session que `docs/models-spec.md` doit nommer `PropertyContact` à l'intégration (`scripts/check-models-spec.mjs` reste rouge d'ici là, cf. E8).

---

## Task 7 : l'endpoint public de contact rend une liste

**Files:**
- Create: `takussan-api/app/Services/Property/PropertyContactNumbers.php`
- Modify: `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:54,582-596,1180-1201` (co-tenu F, par Edit)
- Modify: les 9 tests du tableau « tests existants », section `/contact`
- Test: `takussan-api/tests/Feature/Public/PublicContactEndpointTest.php`

**Step 1 : écrire le test qui échoue**

```php
<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\User;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Property\PropertyContactNumbers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 (lot C, AC8 / AC12) — `GET /public/properties/{slug}/contact` rend la LISTE des numéros. */
class PublicContactEndpointTest extends TestCase
{
    use RefreshDatabase;

    private function bienDe(User $owner): Property
    {
        return Property::factory()->create(['user_id' => $owner->id, 'agency_id' => null]);
    }

    public function test_principal_second_puis_sur_place(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000801', 'phone_verified_at' => now(), 'phone_whatsapp' => true]);
        $owner->forceFill(['secondary_phone' => '+221770000802', 'secondary_phone_verified_at' => now()])->save();
        $bien = $this->bienDe($owner);
        $bien->contacts()->create(['label' => 'Voisine', 'phone' => '+221770000804', 'has_whatsapp' => false, 'position' => 1]);
        $bien->contacts()->create(['label' => 'Gardien', 'phone' => '+221770000803', 'has_whatsapp' => true, 'position' => 0]);

        $this->getJson("/api/public/properties/{$bien->slug}/contact")->assertOk()->assertExactJson(['data' => [
            ['phone' => '+221770000801', 'whatsapp' => true, 'label' => null, 'kind' => 'primary'],
            ['phone' => '+221770000802', 'whatsapp' => false, 'label' => null, 'kind' => 'secondary'],
            ['phone' => '+221770000803', 'whatsapp' => true, 'label' => 'Gardien', 'kind' => 'on_site'],
            ['phone' => '+221770000804', 'whatsapp' => false, 'label' => 'Voisine', 'kind' => 'on_site'],
        ]]);
    }

    public function test_un_second_numero_non_verifie_ne_sort_pas(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000811', 'phone_verified_at' => now()]);
        $owner->forceFill(['secondary_phone' => '+221770000812', 'secondary_phone_verified_at' => null])->save();

        $this->getJson("/api/public/properties/{$this->bienDe($owner)->slug}/contact")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.kind', 'primary');
    }

    public function test_sans_numero_la_liste_est_vide(): void
    {
        $owner = User::factory()->create(['phone' => null]);

        $this->getJson("/api/public/properties/{$this->bienDe($owner)->slug}/contact")
            ->assertOk()->assertExactJson(['data' => []]);
    }

    /** WhatsApp : le bouton public s'affiche s'il existe au moins un numéro déclaré WhatsApp. */
    public function test_has_whatsapp(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000821', 'phone_verified_at' => now()]);
        $bien = $this->bienDe($owner)->load(['contacts', ...PrimaryPropertyContact::eagerLoads()]);
        $this->assertFalse(PropertyContactNumbers::hasWhatsApp($bien, $owner));

        $bien->contacts()->create(['phone' => '+221770000822', 'has_whatsapp' => true, 'position' => 0]);
        $this->assertTrue(PropertyContactNumbers::hasWhatsApp($bien->load('contacts'), $owner));

        $owner->forceFill(['phone_whatsapp' => true])->save();
        $this->assertTrue(PropertyContactNumbers::hasWhatsApp($bien->setRelation('contacts', collect()), $owner->fresh()));
    }
}
```

**Step 2 : lancer, constater l'échec**

Run : `php artisan test tests/Feature/Public/PublicContactEndpointTest.php`
Expected : FAIL. La forme rendue est `{"phone": …}`, et `PropertyContactNumbers` est introuvable.

**Step 3 : implémenter**

`app/Services/Property/PropertyContactNumbers.php` :

```php
<?php

namespace App\Services\Property;

use App\Models\Property;
use App\Models\PropertyContact;
use App\Models\User;

/**
 * TCK-633 (lot C) — les numéros qu'un visiteur peut appeler pour un bien, dans l'ordre :
 * le numéro principal du contact principal ({@see PrimaryPropertyContact}), son second numéro
 * s'il est VÉRIFIÉ, puis les contacts sur place par `position`.
 *
 * Une seule définition pour l'endpoint limité (`GET …/contact`) et pour le drapeau
 * `has_whatsapp` de la fiche, qui doivent dire la même chose.
 */
final class PropertyContactNumbers
{
    /**
     * ⚠ Suppose `contacts` et {@see PrimaryPropertyContact::eagerLoads()} chargés.
     *
     * @return list<array{phone: string, whatsapp: bool, label: ?string, kind: string}>
     */
    public static function for(Property $property): array
    {
        $contact = PrimaryPropertyContact::for($property);
        $numeros = [];

        if ($contact !== null && is_string($contact->phone) && $contact->phone !== '') {
            $numeros[] = ['phone' => $contact->phone, 'whatsapp' => (bool) $contact->phone_whatsapp, 'label' => null, 'kind' => 'primary'];
        }
        if ($contact !== null && self::secondUtilisable($contact)) {
            $numeros[] = ['phone' => (string) $contact->secondary_phone, 'whatsapp' => (bool) $contact->secondary_phone_whatsapp, 'label' => null, 'kind' => 'secondary'];
        }
        foreach ($property->contacts as $surPlace) {
            /** @var PropertyContact $surPlace */
            $numeros[] = ['phone' => $surPlace->phone, 'whatsapp' => $surPlace->has_whatsapp, 'label' => $surPlace->label, 'kind' => 'on_site'];
        }

        return $numeros;
    }

    /**
     * Au moins un numéro déclaré WhatsApp. Les contacts sur place ne comptent que s'ils sont
     * CHARGÉS : une liste de biens ne paie pas une requête par ligne pour un bouton de fiche.
     */
    public static function hasWhatsApp(Property $property, ?User $contact): bool
    {
        if ($contact !== null && is_string($contact->phone) && $contact->phone !== '' && $contact->phone_whatsapp) {
            return true;
        }
        if ($contact !== null && self::secondUtilisable($contact) && $contact->secondary_phone_whatsapp) {
            return true;
        }

        return $property->relationLoaded('contacts')
            && $property->contacts->contains(fn (PropertyContact $c) => $c->has_whatsapp);
    }

    private static function secondUtilisable(User $contact): bool
    {
        return is_string($contact->secondary_phone) && $contact->secondary_phone !== ''
            && $contact->secondary_phone_verified_at !== null;
    }
}
```

`PublicPropertyController.php` (co-tenu F, par Edit) :

1. Import : après `use App\Services\Property\PrimaryPropertyContact;` ajouter `use App\Services\Property\PropertyContactNumbers;`.
2. `contact()` : remplacer

```php
        $property = Property::query()
            ->with(PrimaryPropertyContact::eagerLoads())
            ->public()
            ->where('slug', $slug)
            ->firstOrFail();
```

(ancre : la PREMIÈRE ligne `->with(PrimaryPropertyContact::eagerLoads())` suivie de `->public()`, dans `contact()`) par

```php
        $property = Property::query()
            ->with([...PrimaryPropertyContact::eagerLoads(), 'contacts'])
            ->public()
            ->where('slug', $slug)
            ->firstOrFail();
```

puis remplacer

```php
        return $this->json([
            'phone' => PrimaryPropertyContact::for($property)?->phone,
        ]);
```

par

```php
        // TCK-633 (lot C) — une LISTE : principal, second (vérifié), sur place. Toujours révélée au
        // geste et sous limiteur ; les contacts sur place ne sortent par AUCUNE autre réponse.
        return $this->json(['data' => PropertyContactNumbers::for($property)]);
```

3. `show()` : dans le `with([...])`, après `'collaborators.user.agencyAdminProfiles',` (ancre), ajouter :

```php
                // TCK-633 (lot C) — `primary_contact.has_whatsapp` compte les contacts sur place.
                'contacts',
```

Mettre à jour les tests existants :

| Fichier | Avant | Après |
|---|---|---|
| `tests/Feature/Public/PropertyContactTest.php` L37 | `->assertExactJson(['phone' => '+221771234567']);` | `->assertExactJson(['data' => [['phone' => '+221771234567', 'whatsapp' => false, 'label' => null, 'kind' => 'primary']]]);` |
| `tests/Unit/Services/PrimaryPropertyContactEligibilityTest.php` L69 | `->assertExactJson(['phone' => $attendu->phone]);` | `->assertJsonPath('data.0.phone', $attendu->phone);` |
| `tests/Feature/Property/PrimaryAgentDesignationTest.php` L87 | `->assertExactJson(['phone' => $attendu->phone]);` | `->assertJsonPath('data.0.phone', $attendu->phone);` |
| `tests/Feature/Admin/Platform/AccountErasureListingsTest.php` L140 | `…/contact")->json('phone'));` | `…/contact")->json('data.0.phone'));` |
| `tests/Feature/Api/ProprietaireDuBienTest.php` L72, L126, L148, L160 | `->json('phone')` (×4) | `->json('data.0.phone')` |
| `tests/Feature/Public/PropertyPrimaryContactTest.php` L204, L230 | `->assertJsonPath('phone', …)` | `->assertJsonPath('data.0.phone', …)` |
| `tests/Feature/Api/PropertyCollaboratorTest.php` L432 | `->assertJsonPath('phone', '+221770000001');` | `->assertJsonPath('data.0.phone', '+221770000001');` |

Sur les `assertNotSame` de `ProprietaireDuBienTest` (L72, L148) : `data.0.phone` vaut `null` quand la liste est vide, ou le numéro d'un autre contact. Le sens de l'assertion (« ce n'est pas le numéro du bailleur parti ») est conservé.

**Step 4 : lancer les tests, constater le vert**

Run : `php artisan test tests/Feature/Public/PublicContactEndpointTest.php tests/Feature/Public/PropertyContactTest.php tests/Unit/Services/PrimaryPropertyContactEligibilityTest.php tests/Feature/Property/PrimaryAgentDesignationTest.php tests/Feature/Admin/Platform/AccountErasureListingsTest.php tests/Feature/Api/ProprietaireDuBienTest.php tests/Feature/Public/PropertyPrimaryContactTest.php tests/Feature/Api/PropertyCollaboratorTest.php tests/Feature/Property/PropertyContactsTest.php`
Expected : PASS.

Contrôle d'exhaustivité : `grep -rn "/contact\")->json('phone')\|/contact\")\s*->assertOk()\s*->assertJsonPath('phone'" tests` ne doit rien rendre. Puis `grep -rn "json('phone')" tests | grep "/contact"` : vide.

**Step 5 : ablation** (service tenu par C seul)

```bash
F=app/Services/Property/PropertyContactNumbers.php
cp "$F" "$ABL/t7.php"; md5 -q "$F" > "$ABL/t7.md5"
```

Par Edit, dans `secondUtilisable`, supprimer `&& $contact->secondary_phone_verified_at !== null`.

Run : `php artisan test tests/Feature/Public/PublicContactEndpointTest.php --filter=non_verifie`
Expected : FAIL, `Failed asserting that actual size 2 matches expected size 1.`

```bash
cp "$ABL/t7.php" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t7.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter.** Dans `collisions`, inscrire la ligne `has_whatsapp` de `PropertyResource` (E3), avec ce code exact, à appliquer par la session. Dans `buildPrimaryContact()`, après `'has_phone' => is_string($contact->phone) && $contact->phone !== '',` :

```php
            // TCK-633 (lot C) — le bouton WhatsApp de la fiche ne s'affiche que s'il existe un
            // numéro déclaré WhatsApp (`PropertyContactNumbers`, même règle que `…/contact`).
            'has_whatsapp' => PropertyContactNumbers::hasWhatsApp($this->resource, $contact),
```

avec `use App\Services\Property\PropertyContactNumbers;` après `use App\Services\Property\PrimaryPropertyContact;`. Le test à ajouter avec ce code, dans `PublicContactEndpointTest` :

```php
    public function test_la_fiche_dit_has_whatsapp_sans_reveler_le_numero(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000831', 'phone_verified_at' => now(), 'phone_whatsapp' => true]);
        $bien = $this->bienDe($owner);

        $fiche = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.has_whatsapp', true);
        $this->assertStringNotContainsString('770000831', (string) $fiche->getContent());
    }
```

---

## Task 8 : `PublishReadiness`, les quatre chemins de publication

**Files:**
- Create: `takussan-api/app/Services/Property/PublishReadiness.php`
- Modify: `takussan-api/app/Http/Controllers/Api/PropertyController.php:22-31,99-151,168-200,211-234` (C seul)
- Modify: `takussan-api/lang/{fr,en,wo}/errors.php` (groupe `property`, par Edit)
- Create: `takussan-api/tests/Support/PubliePret.php`
- Modify: `PropertyCrudTest`, `PropertyModerationGateTest`, `PropertyAuthorizationTest`, `PropertyReportDecisionTest`
- Test: `takussan-api/tests/Feature/Api/PublishReadinessTest.php`

**Step 1 : écrire le test qui échoue**

`tests/Support/PubliePret.php` :

```php
<?php

namespace Tests\Support;

use App\Models\User;
use App\Services\Property\PublishReadiness;

/**
 * TCK-633 (lot C) — un compte qui peut publier : prénom, numéro VÉRIFIÉ, CGU acceptées. Les
 * tests qui publient sans parler du contact s'en servent ; ceux qui éprouvent la règle
 * (`PublishReadinessTest`) s'en passent.
 */
trait PubliePret
{
    protected function rendrePubliable(User ...$users): void
    {
        foreach ($users as $user) {
            $user->forceFill([
                'first_name' => trim((string) $user->first_name) !== '' ? $user->first_name : 'Awa',
                // Unique par compte : `users_phone_verified_unique` refuserait deux numéros vérifiés égaux.
                'phone' => $user->phone ?: '+2217'.str_pad((string) $user->id, 8, '0', STR_PAD_LEFT),
                'phone_verified_at' => $user->phone_verified_at ?? now(),
                'terms_accepted_at' => $user->terms_accepted_at ?? now(),
                'terms_version' => $user->terms_version ?? PublishReadiness::TERMS_VERSION,
            ])->save();
        }
    }
}
```

`tests/Feature/Api/PublishReadinessTest.php` :

```php
<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Property\PublishReadiness;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\PubliePret;
use Tests\TestCase;

/**
 * TCK-633 (lot C, AC11) — publier exige un contact principal joignable (prénom, numéro vérifié)
 * et des CGU acceptées par le publieur ; la première publication les date. Par l'API, sur les
 * quatre chemins qui rendent un bien public : `publish`, `visibility`, `store`, `update`.
 */
class PublishReadinessTest extends TestCase
{
    use PubliePret, RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['first_name' => 'Awa', 'phone' => '+221770000901', 'phone_verified_at' => null]);
        Sanctum::actingAs($this->user);
    }

    private function brouillon(?User $auteur = null, array $attributs = []): Property
    {
        return Property::factory()->draft()->create($attributs + ['user_id' => ($auteur ?? $this->user)->id, 'agency_id' => null]);
    }

    public function test_sans_numero_verifie_refuse(): void
    {
        $bien = $this->brouillon();

        $this->postJson("/api/properties/{$bien->id}/publish", ['accept_terms' => true])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'property.publish_contact_incomplete')
            ->assertJsonPath('missing', ['verified_phone'])
            ->assertJsonPath('contact_is_self', true);
        $this->assertSame(PropertyStatus::Draft, $bien->fresh()->status);
    }

    public function test_sans_prenom_refuse(): void
    {
        $this->rendrePubliable($this->user);
        $this->user->forceFill(['first_name' => ''])->save();

        $this->postJson("/api/properties/{$this->brouillon()->id}/publish", ['accept_terms' => true])
            ->assertUnprocessable()->assertJsonPath('missing', ['first_name']);
    }

    public function test_sans_cgu_refuse(): void
    {
        $this->user->forceFill(['phone_verified_at' => now()])->save();

        $this->postJson("/api/properties/{$this->brouillon()->id}/publish")
            ->assertUnprocessable()->assertJsonPath('missing', ['terms']);
    }

    public function test_tout_manque_dans_l_ordre(): void
    {
        $this->user->forceFill(['first_name' => ''])->save();

        $this->postJson("/api/properties/{$this->brouillon()->id}/publish")
            ->assertUnprocessable()->assertJsonPath('missing', ['first_name', 'verified_phone', 'terms']);
    }

    public function test_la_premiere_publication_date_les_cgu_et_pas_les_suivantes(): void
    {
        $this->user->forceFill(['phone_verified_at' => now()])->save();
        $this->freezeSecond();

        $this->postJson("/api/properties/{$this->brouillon()->id}/publish", ['accept_terms' => true])
            ->assertOk()->assertJsonPath('data.visibility', 'public');
        $premiere = $this->user->fresh()->terms_accepted_at;
        $this->assertNotNull($premiere);
        $this->assertSame(PublishReadiness::TERMS_VERSION, $this->user->fresh()->terms_version);

        $this->travel(2)->days();
        $this->postJson("/api/properties/{$this->brouillon()->id}/publish", ['accept_terms' => true])->assertOk();
        $this->assertTrue($premiere->equalTo($this->user->fresh()->terms_accepted_at));
    }

    public function test_la_visibilite_publique_est_gardee(): void
    {
        $bien = $this->brouillon();

        $this->putJson("/api/properties/{$bien->id}/visibility", ['visibility' => 'public'])
            ->assertUnprocessable()->assertJsonPath('code', 'property.publish_contact_incomplete');
        $this->assertSame(PropertyStatus::Draft, $bien->fresh()->status);
    }

    public function test_la_creation_publique_est_gardee(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['phone_verified_at' => null]);
        $this->materializeRoleProfile($agent, 'agent', $agency);
        Sanctum::actingAs($agent);

        $this->postJson('/api/properties', [
            'title' => 'Villa aux Almadies', 'type' => 'house', 'contract_type' => 'sale',
            'price' => 90_000_000, 'status' => 'available', 'visibility' => 'public',
        ])->assertUnprocessable()->assertJsonPath('code', 'property.publish_contact_incomplete');
        $this->assertSame(0, Property::query()->count());
    }

    public function test_la_mise_a_jour_publique_est_gardee(): void
    {
        $bien = $this->brouillon(null, ['visibility' => PropertyVisibility::Private]);

        $this->putJson("/api/properties/{$bien->id}", ['visibility' => 'public'])
            ->assertUnprocessable()->assertJsonPath('code', 'property.publish_contact_incomplete');
        $this->assertSame(PropertyVisibility::Private, $bien->fresh()->visibility);
    }

    public function test_republier_un_bien_deja_en_ligne_ne_redemande_rien(): void
    {
        $enLigne = Property::factory()->create(['user_id' => $this->user->id, 'agency_id' => null]);

        $this->postJson("/api/properties/{$enLigne->id}/publish")->assertOk();
    }

    /** Le contact est l'agent principal, pas le publieur : c'est lui qui doit être joignable. */
    public function test_le_contact_principal_d_un_bien_d_agence(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        $this->rendrePubliable($admin);
        $agent = User::factory()->create(['phone' => '+221770000902', 'phone_verified_at' => null]);
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $bien = Property::factory()->draft()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        PropertyCollaborator::create([
            'property_id' => $bien->id, 'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent->value, 'invited_at' => '2026-01-01 09:00:00',
        ]);
        Sanctum::actingAs($admin);

        $this->postJson("/api/properties/{$bien->id}/publish", ['accept_terms' => true])
            ->assertUnprocessable()
            ->assertJsonPath('missing', ['verified_phone'])
            ->assertJsonPath('contact_is_self', false);
    }
}
```

**Step 2 : lancer, constater l'échec**

Run : `php artisan test tests/Feature/Api/PublishReadinessTest.php`
Expected : FAIL. Les publications rendent 200 au lieu de 422, et `PublishReadiness` est introuvable.

**Step 3 : implémenter**

`app/Services/Property/PublishReadiness.php` :

```php
<?php

namespace App\Services\Property;

use App\Exceptions\ApiError;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;

/**
 * TCK-633 (lot C, AC11) — un bien ne devient public que si quelqu'un peut répondre.
 *
 * Refus 422 `property.publish_contact_incomplete`, avec `missing` ⊂ {`first_name`,
 * `verified_phone`, `terms`} et `contact_is_self` :
 *  - `first_name` / `verified_phone` se jugent sur le CONTACT PRINCIPAL du bien
 *    ({@see PrimaryPropertyContact}) — la personne que les visiteurs appelleront ;
 *  - `terms` se juge sur le PUBLIEUR : CGU déjà acceptées, ou acceptées par ce geste
 *    (`accept_terms`, la phrase sous le bouton Publier). La première publication les date.
 *
 * Appelé par les QUATRE chemins qui rendent un bien public (`publish`, `visibility`, `store`,
 * `update`) : garder les deux premiers seuls laisserait publier par le corps d'une création ou
 * d'une mise à jour. Un bien déjà en ligne se republie sans rien redemander.
 */
final class PublishReadiness
{
    /**
     * La version des CGU que la phrase désigne : `VERSION_DOCUMENTS.date` du front
     * (`takussan-web/src/content/legal/editeur.ts`, « 17 septembre 2026 »). À changer ensemble.
     */
    public const TERMS_VERSION = '2026-09-17';

    public const MISSING_FIRST_NAME = 'first_name';

    public const MISSING_VERIFIED_PHONE = 'verified_phone';

    public const MISSING_TERMS = 'terms';

    public function alreadyOnline(Property $property): bool
    {
        return $property->visibility === PropertyVisibility::Public && $property->published_at !== null;
    }

    /** @return list<string> */
    public function missing(?User $contact, User $publisher, bool $acceptTerms): array
    {
        $manque = [];
        if ($contact === null || trim((string) $contact->first_name) === '') {
            $manque[] = self::MISSING_FIRST_NAME;
        }
        if ($contact === null || $contact->phone_verified_at === null || ! is_string($contact->phone) || $contact->phone === '') {
            $manque[] = self::MISSING_VERIFIED_PHONE;
        }
        if ($publisher->terms_accepted_at === null && ! $acceptTerms) {
            $manque[] = self::MISSING_TERMS;
        }

        return $manque;
    }

    public function ensure(?User $contact, User $publisher, bool $acceptTerms): void
    {
        $manque = $this->missing($contact, $publisher, $acceptTerms);
        if ($manque !== []) {
            throw (new ApiError(422, 'property.publish_contact_incomplete'))->with([
                'missing' => $manque,
                'contact_is_self' => $contact !== null && $contact->is($publisher),
            ]);
        }
    }

    public function ensureForProperty(Property $property, User $publisher, bool $acceptTerms): void
    {
        $property->loadMissing(PrimaryPropertyContact::eagerLoads());
        $this->ensure(PrimaryPropertyContact::for($property), $publisher, $acceptTerms);
    }

    /** La première publication date les CGU ; les suivantes ne réécrivent rien. */
    public function recordTerms(User $publisher, bool $acceptTerms): void
    {
        if ($publisher->terms_accepted_at !== null || ! $acceptTerms) {
            return;
        }

        $publisher->forceFill(['terms_accepted_at' => now(), 'terms_version' => self::TERMS_VERSION])->save();
    }
}
```

`PropertyController.php` (C seul). Ajouter `use App\Services\Property\PublishReadiness;` après `use App\Services\Property\PropertyViewCounter;`.

`publish()` : remplacer

```php
        $property->update([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ]);
```

par

```php
        // TCK-633 (lot C, AC11) — après les droits, l'état et le quota ; avant toute écriture.
        $readiness = app(PublishReadiness::class);
        $accepte = $request->boolean('accept_terms');
        $dejaEnLigne = $readiness->alreadyOnline($property);
        if (! $dejaEnLigne) {
            $readiness->ensureForProperty($property, $request->user(), $accepte);
        }
        $property->update([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ]);
        if (! $dejaEnLigne) {
            $readiness->recordTerms($request->user(), $accepte);
        }
```

`updateVisibility()` délègue déjà à `publish()` : rien à changer.

`store()` : après le bloc `if ($isProposal) { … }` (ancre : `            $data['visibility'] = PropertyVisibility::Private->value;\n        }`) insérer :

```php

        // TCK-633 (lot C) — créer un bien DIRECTEMENT public est une publication : le créateur en
        // est le contact (aucun collaborateur n'existe encore). Jugé AVANT la transaction : un
        // refus ne doit pas passer par le `catch` qui journalise les échecs de création.
        $publieALaCreation = ! $isProposal && ($data['visibility'] ?? null) === PropertyVisibility::Public->value;
        if ($publieALaCreation) {
            app(PublishReadiness::class)->ensure($request->user(), $request->user(), $request->boolean('accept_terms'));
        }
```

et, juste avant `            if ($isProposal && $property->agency_id !== null) {` (ancre) :

```php
            if ($publieALaCreation) {
                app(PublishReadiness::class)->recordTerms($request->user(), $request->boolean('accept_terms'));
            }

```

`update()` : après `$data = $request->validated();` (ancre : la ligne qui suit `$this->authorize('update', $property);\n\n`), insérer :

```php

        // TCK-633 (lot C) — passer un bien hors ligne à `public` par le corps est une publication.
        $readiness = app(PublishReadiness::class);
        $rendPublic = ($data['visibility'] ?? null) === PropertyVisibility::Public->value
            && ! $readiness->alreadyOnline($property);
        if ($rendPublic) {
            $readiness->ensureForProperty($property, $request->user(), $request->boolean('accept_terms'));
        }
```

et, juste avant le `return $this->json([` de `update()` (ancre : `        });\n\n        return $this->json([\n            'data' => PropertyResource::make($property->refresh()->load('address'))->toArray($request),\n        ]);\n    }\n\n    public function destroy`) :

```php
        if ($rendPublic) {
            $readiness->recordTerms($request->user(), $request->boolean('accept_terms'));
        }

```

Erreurs, `lang/{fr,en,wo}/errors.php` (co-tenu, par Edit). Insérer avant la ligne `'responsible_agent_co_owner' => …` du groupe `property` (ordre alphabétique) :

- fr, ancre `        'responsible_agent_co_owner' => 'Un co-propriétaire du bien ne peut pas en devenir l\'agent responsable.',` :
  `        'publish_contact_incomplete' => "Pour publier, le contact du bien doit avoir un prénom et un numéro vérifié, et les conditions d'utilisation doivent être acceptées.",`
- en, ancre `        'responsible_agent_co_owner' => 'A co-owner of the property cannot become its responsible agent.',` :
  `        'publish_contact_incomplete' => 'To publish, the property contact needs a first name and a verified number, and the terms of use must be accepted.',`
- wo, ancre `        'responsible_agent_co_owner' => 'Ku bokk moom kër gi mënul a nekk ajaa bi ko yor.',` :
  `        'publish_contact_incomplete' => 'Ngir siiwal, ki ñuy woo ci kër gi war na am tur ak nimero bu ñu wóor, te war nañu nangu sàrt yi.',`

Mettre à jour les tests existants (ajouter `use Tests\Support\PubliePret;` en tête, et `PubliePret` au `use` de la classe) :

- `PropertyCrudTest` : dans `test_publishes_property` et `test_visibility_endpoint_publishes_draft_property`, insérer `        $this->rendrePubliable($user);` avant `Sanctum::actingAs($user);`. La classe porte `use PubliePret, RefreshDatabase;`.
- `PropertyModerationGateTest::setUp` : après `$this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);`, insérer `        $this->rendrePubliable($this->agent, $this->admin);`.
- `PropertyAuthorizationTest` :
  - dans `test_un_agent_cree_un_bien_de_l_agence`, remplacer `$this->actingAsApi($this->agencyAgent($this->agency))` par `$agent = $this->agencyAgent($this->agency);\n        $this->rendrePubliable($agent);\n        $this->actingAsApi($agent)` ;
  - dans `test_sans_properties_publish_aucun_chemin_ne_publie`, après `$systeme = $this->agencyAgent($this->agency);`, insérer `        $this->rendrePubliable($systeme);`.
- `PropertyReportDecisionTest::setUp` : après `$this->materializeRoleProfile($this->super, 'super_admin');`, insérer `        $this->rendrePubliable($this->owner, $this->adminA, $this->super);`. Sans cette ligne, le 422 `moderation.platform_hold` attendu L175 serait précédé par `publish_contact_incomplete`.

**Step 4 : lancer les tests, constater le vert**

Run : `php artisan test tests/Feature/Api/PublishReadinessTest.php tests/Feature/Api/PropertyCrudTest.php tests/Feature/Api/PropertyModerationGateTest.php tests/Feature/Api/PropertyAuthorizationTest.php tests/Feature/Api/Admin/PropertyReportDecisionTest.php tests/Feature/Api/Admin/BillingPlansTest.php tests/Unit/Lang/LangGroupParityTest.php`
Expected : PASS.

Run : `php bin/impacted-tests.php --run`
Expected : vert. Un rouge sur un test qui publie sans en parler se corrige par `rendrePubliable(...)`, **jamais** en affaiblissant `PublishReadiness`. Chaque fichier ainsi touché va dans le rapport.

**Step 5 : ablation** (`PropertyController`, tenu par C seul)

```bash
F=app/Http/Controllers/Api/PropertyController.php
cp "$F" "$ABL/t8.php"; md5 -q "$F" > "$ABL/t8.md5"
```

Par Edit, dans `update()`, remplacer `if ($rendPublic) {\n            $readiness->ensureForProperty(` par `if (false) {\n            $readiness->ensureForProperty(`.

Run : `php artisan test tests/Feature/Api/PublishReadinessTest.php --filter=mise_a_jour`
Expected : FAIL, `Expected response status code [422] but received 200.` (Ce cas prouve que garder `publish` et `visibility` seuls ne suffisait pas.)

```bash
cp "$ABL/t8.php" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t8.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter**, dont les quatre tests existants modifiés et `tests/Support/PubliePret.php`.

---

## Task 9 : i18n front (fr / en / wo)

**Files:** `takussan-web/src/messages/{fr,en,wo}.json` (co-tenus, par Edit, trois blocs par langue)

**Step 1 : test qui échoue.** Les tests des tâches 11 à 14 lisent ces clés par `withIntl`. Ici, la garde de parité :

Run : `npm run check:i18n`
Expected : vert **avant** l'édition. On s'assure que la parité tient après chaque langue, pas seulement à la fin.

**Step 2 : `publishRedirect.auto`.** fr, ancre exacte :

```json
    "retry": "Réessayer"
  },
  "layout": {
```

remplacée par :

```json
    "retry": "Réessayer",
    "auto": {
      "title": "Création de votre espace…",
      "body": "Votre espace personnel se prépare : vous publiez juste après.",
      "error": "Votre espace n’a pas pu être créé. Réessayez."
    }
  },
  "layout": {
```

en (ancre `    "retry": "Try again"\n  },\n  "layout": {`) : `"title": "Creating your space…"`, `"body": "Your personal space is being set up: you will publish right after."`, `"error": "We could not create your space. Try again."`.
wo (ancre `    "retry": "Jéemaatal"\n  },\n  "layout": {`) : `"title": "Ñu ngi sos sa bérëb…"`, `"body": "Sa bérëb bu bopp ngi waaj : dinga génne sa kër ci kanam."`, `"error": "Mënunu sos sa bérëb. Jéemaatal."`.

**Step 3 : `profile.contact` (ajouts).** fr, ancre :

```json
      "emailLinkSent": "Lien de vérification envoyé à {email}."
    },
    "searchPreferences": {
```

remplacée par :

```json
      "emailLinkSent": "Lien de vérification envoyé à {email}.",
      "whatsappLabel": "Ce numéro reçoit WhatsApp",
      "secondary": {
        "title": "Second numéro",
        "hint": "Un autre numéro où l’on peut vous joindre. Il ne sert pas à vous connecter.",
        "whatsapp": "Ce numéro reçoit WhatsApp",
        "send": "Recevoir un code",
        "resend": "Renvoyer le code",
        "codeAria": "Code reçu sur le second numéro",
        "codeSent": "Code envoyé.",
        "verified": "Second numéro vérifié.",
        "remove": "Retirer",
        "removed": "Second numéro retiré."
      }
    },
    "searchPreferences": {
```

en (ancre `      "emailLinkSent": "Verification link sent to {email}."\n    },\n    "searchPreferences": {`) :
- `whatsappLabel` : "This number has WhatsApp"
- `secondary` :
  - `title` : "Second number"
  - `hint` : "Another number where people can reach you. It is not used to sign in."
  - `whatsapp` : "This number has WhatsApp"
  - `send` : "Get a code"
  - `resend` : "Resend the code"
  - `codeAria` : "Code received on the second number"
  - `codeSent` : "Code sent."
  - `verified` : "Second number verified."
  - `remove` : "Remove"
  - `removed` : "Second number removed."

wo (ancre `      "emailLinkSent": "Lien bu dëggal bi yónne nañu ko ci {email}."\n    },\n    "searchPreferences": {`) :
- `whatsappLabel` : "Nimero bii am na WhatsApp"
- `secondary` :
  - `title` : "Ñaareelu nimero"
  - `hint` : "Beneen nimero bu ñu mën a woo la. Du jëfandikoo ngir dugg."
  - `whatsapp` : "Nimero bii am na WhatsApp"
  - `send` : "Jot benn kood"
  - `resend` : "Yónneeti kood bi"
  - `codeAria` : "Kood bi ñu yónne ci ñaareelu nimero bi"
  - `codeSent` : "Yónne nañu kood bi."
  - `verified` : "Ñaareelu nimero bi wóor na."
  - `remove` : "Far"
  - `removed` : "Ñaareelu nimero bi far nañu ko."

**Step 4 : `property.form.publishContact` et `property.contacts`.** fr, ancre :

```json
        "saveChanges": "Enregistrer les modifications"
      }
    },
    "dashboard": {
```

remplacée par :

```json
        "saveChanges": "Enregistrer les modifications"
      },
      "publishContact": {
        "title": "Vos coordonnées pour les intéressés",
        "subtitle": "Les visiteurs vous joindront à ce numéro. Il n’est révélé qu’à leur demande.",
        "firstNameLabel": "Prénom",
        "lastNameLabel": "Nom",
        "saveNames": "Enregistrer",
        "phoneLabel": "Votre numéro",
        "sendCode": "Recevoir un code",
        "resendCode": "Renvoyer le code",
        "codeAria": "Code reçu par SMS",
        "verifyCode": "Valider",
        "whatsapp": "Ce numéro reçoit WhatsApp",
        "codeSent": "Code envoyé par SMS.",
        "phoneVerified": "Numéro vérifié.",
        "saved": "Coordonnées enregistrées.",
        "incomplete": "Il manque vos coordonnées pour publier : complétez le bloc « Vos coordonnées », puis publiez de nouveau. Votre brouillon est enregistré.",
        "otherContact": "Le contact de ce bien n’a pas encore de prénom ou de numéro vérifié : il doit compléter son profil avant la publication.",
        "terms": "En publiant, vous acceptez les <lien>conditions générales d’utilisation</lien>.",
        "failed": "La publication a échoué. Réessayez."
      }
    },
    "contacts": {
      "title": "Contacts sur place",
      "hint": "Jusqu’à trois numéros (gardien, voisin…). Ils ne sont révélés qu’au geste « Appeler ».",
      "labelLabel": "Qui ?",
      "phoneLabel": "Numéro",
      "whatsapp": "WhatsApp",
      "add": "Ajouter un contact",
      "remove": "Retirer",
      "removeAria": "Retirer le contact {index}",
      "max": "Trois contacts au plus.",
      "partial": "les contacts sur place",
      "public": {
        "listAria": "Numéros à appeler",
        "whatsapp": "WhatsApp",
        "kind": {
          "primary": "Numéro principal",
          "secondary": "Second numéro",
          "onSite": "Sur place"
        }
      }
    },
    "dashboard": {
```

en (ancre `        "saveChanges": "Save changes"\n      }\n    },\n    "dashboard": {`), mêmes clés.

`publishContact` :
- `title` : "Your contact details for interested people"
- `subtitle` : "Visitors will reach you at this number. It is only revealed when they ask."
- `firstNameLabel` : "First name"
- `lastNameLabel` : "Last name"
- `saveNames` : "Save"
- `phoneLabel` : "Your number"
- `sendCode` : "Get a code"
- `resendCode` : "Resend the code"
- `codeAria` : "Code received by SMS"
- `verifyCode` : "Confirm"
- `whatsapp` : "This number has WhatsApp"
- `codeSent` : "Code sent by SMS."
- `phoneVerified` : "Number verified."
- `saved` : "Details saved."
- `incomplete` : "Your contact details are missing: complete the “Your contact details” block, then publish again. Your draft is saved."
- `otherContact` : "This property’s contact has no first name or verified number yet: they must complete their profile before publication."
- `terms` : "By publishing, you accept the <lien>terms of use</lien>."
- `failed` : "Publishing failed. Try again."

`contacts` :
- `title` : "On-site contacts"
- `hint` : "Up to three numbers (caretaker, neighbour…). They are only revealed with “Call”."
- `labelLabel` : "Who?"
- `phoneLabel` : "Number"
- `whatsapp` : "WhatsApp"
- `add` : "Add a contact"
- `remove` : "Remove"
- `removeAria` : "Remove contact {index}"
- `max` : "Three contacts at most."
- `partial` : "the on-site contacts"
- `public` :
  - `listAria` : "Numbers to call"
  - `whatsapp` : "WhatsApp"
  - `kind` : `primary` "Main number", `secondary` "Second number", `onSite` "On site"

wo (ancre `        "saveChanges": "Denc coppite yi"\n      }\n    },\n    "dashboard": {`), mêmes clés.

`publishContact` :
- `title` : "Say xibaar ngir ñi bëgg kër gi"
- `subtitle` : "Ñi seetsi dinañu la woo ci nimero bii. Du feeñ lu dul ñu laaj ko."
- `firstNameLabel` : "Tur"
- `lastNameLabel` : "Sant"
- `saveNames` : "Denc"
- `phoneLabel` : "Sa nimero"
- `sendCode` : "Jot benn kood"
- `resendCode` : "Yónneeti kood bi"
- `codeAria` : "Kood bi ñu yónne ci SMS"
- `verifyCode` : "Dëggal"
- `whatsapp` : "Nimero bii am na WhatsApp"
- `codeSent` : "Yónne nañu kood bi ci SMS."
- `phoneVerified` : "Nimero bi wóor na."
- `saved` : "Xibaar yi denc nañu leen."
- `incomplete` : "Say xibaar ñàkk nañu ngir génne : matal « Say xibaar », te génneeti. Sa buruyoŋ denc nañu ko."
- `otherContact` : "Ki ñuy woo ci kër gii amagul tur walla nimero bu wóor : war na matal profil bi balaa ñuy génne."
- `terms` : "Bu nga génne, nangu nga <lien>sàrt yi</lien>."
- `failed` : "Génne gi antuwul. Jéemaatal."

`contacts` :
- `title` : "Ñi nekk ci bérëb bi"
- `hint` : "Ba ñetti nimero (wattukat, dëkkandoo…). Du feeñ lu dul ci « Woo »."
- `labelLabel` : "Kan ?"
- `phoneLabel` : "Nimero"
- `whatsapp` : "WhatsApp"
- `add` : "Yokk benn"
- `remove` : "Far"
- `removeAria` : "Far ki {index}"
- `max` : "Ñett rekk la ñu mën a def."
- `partial` : "ñi nekk ci bérëb bi"
- `public` :
  - `listAria` : "Nimero yi ñu mën a woo"
  - `whatsapp` : "WhatsApp"
  - `kind` : `primary` "Nimero bu njëkk", `secondary` "Ñaareelu nimero", `onSite` "Ci bérëb bi"

**Step 5 : vérifier**

Run : `node -e 'for (const l of ["fr","en","wo"]) JSON.parse(require("fs").readFileSync("src/messages/"+l+".json","utf8"))' && npm run check:i18n`
Expected : aucune erreur de syntaxe JSON, et `check:i18n` vert (parité A). Le cliquet B ne bouge pas encore, puisqu'aucun composant n'est écrit.

Pas d'ablation : c'est de la donnée, et elle est éprouvée par les tests des tâches 11 à 14.

**Step 6 : signaler les fichiers à commiter.**

---

## Task 10 : types et actions serveur (front)

**Files:**
- Modify: `takussan-web/src/types/user.ts:103-104`, `takussan-web/src/types/property.ts:95`
- Create:
  - `takussan-web/src/app/actions/auto-onboard.ts`
  - `takussan-web/src/app/actions/contact-preferences.ts`
  - `takussan-web/src/app/actions/secondary-phone.ts`
  - `takussan-web/src/app/actions/publish-property.ts`
  - `takussan-web/src/app/actions/property-contacts.ts`

**Step 1 : test qui échoue.** Les actions serveur sont doublées dans les tests de composants (tâches 11 à 14). Ici, le contrat de type :

Run : `npx tsc --noEmit`
Expected : vert avant la tâche. On s'assure ensuite que les fichiers neufs compilent.

**Step 2 : types**

`src/types/user.ts`. Ancre :

```ts
  /** TCK-253 — empty `{}` when the user has set nothing yet. */
  preferences?: UserPreferences;
```

Insérer après :

```ts
  /**
   * TCK-633 (lot C) — préférences de contact, rendues par `GET /api/auth/me` pour SOI seulement
   * (`UserResource` ne les donne pas pour un autre membre : optionnelles ici).
   */
  phone_whatsapp?: boolean;
  /** Le second numéro VÉRIFIÉ par code ; jamais un identifiant de connexion. */
  secondary_phone?: string | null;
  secondary_phone_verified_at?: string | null;
  secondary_phone_whatsapp?: boolean;
  /** La date d'acceptation des CGU, posée par la première publication. */
  terms_accepted_at?: string | null;
```

`src/types/property.ts`. Ancre `  has_phone?: boolean;`, insérer après :

```ts
  /**
   * TCK-633 (lot C) — au moins un numéro du bien est déclaré WhatsApp. Faux ou absent : aucun
   * bouton WhatsApp sur la fiche.
   */
  has_whatsapp?: boolean;
```

**Step 3 : actions**

`src/app/actions/auto-onboard.ts` :

```ts
'use server';

import { cookies } from 'next/headers';

import { ApiError, apiRequest } from '@/lib/api';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { getToken } from '@/lib/session';

/**
 * TCK-633 (lot C) — « Publier » sans assistant : `POST /api/host/individual/auto-onboard`.
 * Le serveur arbitre le drapeau `host_auto_space` : `disabled` renvoie à l'assistant actuel.
 * Pose le cookie du profil actif comme `hostIndividualOnboardAction`.
 */
export type ResultatCreationAuto =
  | { ok: true; created: boolean }
  | { ok: false; reason: 'disabled' | 'unauthenticated' | 'failed' };

type Reponse = { data: { created: boolean; active_profile_id: string } };

export async function autoOnboardAction(primaryCity?: string | null): Promise<ResultatCreationAuto> {
  const token = await getToken();
  if (!token) return { ok: false, reason: 'unauthenticated' };

  const ville = typeof primaryCity === 'string' ? primaryCity.trim().slice(0, 120) : '';
  try {
    const res = await apiRequest<Reponse>('/api/host/individual/auto-onboard', {
      method: 'POST',
      token,
      body: ville ? { primary_city: ville } : {},
    });
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_PROFILE_COOKIE, res.data.active_profile_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true, created: res.data.created };
  } catch (err) {
    const code = err instanceof ApiError ? (err.data as { code?: unknown } | null)?.code : undefined;
    if (err instanceof ApiError && err.status === 403 && code === 'onboarding.auto_space_disabled') {
      return { ok: false, reason: 'disabled' };
    }
    if (err instanceof ApiError && err.status === 401) return { ok: false, reason: 'unauthenticated' };
    return { ok: false, reason: 'failed' };
  }
}
```

`src/app/actions/contact-preferences.ts` :

```ts
'use server';

import { getTranslations } from 'next-intl/server';

import { apiRequest, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import type { User } from '@/types/user';

/**
 * TCK-633 (lot C) — prénom, nom et cases WhatsApp, par `PUT /api/auth/profile` en JSON.
 * Une action à part de `updateProfileAction` (FormData, `lib/auth.ts` hors territoire) : elle
 * n'envoie QUE ce qu'on lui donne, donc ne touche ni au numéro ni à l'adresse.
 */
export type PreferencesDeContact = {
  first_name?: string;
  last_name?: string;
  phone_whatsapp?: boolean;
  secondary_phone_whatsapp?: boolean;
};

export type ResultatPreferences = { ok: true; user: User } | { ok: false; message: string };

export async function updateContactPreferencesAction(
  payload: PreferencesDeContact,
): Promise<ResultatPreferences> {
  const token = await getToken();
  if (!token) return { ok: false, message: (await getTranslations('errors'))('missingToken') };
  try {
    const user = await apiRequest<User>('/api/auth/profile', { method: 'PUT', token, body: payload });
    return { ok: true, user };
  } catch (err) {
    const repli = (await getTranslations('profile.contact'))('saveError');
    return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
  }
}
```

`src/app/actions/secondary-phone.ts` :

```ts
'use server';

import { getTranslations } from 'next-intl/server';

import { apiRequest, messageErreurApi } from '@/lib/api';
import { codeApercu } from '@/lib/otp-preview';
import { getToken } from '@/lib/session';
import type { User } from '@/types/user';

/** TCK-633 (lot C) — le second numéro : code, vérification, retrait (`/api/auth/secondary-phone/*`). */
type Echec = { ok: false; message: string };

async function echec(err: unknown): Promise<Echec> {
  const repli = (await getTranslations('serverActions.security'))('sendOtpFailed');
  return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
}

async function jeton(): Promise<string | Echec> {
  const token = await getToken();
  return token ?? { ok: false, message: (await getTranslations('errors'))('missingToken') };
}

export async function secondaryPhoneSendOtpAction(
  phone: string,
): Promise<{ ok: true; codeApercu: string | null } | Echec> {
  const token = await jeton();
  if (typeof token !== 'string') return token;
  try {
    const res = await apiRequest<{ data: { sent: boolean } }>('/api/auth/secondary-phone/send-otp', {
      method: 'POST',
      token,
      body: { phone },
    });
    return { ok: true, codeApercu: codeApercu(res) };
  } catch (err) {
    return echec(err);
  }
}

export async function secondaryPhoneVerifyAction(
  phone: string,
  code: string,
  whatsapp: boolean,
): Promise<{ ok: true; user: User } | Echec> {
  const token = await jeton();
  if (typeof token !== 'string') return token;
  try {
    const user = await apiRequest<User>('/api/auth/secondary-phone/verify', {
      method: 'POST',
      token,
      body: { phone, code, whatsapp },
    });
    return { ok: true, user };
  } catch (err) {
    return echec(err);
  }
}

export async function secondaryPhoneRemoveAction(): Promise<{ ok: true; user: User } | Echec> {
  const token = await jeton();
  if (typeof token !== 'string') return token;
  try {
    const user = await apiRequest<User>('/api/auth/secondary-phone', { method: 'DELETE', token });
    return { ok: true, user };
  } catch (err) {
    return echec(err);
  }
}
```

`src/app/actions/publish-property.ts` :

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { ApiError, apiRequest, messageErreurApi } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import type { PropertyDetail } from '@/types/property';

/**
 * TCK-633 (lot C) — publier par `POST /api/properties/{id}/publish`, avec l'acceptation des CGU
 * (`accept_terms`) que vaut la phrase sous le formulaire. Un refus faute de coordonnées rend
 * `missing` et `contactIsSelf` : l'écran fait compléter sans quitter la publication.
 */
export type ResultatPublication =
  | { ok: true; data: PropertyDetail }
  | { ok: false; status?: number; message: string; missing: string[] | null; contactIsSelf: boolean };

export async function publishPropertyAction(
  propertyId: number,
  { acceptTerms }: { acceptTerms: boolean },
): Promise<ResultatPublication> {
  const token = await getToken();
  if (!token) {
    return {
      ok: false,
      status: 401,
      message: (await getTranslations('errors'))('missingToken'),
      missing: null,
      contactIsSelf: true,
    };
  }
  try {
    const res = await apiRequest<{ data: PropertyDetail }>(cheminApi`/api/properties/${propertyId}/publish`, {
      method: 'POST',
      token,
      body: { accept_terms: acceptTerms },
    });
    revalidatePath('/app/properties');
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true, data: res.data };
  } catch (err) {
    const corps = err instanceof ApiError
      ? (err.data as { code?: unknown; missing?: unknown; contact_is_self?: unknown } | null)
      : null;
    const incomplet = corps?.code === 'property.publish_contact_incomplete' && Array.isArray(corps.missing);
    const repli = (await getTranslations('property.form.publishContact'))('failed');
    return {
      ok: false,
      status: err instanceof ApiError ? err.status : undefined,
      message: messageErreurApi(err, await getTranslations(), repli),
      missing: incomplet ? (corps!.missing as unknown[]).filter((m): m is string => typeof m === 'string') : null,
      contactIsSelf: incomplet ? corps!.contact_is_self === true : true,
    };
  }
}
```

`src/app/actions/property-contacts.ts` :

```ts
'use server';

import { getTranslations } from 'next-intl/server';

import { apiRequest, messageErreurApi } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import type { ContactSurPlace } from '@/components/contact/ContactsSurPlace';

/** TCK-633 (lot C) — remplace les contacts sur place d'un bien (`PUT /api/properties/{id}/contacts`). */
export async function replacePropertyContactsAction(
  propertyId: number,
  contacts: readonly ContactSurPlace[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = await getToken();
  if (!token) return { ok: false, message: (await getTranslations('errors'))('missingToken') };
  try {
    await apiRequest(cheminApi`/api/properties/${propertyId}/contacts`, {
      method: 'PUT',
      token,
      body: {
        contacts: contacts.map((c) => ({
          label: c.label.trim() || null,
          phone: c.phone,
          has_whatsapp: c.has_whatsapp,
        })),
      },
    });
    return { ok: true };
  } catch (err) {
    const repli = (await getTranslations('property.form.publishContact'))('failed');
    return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
  }
}
```

`property-contacts.ts` importe le **type** `ContactSurPlace`, créé à la tâche 14. Pour que la tâche 10 compile seule, créer dès maintenant `src/components/contact/ContactsSurPlace.tsx` avec son seul type ; la tâche 14 complète le fichier :

```tsx
'use client';

/** TCK-633 (lot C) — un contact sur place saisi dans l'étape Finition. */
export interface ContactSurPlace {
  label: string;
  phone: string;
  has_whatsapp: boolean;
}
```

**Step 4 : vérifier**

Run : `npx tsc --noEmit`
Expected : 0 erreur.

Pas d'ablation propre. Les actions sont éprouvées, doublées, par les tâches 11 à 14 ; leur contrat de type par `tsc`.

**Step 5 : signaler les fichiers à commiter.**

---

## Task 11 : `/publish` crée l'espace automatiquement

**Files:**
- Modify: `takussan-web/src/app/publish/page.tsx:12-20,22-53,111-122`
- Modify: `takussan-web/src/hooks/usePublishIntent.ts:6-8` (doc)
- Test: `takussan-web/src/app/publish/__tests__/page.auto-space.test.tsx`

**Step 1 : écrire le test qui échoue**

```tsx
/**
 * TCK-633 (lot C) — « Publier » sans espace : drapeau allumé, l'espace se crée puis le formulaire
 * s'ouvre ; drapeau éteint (le SERVEUR le dit, 403), l'assistant actuel, intact.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const routeur = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routeur,
  usePathname: () => '/publish',
  useSearchParams: () => new URLSearchParams(),
}));

const autoOnboard = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions/auto-onboard', () => ({
  autoOnboardAction: (...args: unknown[]) => autoOnboard(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, preferences: { city: 'Thiès' } }, isLoading: false, refreshUser: vi.fn() }),
}));

vi.mock('@/hooks/useProfiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useProfiles')>()),
  useSwitchActiveProfile: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/usePublishIntent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePublishIntent')>()),
  usePublishIntent: () => ({ status: 'host-needed', target: '/onboarding/host', espaces: [], profilABasculer: null }),
}));

const { default: PublishPage } = await import('../page');

function monter() {
  return render(withIntl(<QueryClientProvider client={new QueryClient()}><PublishPage /></QueryClientProvider>));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/publish — création automatique de l’espace (TCK-633)', () => {
  it('drapeau allumé : crée l’espace, puis ouvre le formulaire du bien', async () => {
    autoOnboard.mockResolvedValue({ ok: true, created: true });
    monter();

    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/app/properties/new'));
    expect(autoOnboard).toHaveBeenCalledWith('Thiès');
    expect(routeur.replace).not.toHaveBeenCalledWith('/onboarding/host');
    expect(screen.getByText('Création de votre espace…')).toBeInTheDocument();
  });

  it('drapeau éteint : l’assistant actuel', async () => {
    autoOnboard.mockResolvedValue({ ok: false, reason: 'disabled' });
    monter();

    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/onboarding/host'));
  });

  it('un échec se dit, et « Réessayer » recrée', async () => {
    autoOnboard.mockResolvedValueOnce({ ok: false, reason: 'failed' }).mockResolvedValueOnce({ ok: true, created: false });
    const user = userEvent.setup();
    monter();

    expect(await screen.findByRole('alert')).toHaveTextContent('Votre espace n’a pas pu être créé. Réessayez.');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/app/properties/new'));
    expect(autoOnboard).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2 : lancer, constater l'échec**

Run : `npx vitest run src/app/publish/__tests__/page.auto-space.test.tsx`
Expected : FAIL. `routeur.replace` reçoit `'/onboarding/host'`, et `autoOnboard` n'est jamais appelé.

**Step 3 : implémenter**

`src/app/publish/page.tsx` (C seul). Les imports deviennent :

```tsx
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, Home, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { BarreDeMarque } from '@/components/brand/BarreDeMarque';
import { Button } from '@/components/ui/button';
import { autoOnboardAction } from '@/app/actions/auto-onboard';
import { useAuth } from '@/context/AuthContext';
import { profilesKeys, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { PUBLISH_TARGETS, usePublishIntent, type EspaceDePublication } from '@/hooks/usePublishIntent';
```

Dans le composant, après `const parti = useRef(false);`, ajouter :

```tsx
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [creation, setCreation] = useState(false);
  const [echecCreation, setEchecCreation] = useState(false);

  /**
   * TCK-633 (lot C) — aucun espace où publier : on le crée sans question, puis on ouvre le
   * formulaire. Le SERVEUR arbitre le drapeau `host_auto_space` : `disabled` (403) reprend
   * l'assistant actuel, intact.
   */
  async function creerPuisPartir() {
    setEchecCreation(false);
    setCreation(true);
    const r = await autoOnboardAction(user?.preferences?.city ?? null);
    if (r.ok) {
      await queryClient.invalidateQueries({ queryKey: profilesKeys.all });
      router.replace(PUBLISH_TARGETS.newProperty);
      return;
    }
    if (r.reason === 'disabled') {
      router.replace(PUBLISH_TARGETS.hostWizard);
      return;
    }
    if (r.reason === 'unauthenticated') {
      router.replace(PUBLISH_TARGETS.login);
      return;
    }
    setCreation(false);
    setEchecCreation(true);
  }
```

Remplacer l'effet :

```tsx
  useEffect(() => {
    if (!decision.target || parti.current) return;
    parti.current = true;
    void partir(decision.target, decision.profilABasculer);
    // `partir` n'a d'autre dépendance que la décision : une seule navigation par décision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.target, decision.profilABasculer]);
```

par :

```tsx
  useEffect(() => {
    if (!decision.target || parti.current) return;
    parti.current = true;
    if (decision.status === 'host-needed') {
      void creerPuisPartir();
      return;
    }
    void partir(decision.target, decision.profilABasculer);
    // `partir` et `creerPuisPartir` n'ont d'autre dépendance que la décision : une seule
    // navigation par décision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.target, decision.profilABasculer, decision.status]);
```

Dans le rendu, remplacer la branche `) : echec ? (` … jusqu'à la fin de la branche de chargement :

```tsx
        ) : echec ? (
```

par :

```tsx
        ) : echecCreation ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p role="alert" className="max-w-sm text-sm text-destructive">
              {t('auto.error')}
            </p>
            <Button type="button" onClick={() => void creerPuisPartir()}>
              {t('retry')}
            </Button>
          </div>
        ) : echec ? (
```

puis, dans la branche de chargement, remplacer :

```tsx
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {t('title')}
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground">{t('body')}</p>
```

par :

```tsx
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {creation ? t('auto.title') : t('title')}
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground">{creation ? t('auto.body') : t('body')}</p>
```

`src/hooks/usePublishIntent.ts` (doc seule). Remplacer la ligne :

```ts
 * - **aucun espace où publier** → l'assistant hôte (`/onboarding/host`), qui en crée un ;
```

par :

```ts
 * - **aucun espace où publier** → l'assistant hôte (`/onboarding/host`), qui en crée un — sauf
 *   que la page `/publish` tente d'abord la création AUTOMATIQUE (TCK-633, drapeau
 *   `host_auto_space`, arbitré par le serveur) et ne suit cette cible que si elle est éteinte ;
```

**Step 4 : lancer les tests, constater le vert**

Run : `npx vitest run src/app/publish/__tests__/ src/hooks/__tests__/usePublishIntent.test.ts`
Expected : PASS (le test du layout et celui du hook restent verts).

**Step 5 : ablation** (`page.tsx`, tenu par C seul)

```bash
cd "$WEB"; F=src/app/publish/page.tsx
cp "$F" "$ABL/t11.tsx"; md5 -q "$F" > "$ABL/t11.md5"
```

Par Edit, remplacer `if (decision.status === 'host-needed') {` par `if (false) {`.

Run : `npx vitest run src/app/publish/__tests__/page.auto-space.test.tsx`
Expected : FAIL. `expected "spy" to be called with arguments: [ '/app/properties/new' ]`.

```bash
cp "$ABL/t11.tsx" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t11.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter.**

---

## Task 12 : profil — case WhatsApp et second numéro

**Files:**
- Create: `takussan-web/src/components/profile/security/CaseWhatsApp.tsx`, `takussan-web/src/components/profile/security/SecondaryPhoneSection.tsx`
- Modify: `takussan-web/src/components/profile/ProfileContactSection.tsx:16-17,322-327,461`
- Test: `takussan-web/src/components/profile/security/__tests__/CaseWhatsApp.test.tsx`, `.../SecondaryPhoneSection.test.tsx`

**Step 1 : écrire les tests qui échouent**

`CaseWhatsApp.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { CaseWhatsApp } from '../CaseWhatsApp';

const { majMock, setUserMock, courant } = vi.hoisted(() => ({
  majMock: vi.fn(),
  setUserMock: vi.fn(),
  courant: { user: null as Partial<User> | null },
}));
vi.mock('@/app/actions/contact-preferences', () => ({
  updateContactPreferencesAction: (p: unknown) => majMock(p),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: courant.user, setUser: setUserMock, refreshUser: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  courant.user = { id: 1, phone_whatsapp: false };
});

describe('<CaseWhatsApp> — TCK-633', () => {
  it('cocher enregistre la case et met le compte à jour', async () => {
    majMock.mockResolvedValue({ ok: true, user: { id: 1, phone_whatsapp: true } });
    const user = userEvent.setup();
    render(withIntl(<CaseWhatsApp champ="phone_whatsapp" id="w" />));

    await user.click(screen.getByRole('checkbox', { name: 'Ce numéro reçoit WhatsApp' }));

    await waitFor(() => expect(setUserMock).toHaveBeenCalledWith({ id: 1, phone_whatsapp: true }));
    expect(majMock).toHaveBeenCalledWith({ phone_whatsapp: true });
  });

  it('un refus se dit', async () => {
    majMock.mockResolvedValue({ ok: false, message: 'Refusé.' });
    const user = userEvent.setup();
    render(withIntl(<CaseWhatsApp champ="secondary_phone_whatsapp" id="w2" />));

    await user.click(screen.getByRole('checkbox'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Refusé.');
    expect(setUserMock).not.toHaveBeenCalled();
  });
});
```

`SecondaryPhoneSection.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { SecondaryPhoneSection } from '../SecondaryPhoneSection';

const m = vi.hoisted(() => ({
  envoyer: vi.fn(),
  verifier: vi.fn(),
  retirer: vi.fn(),
  setUser: vi.fn(),
  courant: { user: null as Partial<User> | null },
}));
vi.mock('@/app/actions/secondary-phone', () => ({
  secondaryPhoneSendOtpAction: (p: string) => m.envoyer(p),
  secondaryPhoneVerifyAction: (p: string, c: string, w: boolean) => m.verifier(p, c, w),
  secondaryPhoneRemoveAction: () => m.retirer(),
}));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: m.courant.user, setUser: m.setUser, refreshUser: vi.fn() }),
}));

const VERIFIE: Partial<User> = { id: 1, phone: '+221770000601', phone_verified_at: '2026-10-01T00:00:00Z', secondary_phone: null, secondary_phone_verified_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.courant.user = VERIFIE;
});

describe('<SecondaryPhoneSection> — TCK-633', () => {
  it('rien tant que le numéro principal n’est pas vérifié', () => {
    m.courant.user = { ...VERIFIE, phone_verified_at: null };
    const { container } = render(withIntl(<SecondaryPhoneSection />));
    expect(container).toBeEmptyDOMElement();
  });

  it('ajoute un second numéro : code, puis vérification avec WhatsApp', async () => {
    m.envoyer.mockResolvedValue({ ok: true, codeApercu: null });
    const misAJour = { ...VERIFIE, secondary_phone: '+221770000602', secondary_phone_verified_at: '2026-10-12T00:00:00Z', secondary_phone_whatsapp: true };
    m.verifier.mockResolvedValue({ ok: true, user: misAJour });
    const user = userEvent.setup();
    render(withIntl(<SecondaryPhoneSection />));

    fireEvent.change(screen.getByTestId('secondary-phone-input'), { target: { value: '770000602' } });
    await user.click(screen.getByRole('checkbox', { name: 'Ce numéro reçoit WhatsApp' }));
    await user.click(screen.getByTestId('secondary-phone-send'));
    await waitFor(() => expect(m.envoyer).toHaveBeenCalledWith('+221770000602'));

    await user.type(await screen.findByTestId('secondary-phone-code'), '123456');
    await user.click(screen.getByTestId('secondary-phone-verify'));

    await waitFor(() => expect(m.setUser).toHaveBeenCalledWith(misAJour));
    expect(m.verifier).toHaveBeenCalledWith('+221770000602', '123456', true);
  });

  it('un second numéro vérifié se retire', async () => {
    m.courant.user = { ...VERIFIE, secondary_phone: '+221770000602', secondary_phone_verified_at: '2026-10-12T00:00:00Z' };
    m.retirer.mockResolvedValue({ ok: true, user: VERIFIE });
    const user = userEvent.setup();
    render(withIntl(<SecondaryPhoneSection />));

    expect(screen.getByTestId('secondary-phone-value')).toHaveTextContent('+221770000602');
    await user.click(screen.getByTestId('secondary-phone-remove'));

    await waitFor(() => expect(m.setUser).toHaveBeenCalledWith(VERIFIE));
  });

  it('un refus de l’API se dit', async () => {
    m.envoyer.mockResolvedValue({ ok: false, message: 'Ce numéro est déjà votre numéro principal.' });
    const user = userEvent.setup();
    render(withIntl(<SecondaryPhoneSection />));

    fireEvent.change(screen.getByTestId('secondary-phone-input'), { target: { value: '770000601' } });
    await user.click(screen.getByTestId('secondary-phone-send'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce numéro est déjà votre numéro principal.');
  });
});
```

**Step 2 : lancer, constater l'échec**

Run : `npx vitest run src/components/profile/security/__tests__/CaseWhatsApp.test.tsx src/components/profile/security/__tests__/SecondaryPhoneSection.test.tsx`
Expected : FAIL, `Failed to resolve import "../CaseWhatsApp"`.

**Step 3 : implémenter**

`src/components/profile/security/CaseWhatsApp.tsx` :

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { updateContactPreferencesAction } from '@/app/actions/contact-preferences';
import { useAuth } from '@/context/AuthContext';

/**
 * TCK-633 (lot C) — la case « Ce numéro reçoit WhatsApp » d'un numéro du compte, enregistrée au
 * geste. Le bouton WhatsApp d'une annonce ne vise qu'un numéro ainsi déclaré.
 */
export function CaseWhatsApp({
  champ,
  id,
}: {
  readonly champ: 'phone_whatsapp' | 'secondary_phone_whatsapp';
  readonly id: string;
}) {
  const t = useTranslations('profile.contact');
  const { user, setUser } = useAuth();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          id={id}
          type="checkbox"
          checked={user?.[champ] === true}
          disabled={enCours || !user}
          data-testid={`${champ}-toggle`}
          onChange={(e) => {
            const valeur = e.target.checked;
            setErreur(null);
            demarrer(async () => {
              const r = await updateContactPreferencesAction({ [champ]: valeur });
              if (r.ok) setUser(r.user);
              else setErreur(r.message);
            });
          }}
          className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
        />
        {t('whatsappLabel')}
      </label>
      {erreur ? (
        <p role="alert" className="text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
```

`src/components/profile/security/SecondaryPhoneSection.tsx` :

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import {
  secondaryPhoneRemoveAction,
  secondaryPhoneSendOtpAction,
  secondaryPhoneVerifyAction,
} from '@/app/actions/secondary-phone';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/context/AuthContext';
import { isE164 } from '@/lib/phone';

import { CaseWhatsApp } from './CaseWhatsApp';

type Retour = { ok: boolean; message: string };

/**
 * TCK-633 (lot C, AC8) — un second numéro, vérifié par code. Il ne sert JAMAIS à se connecter.
 * Visible une fois le numéro principal vérifié : le second vient après le premier.
 */
export function SecondaryPhoneSection() {
  const t = useTranslations('profile.contact.secondary');
  const tCommon = useTranslations('common.actions');
  const { user, setUser } = useAuth();
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState(false);
  const [codeEnvoye, setCodeEnvoye] = useState(false);
  const [code, setCode] = useState('');
  const [apercu, setApercu] = useState<string | null>(null);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!user?.phone_verified_at) return null;
  const enregistre = user.secondary_phone && user.secondary_phone_verified_at ? user.secondary_phone : null;

  const envoyer = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await secondaryPhoneSendOtpAction(phone);
      if (r.ok) {
        setCodeEnvoye(true);
        setApercu(r.codeApercu);
        setRetour({ ok: true, message: t('codeSent') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  const verifier = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await secondaryPhoneVerifyAction(phone, code, whatsapp);
      if (r.ok) {
        setUser(r.user);
        setPhone('');
        setCode('');
        setCodeEnvoye(false);
        setApercu(null);
        setRetour({ ok: true, message: t('verified') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  const retirer = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await secondaryPhoneRemoveAction();
      if (r.ok) {
        setUser(r.user);
        setRetour({ ok: true, message: t('removed') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3" data-testid="secondary-phone-section">
      <p className="text-xs font-semibold text-muted-foreground">{t('title')}</p>
      {enregistre ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground tabular-nums" data-testid="secondary-phone-value">
              {enregistre}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={retirer} disabled={enCours} data-testid="secondary-phone-remove">
              {t('remove')}
            </Button>
          </div>
          <CaseWhatsApp champ="secondary_phone_whatsapp" id="secondary-phone-whatsapp" />
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('hint')}</p>
          <PhoneInput
            id="secondary-phone"
            value={phone}
            onValueChange={setPhone}
            disabled={enCours}
            data-testid="secondary-phone-input"
          />
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={whatsapp}
              onChange={(e) => setWhatsapp(e.target.checked)}
              className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
            />
            {t('whatsapp')}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={envoyer}
              disabled={enCours || !isE164(phone)}
              data-testid="secondary-phone-send"
            >
              {codeEnvoye ? t('resend') : t('send')}
            </Button>
            {codeEnvoye ? (
              <>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="one-time-code"
                  aria-label={t('codeAria')}
                  data-testid="secondary-phone-code"
                  className="max-w-[8rem]"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={verifier}
                  disabled={enCours || code.length !== 6}
                  data-testid="secondary-phone-verify"
                >
                  {tCommon('confirm')}
                </Button>
              </>
            ) : null}
          </div>
          <CodeDePreproduction code={codeEnvoye ? apercu : null} onUtiliser={setCode} />
        </>
      )}
      {retour ? (
        <p role={retour.ok ? 'status' : 'alert'} className={'text-xs ' + (retour.ok ? 'text-success' : 'text-destructive')}>
          {retour.message}
        </p>
      ) : null}
    </div>
  );
}
```

`ProfileContactSection.tsx` (C seul). Après `import { useAuth } from '@/context/AuthContext';`, ajouter :

```tsx
import { CaseWhatsApp } from '@/components/profile/security/CaseWhatsApp';
import { SecondaryPhoneSection } from '@/components/profile/security/SecondaryPhoneSection';
```

Ancre (L322-327) :

```tsx
            <p className="text-xs text-muted-foreground">
              {t('phoneHint')}
            </p>
          )}
        </div>
```

remplacée par :

```tsx
            <p className="text-xs text-muted-foreground">
              {t('phoneHint')}
            </p>
          )}
          {/* TCK-633 (lot C) — la case WhatsApp vaut pour le numéro ENREGISTRÉ et vérifié. */}
          {phoneVerified && !phoneDirty && savedPhone.length > 0 ? (
            <CaseWhatsApp champ="phone_whatsapp" id="phone-whatsapp" />
          ) : null}
        </div>
```

Ancre (L461-462) :

```tsx
        <div className="space-y-1">
          <label htmlFor="contact-bio"
```

remplacée par :

```tsx
        <SecondaryPhoneSection />

        <div className="space-y-1">
          <label htmlFor="contact-bio"
```

**Step 4 : lancer les tests, constater le vert**

Run : `npx vitest run src/components/profile/security/__tests__/CaseWhatsApp.test.tsx src/components/profile/security/__tests__/SecondaryPhoneSection.test.tsx src/components/profile/__tests__/ProfileContactSection.test.tsx src/components/profile/__tests__/ProfileContactSection.email.test.tsx src/components/profile/__tests__/ProfileContactSection.preuve.test.tsx`
Expected : PASS.

Les trois fichiers existants ne doublent pas les deux actions neuves. Si l'un d'eux échoue **à l'import**, ajouter dans chacun, sous ses `vi.mock` existants :

```tsx
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));
vi.mock('@/app/actions/secondary-phone', () => ({
  secondaryPhoneSendOtpAction: vi.fn(),
  secondaryPhoneVerifyAction: vi.fn(),
  secondaryPhoneRemoveAction: vi.fn(),
}));
```

Puis relancer : PASS attendu, et noter l'ajout dans le rapport.

**Step 5 : ablation** (`SecondaryPhoneSection.tsx`, tenu par C seul)

```bash
F=src/components/profile/security/SecondaryPhoneSection.tsx
cp "$F" "$ABL/t12.tsx"; md5 -q "$F" > "$ABL/t12.md5"
```

Par Edit, remplacer `const r = await secondaryPhoneVerifyAction(phone, code, whatsapp);` par `const r = await secondaryPhoneVerifyAction(phone, code, false);`.

Run : `npx vitest run src/components/profile/security/__tests__/SecondaryPhoneSection.test.tsx`
Expected : FAIL, `expected "spy" to be called with arguments: [ '+221770000602', '123456', true ]`.

```bash
cp "$ABL/t12.tsx" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t12.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter.**

---

## Task 13 : fiche publique — numéros listés, WhatsApp sur le numéro déclaré

**Files:**
- Create: `takussan-web/src/components/contact/numeros-du-bien.ts`, `takussan-web/src/components/contact/ListeDeNumeros.tsx`
- Modify: `takussan-web/src/components/contact/WhatsAppButton.tsx:8-60`
- Modify: `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyAgentCard.tsx:1-67,124-143`
- Modify: `takussan-web/src/components/contact/__tests__/WhatsAppButton.tck-590.test.tsx`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/__tests__/PropertyAgentCard.tck-590.test.tsx:54-58`
- Test: `takussan-web/src/components/contact/__tests__/WhatsAppButton.tck-633.test.tsx`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/__tests__/PropertyAgentCard.tck-633.test.tsx`

**Step 1 : écrire les tests qui échouent**

`WhatsAppButton.tck-633.test.tsx` :

```tsx
/** TCK-633 (lot C, AC8) — le bouton WhatsApp vise le PREMIER numéro déclaré WhatsApp. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { WhatsAppButton } from '../WhatsAppButton';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

describe('<WhatsAppButton> — TCK-633', () => {
  let fenetre: { location: { href: string }; opener: unknown; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    apiFetch.mockReset();
    toastAdd.mockReset();
    fenetre = { location: { href: '' }, opener: window, close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => fenetre));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sans numéro WhatsApp déclaré, aucun bouton', () => {
    const { container } = render(withIntl(<WhatsAppButton slug="villa" title="Villa" hasWhatsApp={false} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('vise le premier numéro déclaré WhatsApp, pas le principal', async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact')
        ? Promise.resolve({ data: [
            { phone: '+221770000801', whatsapp: false, label: null, kind: 'primary' },
            { phone: '+221770000803', whatsapp: true, label: 'Gardien', kind: 'on_site' },
          ] })
        : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    render(withIntl(<WhatsAppButton slug="villa" title="Villa" hasWhatsApp />));

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(fenetre.location.href).toMatch(/^https:\/\/wa\.me\/221770000803\?text=/));
  });

  it('aucun numéro WhatsApp dans la liste : la fenêtre se referme, un toast le dit', async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact')
        ? Promise.resolve({ data: [{ phone: '+221770000801', whatsapp: false, label: null, kind: 'primary' }] })
        : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    render(withIntl(<WhatsAppButton slug="villa" title="Villa" hasWhatsApp />));

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(fenetre.close).toHaveBeenCalled());
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
```

`PropertyAgentCard.tck-633.test.tsx` :

```tsx
/** TCK-633 (lot C, AC8 / AC12) — « Appeler » révèle tous les numéros au même geste. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from '../PropertyAgentCard';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const toastAdd = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const AGENT: PropertyOwnerLite = {
  id: 2, name: 'Ousmane Ndiaye', slug: 'ousmane-ndiaye', avatar_url: null, is_agent: true, member_since: null,
};

function monter(contact: PropertyOwnerLite) {
  return render(withIntl(
    <PropertyAgentCard contact={contact} agency={null} propertySlug="villa" propertyTitle="Villa" onMessage={() => {}} />,
  ));
}

describe('<PropertyAgentCard> — TCK-633', () => {
  it('plusieurs numéros : la liste, titrée, derrière « Appeler »', async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact')
        ? Promise.resolve({ data: [
            { phone: '+221770000801', whatsapp: true, label: null, kind: 'primary' },
            { phone: '+221770000803', whatsapp: false, label: 'Gardien', kind: 'on_site' },
          ] })
        : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    monter({ ...AGENT, has_phone: true });

    await user.click(screen.getByRole('button', { name: /appeler/i }));

    const liste = await screen.findByTestId('numeros-de-contact');
    expect(within(liste).getByRole('link', { name: /\+221770000801/ })).toHaveAttribute('href', 'tel:+221770000801');
    expect(within(liste).getByText('Numéro principal')).toBeInTheDocument();
    expect(within(liste).getByText('Gardien')).toBeInTheDocument();
  });

  it('aucun numéro : un toast, pas de liste', async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact') ? Promise.resolve({ data: [] }) : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    monter({ ...AGENT, has_phone: true });

    await user.click(screen.getByRole('button', { name: /appeler/i }));

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
    expect(screen.queryByTestId('numeros-de-contact')).not.toBeInTheDocument();
  });

  it('WhatsApp seulement si un numéro est déclaré WhatsApp', () => {
    const { unmount } = monter({ ...AGENT, has_phone: true, has_whatsapp: false });
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
    unmount();

    monter({ ...AGENT, has_phone: true, has_whatsapp: true });
    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeInTheDocument();
  });
});
```

Dans `PropertyAgentCard.tck-590.test.tsx`, remplacer L54-58 :

```tsx
  it('has_phone vrai : les deux boutons', () => {
    monter({ ...AGENT, has_phone: true });
```

par :

```tsx
  it('has_phone et has_whatsapp vrais : les deux boutons', () => {
    monter({ ...AGENT, has_phone: true, has_whatsapp: true });
```

Dans `WhatsAppButton.tck-590.test.tsx`, faire trois remplacements :

- remplacer chaque `hasPhone={false}` par `hasWhatsApp={false}`, et chaque ` hasPhone />` par ` hasWhatsApp />` (5 occurrences en tout) ;
- remplacer `const contact = enAttente<{ phone: string }>();` par `const contact = enAttente<{ data: { phone: string; whatsapp: boolean; label: null; kind: 'primary' }[] }>();`, et `contact.resoudre({ phone: '+221 77 123 45 67' });` par `contact.resoudre({ data: [{ phone: '+221 77 123 45 67', whatsapp: true, label: null, kind: 'primary' }] });` ;
- remplacer chaque `Promise.resolve({ phone: '+221771234567' })` (2 occurrences) par `Promise.resolve({ data: [{ phone: '+221771234567', whatsapp: true, label: null, kind: 'primary' }] })`.

**Step 2 : lancer, constater l'échec**

Run : `npx vitest run src/components/contact/__tests__/ "src/app/[locale]/(public)/properties/[slug]/components/__tests__/PropertyAgentCard.tck-633.test.tsx" "src/app/[locale]/(public)/properties/[slug]/components/__tests__/PropertyAgentCard.tck-590.test.tsx"`
Expected : FAIL. La prop `hasWhatsApp` est inconnue, et la liste n'est pas rendue.

**Step 3 : implémenter**

`src/components/contact/numeros-du-bien.ts` :

```ts
import { apiFetch } from '@/lib/api';

/**
 * TCK-633 (lot C) — la réponse de `GET /public/properties/{slug}/contact` : les numéros du bien,
 * principal, second, puis sur place. Révélée au geste, sous limiteur.
 */
export type GenreDeNumero = 'primary' | 'secondary' | 'on_site';

export interface NumeroDeContact {
  readonly phone: string;
  readonly whatsapp: boolean;
  readonly label: string | null;
  readonly kind: GenreDeNumero;
}

export async function numerosDuBien(slug: string): Promise<NumeroDeContact[]> {
  const res = await apiFetch<{ data?: NumeroDeContact[] } | undefined>(`/public/properties/${slug}/contact`);
  return Array.isArray(res?.data) ? res.data : [];
}

/** Le premier numéro DÉCLARÉ WhatsApp, ou `null` : le bouton ne vise jamais un autre. */
export function premierNumeroWhatsApp(numeros: readonly NumeroDeContact[]): NumeroDeContact | null {
  return numeros.find((n) => n.whatsapp) ?? null;
}
```

`src/components/contact/ListeDeNumeros.tsx` :

```tsx
'use client';

import { MessageCircle, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { NumeroDeContact } from './numeros-du-bien';

/** TCK-633 (lot C) — les numéros d'un bien, révélés au geste « Appeler », chacun composable. */
export function ListeDeNumeros({ numeros }: { readonly numeros: readonly NumeroDeContact[] }) {
  const t = useTranslations('property.contacts.public');

  const libelle = (n: NumeroDeContact) =>
    n.kind === 'primary' ? t('kind.primary') : n.kind === 'secondary' ? t('kind.secondary') : (n.label ?? t('kind.onSite'));

  return (
    <ul className="space-y-2" data-testid="numeros-de-contact" aria-label={t('listAria')}>
      {numeros.map((n, i) => (
        <li key={`${n.kind}-${i}`}>
          <a
            href={`tel:${n.phone.replace(/\s/g, '')}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Phone className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground tabular-nums">{n.phone}</span>
                <span className="block truncate text-xs text-muted-foreground">{libelle(n)}</span>
              </span>
            </span>
            {n.whatsapp ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-success">
                <MessageCircle className="size-3.5" aria-hidden="true" />
                {t('whatsapp')}
              </span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
```

`WhatsAppButton.tsx` (C seul) :

- dans les imports, remplacer `import { apiFetch } from '@/lib/api';` par `import { numerosDuBien, premierNumeroWhatsApp } from './numeros-du-bien';` ;
- dans `interface Props`, remplacer le bloc `hasPhone: boolean;` et son commentaire par :

```tsx
  /**
   * TCK-633 (lot C) — au moins un numéro du bien est déclaré WhatsApp
   * (`primary_contact.has_whatsapp`). Sans lui, pas de bouton : il visait un numéro qui n'a
   * peut-être pas WhatsApp.
   */
  hasWhatsApp: boolean;
```

- dans la signature, `hasPhone` devient `hasWhatsApp`, et la garde devient `if (!hasWhatsApp) return null;` ;
- dans `handleContact`, remplacer :

```tsx
      const res = await apiFetch<{ phone: string | null }>(`/public/properties/${slug}/contact`);
      const phone = res.phone?.replace(/\D/g, '') ?? '';
```

par :

```tsx
      const numero = premierNumeroWhatsApp(await numerosDuBien(slug));
      const phone = numero?.phone.replace(/\D/g, '') ?? '';
```

`PropertyAgentCard.tsx` (C seul) :

- dans les imports, remplacer `import { apiFetch } from '@/lib/api';` par :

```tsx
import { ListeDeNumeros } from '@/components/contact/ListeDeNumeros';
import { numerosDuBien, type NumeroDeContact } from '@/components/contact/numeros-du-bien';
```

- après `const [calling, setCalling] = useState(false);`, ajouter `  const [numeros, setNumeros] = useState<NumeroDeContact[] | null>(null);` ;
- après `const hasPhone = contact.has_phone === true;`, ajouter :

```tsx
  // TCK-633 (lot C) — WhatsApp seulement vers un numéro DÉCLARÉ WhatsApp.
  const hasWhatsApp = contact.has_whatsapp === true;
```

- dans `handleCall`, remplacer :

```tsx
      const res = await apiFetch<{ phone: string | null }>(
        `/public/properties/${propertySlug}/contact`,
      );
      if (res.phone) {
        window.location.href = `tel:${res.phone.replace(/\s/g, '')}`;
      } else {
```

par :

```tsx
      // TCK-633 (lot C) — une LISTE : un seul numéro se compose aussitôt, plusieurs s'affichent
      // (principal, second, sur place), au même geste.
      const liste = await numerosDuBien(propertySlug);
      if (liste.length === 1) {
        window.location.href = `tel:${liste[0]!.phone.replace(/\s/g, '')}`;
      } else if (liste.length > 1) {
        setNumeros(liste);
      } else {
```

- remplacer `      <WhatsAppButton slug={propertySlug} title={propertyTitle} hasPhone={hasPhone} />` par :

```tsx
      {numeros ? <ListeDeNumeros numeros={numeros} /> : null}

      <WhatsAppButton slug={propertySlug} title={propertyTitle} hasWhatsApp={hasWhatsApp} />
```

**Step 4 : lancer les tests, constater le vert**

Run : `npx vitest run src/components/contact/__tests__/ "src/app/[locale]/(public)/properties/[slug]/components/__tests__/"`
Expected : PASS.

**Step 5 : ablation** (`numeros-du-bien.ts`, tenu par C seul)

```bash
F=src/components/contact/numeros-du-bien.ts
cp "$F" "$ABL/t13.ts"; md5 -q "$F" > "$ABL/t13.md5"
```

Par Edit, remplacer `numeros.find((n) => n.whatsapp)` par `numeros[0]`.

Run : `npx vitest run src/components/contact/__tests__/WhatsAppButton.tck-633.test.tsx`
Expected : FAIL. Le lien vise `221770000801` au lieu de `221770000803`.

```bash
cp "$ABL/t13.ts" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t13.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter.**

---

## Task 14 : le parcours de publication — contacts sur place, coordonnées, CGU

**Files:**
- Modify (compléter): `takussan-web/src/components/contact/ContactsSurPlace.tsx`
- Create: `takussan-web/src/components/contact/CoordonneesPublication.tsx`
- Modify: `takussan-web/src/components/property-form/wizard/steps/StepFinition.tsx:3,58,103-104`
- Modify: `takussan-web/src/components/property-form/PropertyWizard.tsx` (co-tenu D, par Edit : imports L22-27/L43, état L262, échecs L326, publication L337-343, finition L552)
- Modify: `takussan-web/src/components/property-form/__tests__/PropertyWizard.test.tsx` (co-tenu D, par Edit)
- Test: `takussan-web/src/components/contact/__tests__/ContactsSurPlace.test.tsx`, `.../CoordonneesPublication.test.tsx`, `takussan-web/src/components/property-form/__tests__/PropertyWizard.publication.tck-633.test.tsx`

**Step 1 : écrire les tests qui échouent**

`ContactsSurPlace.test.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { withIntl } from '@/test/intl';
import { ContactsSurPlace, type ContactSurPlace } from '../ContactsSurPlace';

function Hote({ surChangement }: { surChangement: (v: ContactSurPlace[]) => void }) {
  const [valeur, setValeur] = useState<ContactSurPlace[]>([]);
  return (
    <ContactsSurPlace
      valeur={valeur}
      onChange={(v) => {
        setValeur(v);
        surChangement(v);
      }}
    />
  );
}

describe('<ContactsSurPlace> — TCK-633', () => {
  it('trois au plus : le bouton d’ajout disparaît au troisième', () => {
    render(withIntl(<Hote surChangement={() => {}} />));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }));

    expect(screen.queryByRole('button', { name: 'Ajouter un contact' })).not.toBeInTheDocument();
    expect(screen.getByText('Trois contacts au plus.')).toBeInTheDocument();
  });

  it('un contact se titre, se numérote, se déclare WhatsApp, se retire', () => {
    const surChangement = vi.fn();
    render(withIntl(<Hote surChangement={surChangement} />));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }));

    fireEvent.change(screen.getByLabelText('Qui ?'), { target: { value: 'Gardien' } });
    fireEvent.change(screen.getByLabelText('Numéro'), { target: { value: '770000803' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'WhatsApp' }));

    expect(surChangement).toHaveBeenLastCalledWith([{ label: 'Gardien', phone: '+221770000803', has_whatsapp: true }]);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le contact 1' }));
    expect(surChangement).toHaveBeenLastCalledWith([]);
  });
});
```

`CoordonneesPublication.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { CoordonneesPublication } from '../CoordonneesPublication';

const m = vi.hoisted(() => ({
  maj: vi.fn(),
  envoyer: vi.fn(),
  verifier: vi.fn(),
  setUser: vi.fn(),
  refreshUser: vi.fn(),
  courant: { user: null as Partial<User> | null },
}));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: (p: unknown) => m.maj(p) }));
vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (p?: string) => m.envoyer(p),
  phoneVerifyOtpAction: (c: string) => m.verifier(c),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: m.courant.user, setUser: m.setUser, refreshUser: m.refreshUser }),
}));

const PRET: Partial<User> = {
  id: 1, first_name: 'Awa', last_name: 'Diop', phone: '+221770000901',
  phone_verified_at: '2026-10-01T00:00:00Z', terms_accepted_at: '2026-10-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.courant.user = PRET;
  m.refreshUser.mockResolvedValue(undefined);
});

describe('<CoordonneesPublication> — TCK-633', () => {
  it('rien à demander : rien ne s’affiche', () => {
    const { container } = render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));
    expect(container).toBeEmptyDOMElement();
  });

  it('CGU jamais acceptées : la phrase et le lien', () => {
    m.courant.user = { ...PRET, terms_accepted_at: null };
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    expect(screen.getByTestId('phrase-cgu')).toHaveTextContent('En publiant, vous acceptez les conditions générales d’utilisation.');
    expect(screen.getByRole('link', { name: 'conditions générales d’utilisation' })).toHaveAttribute('href', expect.stringContaining('/legal/terms'));
  });

  it('sans prénom : le demande et l’enregistre', async () => {
    m.courant.user = { ...PRET, first_name: '' };
    m.maj.mockResolvedValue({ ok: true, user: PRET });
    const user = userEvent.setup();
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    await user.type(screen.getByLabelText('Prénom'), 'Awa');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(m.setUser).toHaveBeenCalledWith(PRET));
    expect(m.maj).toHaveBeenCalledWith({ first_name: 'Awa', last_name: 'Diop' });
  });

  it('sans numéro vérifié : code, vérification, compte relu, WhatsApp enregistré', async () => {
    m.courant.user = { ...PRET, phone: null, phone_verified_at: null };
    m.envoyer.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
    m.verifier.mockResolvedValue({ ok: true, data: null });
    m.maj.mockResolvedValue({ ok: true, user: PRET });
    const user = userEvent.setup();
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    fireEvent.change(screen.getByLabelText('Votre numéro'), { target: { value: '770000901' } });
    await user.click(screen.getByRole('checkbox', { name: 'Ce numéro reçoit WhatsApp' }));
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
    await waitFor(() => expect(m.envoyer).toHaveBeenCalledWith('+221770000901'));

    await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await waitFor(() => expect(m.refreshUser).toHaveBeenCalled());
    expect(m.verifier).toHaveBeenCalledWith('123456');
    expect(m.maj).toHaveBeenCalledWith({ phone_whatsapp: true });
  });

  it('le contact est un autre : on le dit, sans formulaire', () => {
    render(withIntl(<CoordonneesPublication manquantsServeur={['verified_phone']} contactEstSoi={false} />));
    expect(screen.getByRole('alert')).toHaveTextContent('Le contact de ce bien n’a pas encore de prénom ou de numéro vérifié');
    expect(screen.queryByLabelText('Votre numéro')).not.toBeInTheDocument();
  });
});
```

`PropertyWizard.publication.tck-633.test.tsx`. Reprendre **à l'identique** les L18-79 de `PropertyWizard.test.tsx` : `routeur`, le mock de la carte, `geo` et son mock, `brouillon` et son mock, `reduction` et son mock, le mock de `dashboard-properties`. Puis :

```tsx
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));

const pub = vi.hoisted(() => ({ publier: vi.fn(), contacts: vi.fn() }));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: (...a: unknown[]) => pub.publier(...a),
}));
vi.mock('@/app/actions/property-contacts', () => ({
  replacePropertyContactsAction: (...a: unknown[]) => pub.contacts(...a),
}));

const auth = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, setUser: vi.fn(), refreshUser: vi.fn() }),
}));

import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { PropertyWizard } from '../PropertyWizard';

const COMPLET = {
  title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
  currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
};

async function allerAuBout() {
  brouillon.etat.draft = { step: 5, data: COMPLET };
  const user = userEvent.setup();
  render(withIntl(<PropertyWizard />));
  await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  brouillon.etat.isLoading = false;
  brouillon.etat.error = null;
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  auth.user = { id: 1, first_name: 'Awa', phone: '+221770000901', phone_verified_at: '2026-10-01T00:00:00Z', terms_accepted_at: null };
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
  pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'available' } });
  pub.contacts.mockResolvedValue({ ok: true });
});

describe('PropertyWizard — publier avec un contact (TCK-633)', () => {
  it('publie en acceptant les CGU que la phrase annonce', async () => {
    const user = await allerAuBout();
    expect(screen.getByTestId('phrase-cgu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(pub.publier).toHaveBeenCalledWith(42, { acceptTerms: true });
  });

  it('422 coordonnées incomplètes : le bloc s’ouvre, le brouillon reste, rien ne part', async () => {
    pub.publier.mockResolvedValueOnce({ ok: false, status: 422, message: 'x', missing: ['verified_phone'], contactIsSelf: true });
    auth.user = { ...auth.user, phone_verified_at: null };
    const user = await allerAuBout();

    await user.click(screen.getByRole('button', { name: /publier/i }));

    expect(await screen.findByText(/Il manque vos coordonnées pour publier/)).toBeInTheDocument();
    expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();
    expect(routeur.push).not.toHaveBeenCalled();
    expect(createPropertyAction).toHaveBeenCalledTimes(1);
  });

  it('les contacts sur place partent après la création, avant la publication', async () => {
    const user = await allerAuBout();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }));
    fireEvent.change(screen.getByLabelText('Qui ?'), { target: { value: 'Gardien' } });
    fireEvent.change(screen.getByLabelText('Numéro'), { target: { value: '770000803' } });

    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(pub.publier).toHaveBeenCalled());
    expect(pub.contacts).toHaveBeenCalledWith(42, [{ label: 'Gardien', phone: '+221770000803', has_whatsapp: false }]);
    expect(pub.contacts.mock.invocationCallOrder[0]).toBeLessThan(pub.publier.mock.invocationCallOrder[0]);
  });
});
```

Les imports de tête du fichier sont ceux de `PropertyWizard.test.tsx` L1-6 : `beforeEach, describe, expect, it, vi`, `fireEvent, render, screen, waitFor`, `userEvent`, `withIntl`.

**Step 2 : lancer, constater l'échec**

Run : `npx vitest run src/components/contact/__tests__/ContactsSurPlace.test.tsx src/components/contact/__tests__/CoordonneesPublication.test.tsx src/components/property-form/__tests__/PropertyWizard.publication.tck-633.test.tsx`
Expected : FAIL. `ContactsSurPlace` n'exporte que son type, `CoordonneesPublication` est introuvable, et `publishPropertyAction` n'est jamais appelé.

**Step 3 : implémenter**

`src/components/contact/ContactsSurPlace.tsx`, complété (le type de la tâche 10 reste) :

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';

/** TCK-633 (lot C) — un contact sur place saisi dans l'étape Finition. */
export interface ContactSurPlace {
  label: string;
  phone: string;
  has_whatsapp: boolean;
}

export const MAX_CONTACTS_SUR_PLACE = 3;

/**
 * TCK-633 (lot C, AC12) — jusqu'à trois numéros titrés (gardien, voisin). Format joignable jugé
 * par l'API (`TelephoneJoignable`) ; ils ne sont révélés qu'au geste « Appeler ».
 */
export function ContactsSurPlace({
  valeur,
  onChange,
}: {
  readonly valeur: readonly ContactSurPlace[];
  readonly onChange: (v: ContactSurPlace[]) => void;
}) {
  const t = useTranslations('property.contacts');
  const modifier = (i: number, patch: Partial<ContactSurPlace>) =>
    onChange(valeur.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4" data-testid="contacts-sur-place">
      <legend className="px-1 text-sm font-semibold text-foreground">{t('title')}</legend>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      {valeur.map((c, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <label htmlFor={`contact-sur-place-label-${i}`} className="text-xs font-semibold text-muted-foreground">
              {t('labelLabel')}
            </label>
            <Input
              id={`contact-sur-place-label-${i}`}
              value={c.label}
              maxLength={60}
              onChange={(e) => modifier(i, { label: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`contact-sur-place-phone-${i}`} className="text-xs font-semibold text-muted-foreground">
              {t('phoneLabel')}
            </label>
            <PhoneInput id={`contact-sur-place-phone-${i}`} value={c.phone} onValueChange={(phone) => modifier(i, { phone })} />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={c.has_whatsapp}
                onChange={(e) => modifier(i, { has_whatsapp: e.target.checked })}
                className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
              />
              {t('whatsapp')}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(valeur.filter((_, k) => k !== i))}
              aria-label={t('removeAria', { index: i + 1 })}
            >
              {t('remove')}
            </Button>
          </div>
        </div>
      ))}
      {valeur.length < MAX_CONTACTS_SUR_PLACE ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...valeur, { label: '', phone: '', has_whatsapp: false }])}
        >
          {t('add')}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{t('max')}</p>
      )}
    </fieldset>
  );
}
```

`src/components/contact/CoordonneesPublication.tsx` :

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { updateContactPreferencesAction } from '@/app/actions/contact-preferences';
import { phoneSendOtpAction, phoneVerifyOtpAction } from '@/app/actions/security';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/context/AuthContext';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { isE164 } from '@/lib/phone';
import type { User } from '@/types/user';

type Retour = { ok: boolean; message: string };

/** Ce que l'écran sait déjà manquer, avant même que l'API le dise. */
export function manquesLocaux(user: Partial<User> | null): Array<'first_name' | 'verified_phone'> {
  if (!user) return [];
  const manque: Array<'first_name' | 'verified_phone'> = [];
  if (!user.first_name?.trim()) manque.push('first_name');
  if (!user.phone_verified_at) manque.push('verified_phone');
  return manque;
}

/**
 * TCK-633 (lot C, AC11) — « Vos coordonnées pour les intéressés », au dernier moment, dans le flux
 * de la publication : prénom et nom, numéro avec code, case WhatsApp, et la phrase des CGU avec
 * son lien. Jamais un détour par le profil. L'API reste juge (`PublishReadiness`) : si elle dit
 * que le contact est un AUTRE (agent principal), l'écran le dit au lieu de faire saisir.
 */
export function CoordonneesPublication({
  manquantsServeur,
  contactEstSoi,
}: {
  readonly manquantsServeur: readonly string[] | null;
  readonly contactEstSoi: boolean;
}) {
  const t = useTranslations('property.form.publishContact');
  const { user, setUser, refreshUser } = useAuth();
  const [prenom, setPrenom] = useState(user?.first_name ?? '');
  const [nom, setNom] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(user?.phone_whatsapp === true);
  const [codeEnvoye, setCodeEnvoye] = useState(false);
  const [code, setCode] = useState('');
  const [apercu, setApercu] = useState<string | null>(null);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();

  const locaux = manquesLocaux(user);
  const autreContact = manquantsServeur !== null && !contactEstSoi && manquantsServeur.some((m) => m !== 'terms');
  const montrerBloc = contactEstSoi && locaux.length > 0;
  const montrerCgu = !user?.terms_accepted_at;

  if (!montrerBloc && !montrerCgu && !autreContact) return null;

  const enregistrerNoms = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await updateContactPreferencesAction({ first_name: prenom.trim(), last_name: nom.trim() });
      if (r.ok) {
        setUser(r.user);
        setRetour({ ok: true, message: t('saved') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  const envoyerCode = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await phoneSendOtpAction(phone);
      if (r.ok) {
        setCodeEnvoye(true);
        setApercu(r.data.codeApercu);
        setRetour({ ok: true, message: t('codeSent') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  const verifierCode = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await phoneVerifyOtpAction(code);
      if (!r.ok) {
        setRetour({ ok: false, message: r.message });
        return;
      }
      if (whatsapp) {
        const w = await updateContactPreferencesAction({ phone_whatsapp: true });
        if (w.ok) setUser(w.user);
      }
      await refreshUser();
      setRetour({ ok: true, message: t('phoneVerified') });
    });
  };

  return (
    <section aria-label={t('title')} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4" data-testid="coordonnees-publication">
      {montrerBloc ? (
        <>
          <h3 className="font-display text-base font-semibold text-foreground">{t('title')}</h3>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>

          {locaux.includes('first_name') ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <label htmlFor="coordonnees-prenom" className="text-xs font-semibold text-muted-foreground">{t('firstNameLabel')}</label>
                <Input id="coordonnees-prenom" value={prenom} maxLength={100} onChange={(e) => setPrenom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label htmlFor="coordonnees-nom" className="text-xs font-semibold text-muted-foreground">{t('lastNameLabel')}</label>
                <Input id="coordonnees-nom" value={nom} maxLength={100} onChange={(e) => setNom(e.target.value)} />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={enregistrerNoms} disabled={enCours || prenom.trim() === ''}>
                {t('saveNames')}
              </Button>
            </div>
          ) : null}

          {locaux.includes('verified_phone') ? (
            <div className="space-y-2">
              <label htmlFor="coordonnees-telephone" className="text-xs font-semibold text-muted-foreground">{t('phoneLabel')}</label>
              <PhoneInput id="coordonnees-telephone" value={phone} onValueChange={setPhone} disabled={enCours} />
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.checked)}
                  className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
                />
                {t('whatsapp')}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={envoyerCode} disabled={enCours || !isE164(phone)}>
                  {codeEnvoye ? t('resendCode') : t('sendCode')}
                </Button>
                {codeEnvoye ? (
                  <>
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      autoComplete="one-time-code"
                      aria-label={t('codeAria')}
                      className="max-w-[8rem]"
                    />
                    <Button type="button" size="sm" onClick={verifierCode} disabled={enCours || code.length !== 6}>
                      {t('verifyCode')}
                    </Button>
                  </>
                ) : null}
              </div>
              <CodeDePreproduction code={codeEnvoye ? apercu : null} onUtiliser={setCode} />
            </div>
          ) : null}

          {retour ? (
            <p role={retour.ok ? 'status' : 'alert'} className={'text-xs ' + (retour.ok ? 'text-success' : 'text-destructive')}>
              {retour.message}
            </p>
          ) : null}
        </>
      ) : null}

      {autreContact ? (
        <p role="alert" className="text-sm text-destructive">{t('otherContact')}</p>
      ) : null}

      {montrerCgu ? (
        <p className="text-xs text-muted-foreground" data-testid="phrase-cgu">
          {t.rich('terms', {
            lien: (morceau) => (
              <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" className="underline underline-offset-2">
                {morceau}
              </LienLocalise>
            ),
          })}
        </p>
      ) : null}
    </section>
  );
}
```

Le test « sans prénom » attend `maj({ first_name: 'Awa', last_name: 'Diop' })` : `PRET.last_name` vaut `'Diop'`, et le champ `nom` part de cette valeur.

`StepFinition.tsx` (C seul) :

- `import { useEffect } from 'react';` devient `import { useEffect, type ReactNode } from 'react';` ;
- la signature `export function StepFinition({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {` devient :

```tsx
export function StepFinition({
  form,
  children,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /**
   * TCK-633 (lot C) — ce que la publication demande en dernier : contacts sur place,
   * « Vos coordonnées pour les intéressés », la phrase des CGU. `WizardShell` n'a pas d'emplacement
   * sous le bouton Publier : c'est la fin de la dernière étape, juste au-dessus.
   */
  readonly children?: ReactNode;
}) {
```

- la fin, `      <VirtualTourField form={form} />\n    </>`, devient `      <VirtualTourField form={form} />\n      {children}\n    </>`.

`PropertyWizard.tsx` (co-tenu D, **Edit par petits blocs, ancres textuelles**) :

1. Ancre `  updatePropertyVisibilityAction,\n  uploadPropertyPhotosAction,\n} from '@/app/actions/dashboard-properties';` : supprimer la ligne `  updatePropertyVisibilityAction,`.
2. Ancre `import { reduirePhotos } from '@/lib/reduire-photo';`. Ajouter après :

```tsx
import { publishPropertyAction } from '@/app/actions/publish-property';
import { replacePropertyContactsAction } from '@/app/actions/property-contacts';
import { ContactsSurPlace, type ContactSurPlace } from '@/components/contact/ContactsSurPlace';
import { CoordonneesPublication } from '@/components/contact/CoordonneesPublication';
```

3. Ancre `  const [echecPublication, setEchecPublication] = useState(false);`. Ajouter après :

```tsx
  /** TCK-633 (lot C) — la cinquième écriture : les contacts sur place, après la création. */
  const [contactsSurPlace, setContactsSurPlace] = useState<ContactSurPlace[]>([]);
  const [contactsEnvoyes, setContactsEnvoyes] = useState(false);
  /** TCK-633 — ce que l'API a refusé de publier faute de coordonnées (`missing`), et pour qui. */
  const [manquants, setManquants] = useState<string[] | null>(null);
  const [contactEstSoi, setContactEstSoi] = useState(true);
  const tContacts = useTranslations('property.contacts');
  const tPublication = useTranslations('property.form.publishContact');
```

4. Ancre `      // Un échec ici n'est PAS un échec de création : le dire autrement enverrait l'utilisateur`. Insérer avant :

```tsx
      const contactsValides = contactsSurPlace.filter((c) => c.phone.trim() !== '');
      if (contactsValides.length > 0 && !contactsEnvoyes) {
        const r = await replacePropertyContactsAction(bien.id, contactsValides);
        if (r.ok) setContactsEnvoyes(true);
        else echecs.push(tContacts('partial'));
      }

```

5. Remplacer le bloc :

```tsx
        const r = await updatePropertyVisibilityAction(bien.id, 'public');
        if (!r.ok) {
          setAvertissement(t('publishFailed', { message: r.message }));
          setEchecPublication(true);
          return;
        }
        statut = r.data?.status ?? 'available';
```

par :

```tsx
        // TCK-633 (lot C) — `POST …/publish` porte l'acceptation des CGU que la phrase de
        // `CoordonneesPublication` annonce. Un refus faute de coordonnées ouvre le bloc, sans
        // quitter la publication ; le brouillon reste, et « Publier » rejoue la seule publication.
        const r = await publishPropertyAction(bien.id, { acceptTerms: true });
        if (!r.ok) {
          setManquants(r.missing);
          setContactEstSoi(r.contactIsSelf);
          setAvertissement(r.missing ? tPublication('incomplete') : t('publishFailed', { message: r.message }));
          setEchecPublication(true);
          return;
        }
        setManquants(null);
        statut = r.data?.status ?? 'available';
```

6. Remplacer `      body: <StepFinition form={form} />,` par :

```tsx
      body: (
        <StepFinition form={form}>
          {proposition ? null : (
            <>
              <ContactsSurPlace valeur={contactsSurPlace} onChange={setContactsSurPlace} />
              <CoordonneesPublication manquantsServeur={manquants} contactEstSoi={contactEstSoi} />
            </>
          )}
        </StepFinition>
      ),
```

`PropertyWizard.test.tsx` (co-tenu D, Edit par blocs) :

- après le bloc `vi.mock('@/app/actions/dashboard-properties', () => ({ … }));` (ancre : `  uploadPropertyPhotosAction: vi.fn(),\n}));`), ajouter :

```tsx
vi.mock('@/app/actions/publish-property', () => ({ publishPropertyAction: vi.fn() }));
vi.mock('@/app/actions/property-contacts', () => ({ replacePropertyContactsAction: vi.fn() }));
```

- après `} from '@/app/actions/dashboard-properties';`, ajouter `import { publishPropertyAction } from '@/app/actions/publish-property';` ;
- dans `beforeEach`, après le bloc `vi.mocked(updatePropertyVisibilityAction).mockResolvedValue({ … } as never);`, ajouter :

```tsx
  vi.mocked(publishPropertyAction).mockResolvedValue({
    ok: true,
    data: { id: 42, status: 'available' },
  } as never);
```

- dans `describe('PropertyWizard — la publication (TCK-627)'` :
  - `expect(updatePropertyVisibilityAction).toHaveBeenCalledWith(42, 'public');` devient `expect(publishPropertyAction).toHaveBeenCalledWith(42, { acceptTerms: true });` ;
  - les deux `vi.mocked(updatePropertyVisibilityAction).mockResolvedValue…(` deviennent `vi.mocked(publishPropertyAction).mockResolvedValue…(`. Pour le refus de quota, le corps devient `{ ok: false, status: 422, message: 'Limite d’annonces atteinte.', missing: null, contactIsSelf: true }` ;
  - `expect(updatePropertyVisibilityAction).toHaveBeenCalledTimes(2);` devient `expect(publishPropertyAction).toHaveBeenCalledTimes(2);` ;
  - `expect(updatePropertyVisibilityAction).not.toHaveBeenCalled();` devient `expect(publishPropertyAction).not.toHaveBeenCalled();`.

**Step 4 : lancer les tests, constater le vert**

Run : `npx vitest run src/components/contact/__tests__/ src/components/property-form/__tests__/`
Expected : PASS. `PropertyWizard.test.tsx`, `wizard-steps.test.tsx`, `abonnement-des-etapes.test.tsx` et `cibles-tactiles.test.tsx` restent verts.

**Step 5 : ablation** (`CoordonneesPublication.tsx`, tenu par C seul ; **pas** `PropertyWizard.tsx`, co-tenu)

```bash
F=src/components/contact/CoordonneesPublication.tsx
cp "$F" "$ABL/t14.tsx"; md5 -q "$F" > "$ABL/t14.md5"
```

Par Edit, remplacer `const montrerCgu = !user?.terms_accepted_at;` par `const montrerCgu = false;`.

Run : `npx vitest run src/components/contact/__tests__/CoordonneesPublication.test.tsx src/components/property-form/__tests__/PropertyWizard.publication.tck-633.test.tsx`
Expected : FAIL. `Unable to find an element by: [data-testid="phrase-cgu"]` dans les deux fichiers.

```bash
cp "$ABL/t14.tsx" "$F"; test "$(md5 -q "$F")" = "$(cat "$ABL/t14.md5")" && echo RESTAURE
```

**Step 6 : signaler les fichiers à commiter.**

---

## Task 15 : vérifications finales et rapport

**Step 1 : formatage et gardes**

```bash
cd "$API" && ./vendor/bin/pint \
  app/Domain/Features/Flag.php app/Events/Auth/PhoneVerified.php app/Events/Onboarding/SpaceCreated.php \
  app/Services/Onboarding/HostIndividualOnboardingService.php app/Services/Auth/PhoneVerificationService.php \
  app/Http/Controllers/HostAutoOnboardController.php app/Http/Requests/Onboarding/HostAutoOnboardRequest.php \
  app/Http/Controllers/Api/Auth/SecondaryPhoneController.php app/Http/Requests/Auth/SecondaryPhoneRequest.php \
  app/Http/Requests/Auth/VerifySecondaryPhoneRequest.php app/Http/Requests/Auth/UpdateProfileRequest.php \
  app/Http/Controllers/Api/Auth/AuthController.php app/Http/Resources/UserResource.php app/Models/User.php \
  app/Models/Property.php app/Models/PropertyContact.php app/Http/Controllers/Api/PropertyContactController.php \
  app/Http/Requests/Api/ReplacePropertyContactsRequest.php app/Services/Property/PropertyContactNumbers.php \
  app/Services/Property/PublishReadiness.php app/Http/Controllers/Api/PropertyController.php \
  app/Http/Controllers/Public/PublicPropertyController.php routes/api/onboarding.php routes/api/auth.php \
  routes/api/properties.php database/migrations/2026_10_12_300*.php lang/*/onboarding.php lang/*/errors.php \
  tests/Support/PubliePret.php tests/Feature/Onboarding tests/Feature/Auth/ContactPreferencesTest.php \
  tests/Feature/Auth/Phone/SecondaryPhoneTest.php tests/Feature/Auth/Phone/PhoneVerifiedEventTest.php \
  tests/Feature/Property/PropertyContactsTest.php tests/Feature/Public/PublicContactEndpointTest.php \
  tests/Feature/Api/PublishReadinessTest.php tests/Feature/Api/Admin/FeatureFlagTest.php
```

Expected : `PASS` ou `FIXED`, sans erreur. Si Pint reformate un fichier co-tenu, la session le saura par le rapport.

```bash
cd "$WEB" && npx tsc --noEmit && npm run lint && npm run check:i18n && npm run check:i18n-namespaces
```

Expected : 0 erreur partout. `check:i18n-namespaces` doit rester vert : C n'utilise que des espaces déjà servis par chaque frontière (`publishRedirect` sous `publish`, `profile` et `property` sous `(dashboard)/app`, `property` sous `[locale]/(public)`). En cas de rouge, **ne pas** lancer `--update` sans l'inscrire au rapport.

```bash
cd /Users/aminethiam/Documents/perso/takussan && for g in scripts/check-*.mjs; do node "$g" >/dev/null 2>&1 || echo "✗ $g"; done
```

Expected : seul `✗ scripts/check-models-spec.mjs` est attendu (`PropertyContact` absent de `docs/models-spec.md`, document que seule l'intégration écrit, E8). Tout autre rouge se corrige ou va au rapport.

**Step 2 : tests impactés**

Run : `cd "$API" && php bin/impacted-tests.php --run`
Expected : vert. Un test qui publie sans `rendrePubliable` se corrige comme à la tâche 8, jamais en affaiblissant la règle.

Run : `cd "$WEB" && npx vitest run src/app/publish src/components/contact src/components/profile src/components/property-form "src/app/[locale]/(public)/properties/[slug]/components" src/hooks/__tests__/usePublishIntent.test.ts`
Expected : PASS.

**Step 3 : écrire le rapport** `docs/plans/rapports/tck-633-lot-c.json` (outil Write), le verdict en premier :

```json
{
  "verdict": "PRET | PRET_AVEC_RESERVES | BLOQUE",
  "fichiers": { "crees": [], "modifies": [] },
  "tests": { "api": [], "web": [], "commandes": [] },
  "ablations": [
    { "tache": 1, "fichier": "", "mutation": "", "rouge_observe": "", "md5_restaure": true }
  ],
  "ecarts_au_ticket": [],
  "collisions": []
}
```

Remplir chaque tableau à partir de ce qui a été **exécuté** (sortie relevée), jamais à partir de ce plan. Inscrire dans `collisions` :
- la ligne `has_whatsapp` de `PropertyResource` (tâche 7, Step 6), avec son code ;
- les étapes **[EXT]** si la session les a refusées ;
- toute reformulation par Pint d'un fichier co-tenu.

**Step 4 : message final**, une ligne : `plan exécuté : docs/plans/rapports/tck-633-lot-c.json, verdict <…>`.

---

## Écarts relevés

**E1. `/api/me` n'existe pas : c'est `GET /api/auth/me`.**
- `AuthController::me` rend `UserResource`, que `AgencyController` (L190, L263) et `MeController` (L73) servent aussi.
- Les cinq champs de l'interface C → tous ne sortent donc que **pour soi** (`mergeWhen`) ; le type front les déclare optionnels, et non `phone_whatsapp: boolean` comme l'écrit le plan maître.
- `UserResource.php` n'est dans aucun territoire, mais l'interface due par C l'exige : c'est l'extension **[EXT]** à confirmer.

**E2. `AuthController::updateProfile` est hors territoire, mais le ticket exige « les cases WhatsApp passent par `PUT /api/auth/profile` ».**
- `UpdateProfileRequest` seule ne suffit pas : le contrôleur fait `$request->only(['first_name','last_name','bio'])`.
- Une insertion de sept lignes, marquée **[EXT]**.

**E3. `PropertyResource` est hors territoire.**
- `primary_contact.has_whatsapp` y est nécessaire pour masquer le bouton WhatsApp (contrainte du ticket).
- C pose la règle (`PropertyContactNumbers::hasWhatsApp`), charge `contacts` dans `show()`, et livre la ligne exacte en collision.
- Tant qu'elle n'est pas appliquée, `has_whatsapp` est absent, donc le bouton WhatsApp est **masqué partout** : c'est le repli sûr, mais AC8 reste incomplet jusqu'à l'intégration.

**E4. La clé d'erreur est `property.publish_contact_incomplete` (code du ticket), sous `property`, et non sous `publish`.**
- Le plan maître annonce `publish` et `onboarding` pour C dans `errors.php`.
- Les erreurs du second numéro forment un **nouveau** groupe `secondary_phone`.
- Les deux groupes sont touchés par C seul.

**E5. Le namespace front `publish.*` n'existe pas.**
- La frontière `/publish` sert `publishRedirect` : C écrit sous `publishRedirect.auto.*`.
- Ce choix évite de régénérer `src/i18n/namespaces.json`.

**E6. `FeatureFlagTest` est cassé par le drapeau et par la ligne insérée par la migration.**
- Le lot A ajoute aussi un drapeau.
- Le plan réécrit les deux assertions de façon tolérante au nombre d'entrées.
- **À coordonner avec A** : un seul des deux lots doit éditer ce test, ou A doit rejouer l'édition après C.

**E7. Quatre chemins gardés au lieu de deux.**
- Le ticket nomme `publish` et la mise en public par visibilité.
- `store` (corps `visibility: public`) et `update` (corps `visibility: public`) publiaient aussi sans passer par eux : ils sont gardés, sinon l'AC « par l'API, pas seulement l'écran » serait contournable.
- `PUT …/status` (`available`) ne touche pas la visibilité : il n'est pas gardé.

**E8. `scripts/check-models-spec.mjs` reste rouge jusqu'à l'intégration.**
- Le nouveau modèle `PropertyContact` doit être nommé dans `docs/models-spec.md`, que seule l'étape d'intégration écrit (règle 5 du plan maître).
- La garde borne les noms strictement : `PropertyContactLead` ne la satisfait pas.

**E9. Le second numéro « refusé s'il est vérifié ailleurs » se refuse sans le dire.**
- À l'envoi, la réponse est neutre, sans SMS, comme `PhoneVerificationController::neutralSend` (vérification adverse m4, décision du porteur) ; la vérification ne peut alors pas aboutir.
- Le 409 `secondary_phone.taken` ne sort que pour un numéro pris **entre** l'envoi et la vérification.

**E10. L'unicité croisée est à sens unique.**
- Le second numéro est jugé contre les principaux **et** les seconds vérifiés de tous les comptes.
- `markVerified` (le principal), lui, reste jugé contre les seuls principaux : vérifier en principal un numéro qui est le second vérifié d'un autre compte reste possible.
- C'est aussi ce que fait l'entrée par téléphone : `test_le_second_numero_n_ouvre_pas_le_compte` crée un **compte neuf** sur ce numéro. Le compte qui porte le second numéro n'est pas ouvert (AC8 tenu), mais le numéro devient le principal d'un autre compte.
- À trancher par le porteur : faut-il étendre `isVerifiedElsewhere` aux seconds numéros ?

**E11. La version des CGU est écrite deux fois.**
- `PublishReadiness::TERMS_VERSION = '2026-09-17'` côté API, et `VERSION_DOCUMENTS.date` (« 17 septembre 2026 ») dans `src/content/legal/editeur.ts`.
- Rien ne garde leur égalité. Une acceptation enregistrée ne se redemande pas quand la version change : hors périmètre, à noter.

**E12. La phrase des CGU n'est pas *sous* le bouton Publier.**
- `WizardShell` n'a pas d'emplacement sous la barre de navigation : la phrase est en fin d'étape Finition, juste au-dessus.
- Les boutons Publier de la liste et de l'en-tête (`PropertyRowActions`, `PropertyHeaderActions`, hors territoire) n'affichent ni la phrase ni le bloc. Un compte sans CGU enregistrées y reçoit le 422 et son message, sans formulaire.
- À arbitrer : afficher le bloc dans une boîte de dialogue depuis ces deux surfaces.

**E13. La règle vaut aussi pour les agences.**
- Un agent principal au numéro non vérifié bloque la publication de ses biens, même par un administrateur : `contact_is_self: false`, et l'écran le dit.
- Le super-admin n'est pas exempté.

**E14. `UserFactory` est hors territoire.**
- Pas d'état `readyToPublish` : un trait de test neuf, `Tests\Support\PubliePret::rendrePubliable()`, en tient lieu.

**E15. `lib/auth.ts`, `app/actions/auth.ts` et `app/actions/dashboard-properties.ts` sont hors territoire : ils ne sont pas touchés.**
- Des actions neuves les contournent : `contact-preferences`, `publish-property`, `property-contacts`.
- `updatePropertyVisibilityAction` reste en place pour les autres appelants. Le wizard publie désormais par `POST …/publish`, qui seul porte `accept_terms`.

**E16. `PropertyWizard.test.tsx` est co-touché avec D.**
- Le plan y remplace cinq références à `updatePropertyVisibilityAction` par `publishPropertyAction`, et ajoute deux mocks.
- Les nouveaux cas vivent dans un fichier à part pour limiter le co-tenu.

**E17. `HostOnboardingController.php` est hors territoire.**
- La pose du cookie y est dupliquée dans `HostAutoOnboardController` au lieu d'être extraite.
- `SpaceCreated` part du **service** (dans le territoire), pas du contrôleur.

**E18. Proposition du bailleur.**
- Le parcours de proposition (`proposition = true`) ne montre ni contacts sur place ni bloc de coordonnées : il ne publie pas, et `PUT …/contacts` exigerait `update` sur un bien que l'agence relira.

**E19. Préfixe des migrations `2026_10_12_300xxx`.**
- Le plan maître n'en fixe aucun. Les autres lots doivent éviter cette plage.
