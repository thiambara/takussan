<?php

namespace Tests\Feature\Maintenance;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2652 — `GET /api/maintenance-requests/{id}/suggested-providers` : au plus trois prestataires du
 * carnet de l'agence, par la règle écrite dans `SuggestedProvidersController` — métier = catégorie
 * (filtre), zone qui nomme le quartier ou la ville du bien, note moyenne, interventions réalisées.
 */
class SuggestedProvidersTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private MaintenanceRequest $mr;

    private User $admin;

    private User $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        ['agency' => $this->agency, 'property' => $this->property, 'mr' => $this->mr, 'tenant' => $this->tenant]
            = $this->maintenanceScenario(MaintenanceStatus::Open, ['assigned_to' => null, 'category' => MaintenanceCategory::Plumbing]);
        // Le prestataire du scénario ne doit pas compter : retiré du carnet.
        ServiceProviderProfile::query()->update(['status' => ServiceProviderProfileStatus::Suspended->value]);

        Address::factory()->create([
            'addressable_type' => $this->property->getMorphClass(), 'addressable_id' => $this->property->id,
            'neighborhood' => 'Médina', 'city' => 'Dakar',
        ]);
        $this->admin = User::factory()->create(['phone' => null]);
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    /**
     * @param  list<string>  $trades
     * @param  list<string>  $zones
     */
    private function provider(array $trades, array $zones, ?int $rating = null, int $completed = 0, ?Agency $agency = null, CollaborationStatus $collaboration = CollaborationStatus::Active): ServiceProviderProfile
    {
        $user = $this->providerFor($agency ?? $this->agency, $collaboration);
        $profile = ServiceProviderProfile::query()->where('user_id', $user->id)->firstOrFail();
        $profile->update(['specialties' => $trades, 'service_areas' => $zones]);

        if ($rating !== null) {
            Review::factory()->create([
                'reviewable_type' => ServiceProviderProfile::class, 'reviewable_id' => $profile->id,
                'rating' => $rating, 'status' => ReviewStatus::Approved, 'is_approved' => true,
            ]);
        }
        foreach (range(1, $completed) as $i) {
            if ($completed === 0) {
                break;
            }
            MaintenanceRequest::factory()->create([
                'property_id' => $this->property->id, 'requester_id' => $this->tenant->id,
                'assigned_to' => $user->id, 'status' => $i % 2 === 0 ? MaintenanceStatus::Closed : MaintenanceStatus::Completed,
            ]);
        }

        return $profile;
    }

    public function test_the_rule_filters_the_trade_then_ranks_zone_rating_and_completed_work(): void
    {
        $zoneLow = $this->provider(['plumbing'], ['medina'], rating: 3);
        $zoneHighFew = $this->provider(['plumbing', 'electrical'], ['Plateau', ' DAKAR '], rating: 4);
        $zoneHighMany = $this->provider(['plumbing'], ['Médina'], rating: 4, completed: 2);
        $this->provider(['plumbing'], ['Thiès'], rating: 5);                // hors zone : quatrième
        $this->provider(['electrical'], ['Médina'], rating: 5);             // autre métier
        $this->provider(['plumbing'], ['Médina'], rating: 5, collaboration: CollaborationStatus::Paused);
        $this->provider(['plumbing'], ['Médina'], rating: 5, agency: Agency::factory()->create());

        Sanctum::actingAs($this->admin);
        $data = $this->getJson("/api/maintenance-requests/{$this->mr->id}/suggested-providers")->assertOk()->json('data');

        $this->assertSame([$zoneHighMany->id, $zoneHighFew->id, $zoneLow->id], array_column($data, 'id'));
        $this->assertSame('plumbing', $data[0]['matching_trade']);
        $this->assertSame('Médina', $data[0]['matching_zone']);
        $this->assertSame(' DAKAR ', $data[1]['matching_zone']);
        $this->assertSame(4.0, (float) $data[0]['average_rating']);
        $this->assertSame(2, $data[0]['completed_interventions_count']);
        $this->assertSame(0, $data[1]['completed_interventions_count']);
    }

    /** Sans avis, après les notés ; sans zone, après ceux de la zone ; au plus trois. */
    public function test_unrated_and_out_of_zone_come_last_and_three_at_most(): void
    {
        $outOfZoneRated = $this->provider(['plumbing'], ['Thiès'], rating: 5);
        $inZoneUnrated = $this->provider(['plumbing'], ['Dakar']);
        $inZoneRated = $this->provider(['plumbing'], ['Dakar'], rating: 1);
        $this->provider(['plumbing'], [], completed: 3);

        Sanctum::actingAs($this->admin);
        $data = $this->getJson("/api/maintenance-requests/{$this->mr->id}/suggested-providers")->assertOk()->json('data');

        $this->assertSame([$inZoneRated->id, $inZoneUnrated->id, $outOfZoneRated->id], array_column($data, 'id'));
        $this->assertNull($data[1]['average_rating']);
        $this->assertNull($data[2]['matching_zone']);
    }

    /** Ni le locataire, ni un prestataire, ni le personnel d'une autre agence n'énumèrent le carnet. */
    public function test_only_who_reads_the_agency_directory_gets_suggestions(): void
    {
        $assigned = $this->provider(['plumbing'], ['Dakar']);
        $this->mr->update(['assigned_to' => $assigned->user_id]);

        Sanctum::actingAs($this->tenant);
        $this->getJson("/api/maintenance-requests/{$this->mr->id}/suggested-providers")->assertForbidden();

        Sanctum::actingAs(User::query()->findOrFail($assigned->user_id));
        $this->getJson("/api/maintenance-requests/{$this->mr->id}/suggested-providers")->assertForbidden();

        $stranger = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $stranger->id, 'agency_id' => Agency::factory()->create()->id]);
        Sanctum::actingAs($stranger);
        $this->getJson("/api/maintenance-requests/{$this->mr->id}/suggested-providers")->assertForbidden();
    }
}
