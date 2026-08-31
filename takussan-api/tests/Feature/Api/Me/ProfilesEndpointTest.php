<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProfilesEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_me_profiles_lists_all_user_profiles(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();

        $owner = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        $agent = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);
        BrokerProfile::factory()->create(['user_id' => $user->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/me/profiles')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->sort()->values()->all();
        $expected = collect([
            "owner:{$owner->id}",
            "agent:{$agent->id}",
            'broker:'.$user->brokerProfile->id,
        ])->sort()->values()->all();

        $this->assertSame($expected, $ids);
        $this->assertSame(3, $response->json('meta.count'));
    }

    public function test_get_me_profiles_never_leaks_other_users_profiles(): void
    {
        $me = User::factory()->create();
        $someone_else = User::factory()->create();
        $agency = Agency::factory()->create();

        OwnerProfile::factory()->create(['user_id' => $me->id, 'agency_id' => $agency->id]);
        OwnerProfile::factory()->create(['user_id' => $someone_else->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($me);

        $response = $this->getJson('/api/me/profiles')->assertOk();

        $userIds = collect($response->json('data'))
            ->pluck('numeric_id')
            ->all();

        $this->assertCount(1, $userIds);
        $this->assertSame(1, $response->json('meta.count'));
    }

    public function test_get_me_profiles_requires_authentication(): void
    {
        $this->getJson('/api/me/profiles')->assertStatus(401);
    }

    public function test_meta_active_profile_id_reflects_resolved_profile_for_single_profile_user(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        $profile = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($user);

        $this->getJson('/api/me/profiles')
            ->assertOk()
            ->assertJsonPath('meta.active_profile_id', "agent:{$profile->id}");
    }

    public function test_index_filters_out_inactive_profiles(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();

        $active = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $a->id,
            'status' => OwnerProfileStatus::Active,
        ]);
        OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $b->id,
            'status' => OwnerProfileStatus::Blocked,
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/me/profiles')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertSame(["owner:{$active->id}"], $ids);
        $this->assertSame(1, $response->json('meta.count'));
    }

    public function test_resource_exposes_composite_id_type_and_agency(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create(['name' => 'Acme']);
        $profile = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($user);

        $this->getJson('/api/me/profiles')
            ->assertOk()
            ->assertJsonPath('data.0.id', "owner:{$profile->id}")
            ->assertJsonPath('data.0.type', 'owner')
            ->assertJsonPath('data.0.numeric_id', $profile->id)
            ->assertJsonPath('data.0.agency.id', $agency->id)
            ->assertJsonPath('data.0.agency.name', 'Acme');
    }

    /**
     * TCK-497 — deux profils d'une MÊME agence restent tous deux listés, et la
     * charge utile porte enfin de quoi les séparer.
     *
     * C'est la situation que l'assistant hôte fabrique à chaque passage :
     * `AgencyAdminProfile` + `OwnerProfile` dans une agence `individual`. Le
     * sélecteur affichait deux lignes rigoureusement identiques — même nom, même
     * slug, jusqu'au rang de collision `-3` — parce que rien dans la réponse ne
     * permettait de les distinguer autrement que par leur `type`.
     */
    public function test_deux_profils_dune_meme_agence_portent_la_nature_de_l_agence(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create([
            'name' => 'Espace de Awa Diop',
            'kind' => AgencyKind::Individual,
        ]);
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $reponse = $this->actingAs($user)->getJson('/api/me/profiles')->assertOk();

        // AC5 — le changement est de PRÉSENTATION : le contrat continue de
        // lister les deux profils, et chacun reste commutable.
        $this->assertCount(2, $reponse->json('data'));

        foreach ($reponse->json('data') as $profil) {
            $this->assertSame($agency->id, $profil['agency']['id']);
            $this->assertSame('individual', $profil['agency']['kind']);
        }
    }

    public function test_une_agence_standard_se_declare_comme_telle(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->actingAs($user)
            ->getJson('/api/me/profiles')
            ->assertOk()
            ->assertJsonPath('data.0.agency.kind', 'standard');
    }
}
