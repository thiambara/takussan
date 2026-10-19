<?php

namespace Tests\Feature\Onboarding;

use App\Domain\Features\Flag;
use App\Events\Onboarding\SpaceCreated;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\FeatureFlag;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-633 (lot C, AC4) — « Publier » crée l'espace individuel sans question, derrière le drapeau
 * `host_auto_space`, allumé par sa migration de données.
 */
class HostAutoOnboardTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_le_drapeau_est_allume_par_sa_migration(): void
    {
        $ligne = FeatureFlag::query()->where('key', Flag::HostAutoSpace->value)->first();

        $this->assertNotNull($ligne);
        $this->assertTrue((bool) $ligne->enabled);
        $this->assertNull($ligne->segments_json);
    }

    /**
     * Vérification adverse du lot C — `up()` ne pose rien sur une ligne existante
     * (`insertOrIgnore`) ; `down()` ne doit donc retirer que la ligne que la migration a posée et
     * que personne n'a touchée depuis. Une ligne écrite par la console porte `updated_by_id`.
     */
    public function test_le_retour_arriere_ne_retire_pas_une_ligne_d_operateur(): void
    {
        $migration = require database_path('migrations/2026_10_12_300000_enable_host_auto_space_flag.php');
        $operateur = User::factory()->create();
        FeatureFlag::query()->where('key', Flag::HostAutoSpace->value)
            ->update(['enabled' => false, 'segments_json' => [], 'updated_by_id' => $operateur->id]);

        $migration->down();

        $ligne = FeatureFlag::query()->where('key', Flag::HostAutoSpace->value)->first();
        $this->assertNotNull($ligne);
        $this->assertFalse((bool) $ligne->enabled);
    }

    public function test_le_retour_arriere_retire_la_ligne_de_la_migration(): void
    {
        $migration = require database_path('migrations/2026_10_12_300000_enable_host_auto_space_flag.php');
        // Correction du lot C, tour 2 — un AUTRE drapeau, jamais touché par la console (pas
        // d'`updated_by_id`, comme ceux qu'une migration de données pose) : `down()` ne retire que
        // SA clé. Sans cette ligne, un `down()` sans filtre sur `key` restait vert.
        DB::table('feature_flags')->insert([
            'key' => 'drapeau_voisin_tck633', 'label' => 'drapeau_voisin_tck633', 'enabled' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $migration->down();

        $this->assertFalse(FeatureFlag::query()->where('key', Flag::HostAutoSpace->value)->exists());
        $this->assertTrue(DB::table('feature_flags')->where('key', 'drapeau_voisin_tck633')->exists());
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
        // TCK-966 (P47.07) — ni ville, ni type de bien, ni source : rien ne les lit dans `settings`.
        foreach (['primary_city', 'primary_property_type', 'onboarding_source'] as $cle) {
            $this->assertNull(data_get($agency->settings, $cle), $cle);
        }

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

    /** Un espace créé par l'assistant est aussi « le sien » : aucun second espace. */
    public function test_l_espace_de_l_assistant_est_rendu_sans_doublon(): void
    {
        $user = User::factory()->create(['first_name' => 'Awa']);
        $sienne = Agency::factory()->create(['kind' => AgencyKind::Individual, 'primary_admin_id' => $user->id]);
        Sanctum::actingAs($user);

        $this->postJson(self::ROUTE)->assertOk()->assertJsonPath('data.agency.id', $sienne->id);
        $this->assertSame(1, Agency::query()->count());
    }

    /**
     * Vérification adverse du lot C — deux « Publier » simultanés ne font qu'un espace parce que la
     * ligne du compte est verrouillée AVANT de chercher l'espace existant : le second appel attend
     * le premier, puis relit (READ COMMITTED) et trouve l'espace. Deux connexions concurrentes ne
     * se rejouent pas sous `RefreshDatabase` (la seconde ne voit pas le compte, non validé) : on
     * épingle donc la requête qui sérialise, et son rang. Retirer `lockForUpdate()`, ou le poser
     * après la recherche, rougit ici.
     */
    public function test_la_ligne_du_compte_est_verrouillee_avant_de_chercher_l_espace(): void
    {
        $user = User::factory()->create(['first_name' => 'Awa']);
        Sanctum::actingAs($user);

        DB::enableQueryLog();
        $this->postJson(self::ROUTE)->assertCreated();
        $requetes = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        $verrou = null;
        $recherche = null;
        foreach ($requetes as $rang => $sql) {
            if ($verrou === null && preg_match('/from "users" where "users"\."id" = \? .*for update$/i', $sql) === 1) {
                $verrou = $rang;
            }
            if ($recherche === null && preg_match('/from "agencies" where "primary_admin_id" = \?/i', $sql) === 1) {
                $recherche = $rang;
            }
        }

        $this->assertNotNull($verrou, 'aucun SELECT … FOR UPDATE sur la ligne du compte');
        $this->assertNotNull($recherche, "la recherche de l'espace existant n'a pas été vue");
        $this->assertLessThan($recherche, $verrou, "le verrou doit précéder la recherche de l'espace");
    }

    /** TCK-966 (P47.07) — plus de ville par défaut écrite dans `settings` : rien ne la lisait. */
    public function test_prenom_absent_mon_espace_et_aucune_ville_enregistree(): void
    {
        $user = User::factory()->create();
        $user->forceFill(['first_name' => ''])->save();
        Sanctum::actingAs($user);

        $id = $this->postJson(self::ROUTE, [])->assertCreated()
            ->assertJsonPath('data.agency.name', 'Mon espace')
            ->json('data.agency.id');

        $this->assertNull(data_get(Agency::query()->findOrFail($id)->settings, 'primary_city'));
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
}
