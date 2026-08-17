<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-279 — `GET /api/me/capabilities`.
 *
 * L'endroit où le front apprend ce qu'il peut PROPOSER. Il ne décide rien :
 * les policies restent seules juges, et ces tests le vérifient aussi.
 */
class MeCapabilitiesTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_requires_authentication(): void
    {
        $this->getJson('/api/me/capabilities')->assertUnauthorized();
    }

    public function test_an_agency_admin_gets_the_capabilities_of_its_agency(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $body = $this->getJson("/api/me/capabilities?agency_id={$agency->id}")
            ->assertOk()
            ->json('data');

        $this->assertSame($agency->id, $body['agency_id']);
        $this->assertContains(Capability::TeamAssignRole->value, $body['capabilities']);
        $this->assertContains(Capability::PropertiesCreate->value, $body['capabilities']);
    }

    /**
     * Les deux capacités réservées à la plateforme ne sortent JAMAIS d'un
     * profil d'agence — c'est le même invariant que garde
     * `Capability::platformReserved()` à l'écriture.
     */
    public function test_platform_reserved_capabilities_are_never_granted_to_an_agency_profile(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $caps = $this->getJson("/api/me/capabilities?agency_id={$agency->id}")
            ->assertOk()->json('data.capabilities');

        foreach (Capability::platformReserved() as $reserved) {
            $this->assertNotContains($reserved->value, $caps);
        }
    }

    public function test_an_owner_gets_a_much_narrower_set_than_an_admin(): void
    {
        $agency = Agency::factory()->create();

        $owner = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        Sanctum::actingAs($owner);
        $ownerCaps = $this->getJson("/api/me/capabilities?agency_id={$agency->id}")
            ->assertOk()->json('data.capabilities');

        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        Sanctum::actingAs($admin);
        $adminCaps = $this->getJson("/api/me/capabilities?agency_id={$agency->id}")
            ->assertOk()->json('data.capabilities');

        $this->assertLessThan(count($adminCaps), count($ownerCaps));
        $this->assertContains(Capability::PropertiesUpdateOwn->value, $ownerCaps);
        $this->assertNotContains(Capability::TeamAssignRole->value, $ownerCaps);
    }

    /**
     * ⚠️ Une agence où l'utilisateur n'a AUCUN profil rend une liste vide, et
     * non 403 : répondre 403 apprendrait par le code de statut quelles agences
     * existent. La réponse dit la vérité — « aucune capacité ici ».
     */
    public function test_an_agency_the_user_does_not_belong_to_yields_nothing_rather_than_403(): void
    {
        $mine = Agency::factory()->create();
        $other = Agency::factory()->create();
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $mine->id]);
        Sanctum::actingAs($user);

        $body = $this->getJson("/api/me/capabilities?agency_id={$other->id}")
            ->assertOk()->json('data');

        $this->assertNull($body['agency_id']);
        $this->assertSame([], $body['capabilities']);
    }

    /**
     * La réponse est un MIROIR du résolveur, pas une seconde table de vérité.
     * Si les deux divergeaient, le front proposerait des gestes que l'API
     * refuse — ou cacherait des gestes permis.
     */
    public function test_the_response_agrees_with_the_resolver_capability_by_capability(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $caps = $this->getJson("/api/me/capabilities?agency_id={$agency->id}")
            ->assertOk()->json('data.capabilities');

        $user->refresh();
        foreach (Capability::cases() as $capability) {
            $this->assertSame(
                $user->canActAt($capability, $agency),
                in_array($capability->value, $caps, true),
                "désaccord sur {$capability->value}",
            );
        }
    }
}
