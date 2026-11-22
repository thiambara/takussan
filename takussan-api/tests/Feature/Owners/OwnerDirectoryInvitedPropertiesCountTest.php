<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2906 — le carnet des bailleurs (`GET /api/owners`) compte les biens d'un bailleur INVITÉ (profil sans
 * compte) comme le filtre `filter[owner_profile_id]` de la liste des biens les lui rend (TCK-2905) : ceux
 * saisis pour son profil (`pending_owner_profile_id`). Il valait 0 bien, et la somme de tête les oubliait.
 */
class OwnerDirectoryInvitedPropertiesCountTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_le_bailleur_invite_compte_les_biens_saisis_pour_lui_comme_le_filtre_les_rend(): void
    {
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $invite = OwnerProfile::factory()->draft()->create(['agency_id' => $agency->id]);

        $occupe = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agent->id, 'pending_owner_profile_id' => $invite->id]);
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agent->id, 'pending_owner_profile_id' => $invite->id]);
        // Hors compte : archivé, supprimé, et un bien de l'agence saisi pour personne.
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agent->id, 'pending_owner_profile_id' => $invite->id, 'archived_at' => now()]);
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agent->id, 'pending_owner_profile_id' => $invite->id])->delete();
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agent->id]);
        Lease::factory()->create([
            'property_id' => $occupe->id, 'agency_id' => $agency->id, 'landlord_id' => $agent->id,
            'status' => LeaseStatus::Active, 'start_date' => '2026-09-01', 'end_date' => '2027-08-31',
        ]);

        // Un bailleur avec compte, pour la somme de tête.
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $bailleur->id]);

        $reponse = $this->actingAsApi($agent)->getJson('/api/owners?per_page=100')->assertOk();
        $ligne = collect($reponse->json('data'))->firstWhere('id', $invite->id);

        $this->assertNotNull($ligne, 'le profil invité est une ligne du carnet');
        $filtre = $this->actingAsApi($agent)
            ->getJson("/api/properties?filter[owner_profile_id]={$invite->id}&fields[properties]=id&per_page=50")
            ->assertOk()->json('meta.total');
        $this->assertSame(2, $ligne['properties_count']);
        // La liste des biens rend aussi l'archivé ; le carnet ne compte que les biens ni archivés ni supprimés.
        $this->assertSame($filtre - 1, $ligne['properties_count'], 'la ligne compte ce que le filtre rend, l\'archivé excepté');
        $this->assertSame(1, $ligne['occupied_properties_count']);
        $this->assertSame(3, $reponse->json('meta.summary.properties'), 'deux biens de l\'invité, un du bailleur avec compte');
    }
}
