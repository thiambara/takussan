<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2917 (ADR-0118 § 4) — « 1 créneau dépassé » par prestataire, dans le carnet et les suggestions
 * (même file `en_retard` que `MaintenanceQueue`, chez l'agence du carnet), en un nombre de requêtes
 * constant ; et les pastilles de métier du carnet (`meta.trade_counts`).
 */
class ServiceProviderOverdueSlotsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    public function test_ac4_un_creneau_passe_de_deux_jours_sans_cloture_compte_dans_le_carnet_et_les_suggestions(): void
    {
        $user = $this->providerFor($this->agency);
        $profile = ServiceProviderProfile::query()->where('user_id', $user->id)->firstOrFail();
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $elsewhere = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $make = fn (Property $p, MaintenanceStatus $status, $scheduledAt) => MaintenanceRequest::factory()->create([
            'property_id' => $p->id, 'assigned_to' => $user->id, 'status' => $status, 'scheduled_at' => $scheduledAt,
        ]);

        $make($property, MaintenanceStatus::InProgress, now()->subDays(2));      // compte
        $make($property, MaintenanceStatus::Completed, now()->subDays(2));       // rendu : non
        $make($property, MaintenanceStatus::Cancelled, now()->subDays(5));       // annulé : non
        $make($property, MaintenanceStatus::Approved, now()->addDays(2));        // à venir : non
        $make($property, MaintenanceStatus::QuoteRequested, now()->subDays(3));  // file en_cours : non
        $make($elsewhere, MaintenanceStatus::InProgress, now()->subDays(2));     // autre agence : non

        Sanctum::actingAs($this->admin);
        $row = collect($this->getJson("/api/agencies/{$this->agency->id}/service-providers")->assertOk()->json('data'))
            ->firstWhere('id', $profile->id);
        $this->assertSame(1, $row['overdue_slots_count']);

        $open = MaintenanceRequest::factory()->create([
            'property_id' => $property->id, 'assigned_to' => null, 'status' => MaintenanceStatus::Open,
            'category' => MaintenanceCategory::Plumbing,
        ]);
        $suggestion = collect($this->getJson("/api/maintenance-requests/{$open->id}/suggested-providers")->assertOk()->json('data'))
            ->firstWhere('id', $profile->id);
        $this->assertSame(1, $suggestion['overdue_slots_count']);
    }

    public function test_le_nombre_de_requetes_du_carnet_ne_depend_pas_du_nombre_de_prestataires(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $withOverdue = function () use ($property): void {
            $user = $this->providerFor($this->agency);
            MaintenanceRequest::factory()->create([
                'property_id' => $property->id, 'assigned_to' => $user->id,
                'status' => MaintenanceStatus::InProgress, 'scheduled_at' => now()->subDays(3),
            ]);
        };
        $count = function (): int {
            Sanctum::actingAs($this->admin);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson("/api/agencies/{$this->agency->id}/service-providers")->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $withOverdue();
        $few = $count();
        foreach (range(1, 5) as $_) {
            $withOverdue();
        }

        $this->assertSame($few, $count());
    }

    /** Chaque pastille égale le total que rend le filtre du même métier. */
    public function test_les_comptes_par_metier_egalent_le_filtre_du_metier(): void
    {
        $set = function (array $trades): void {
            $user = $this->providerFor($this->agency);
            ServiceProviderProfile::query()->where('user_id', $user->id)->update(['specialties' => json_encode($trades)]);
        };
        $set(['plumbing']);
        $set(['plumbing', 'electrical']);
        $set(['electrical', 'electrical']);
        $set([]);

        Sanctum::actingAs($this->admin);
        $counts = $this->getJson("/api/agencies/{$this->agency->id}/service-providers?filter[search]=zzz")->assertOk()->json('meta.trade_counts');
        $this->assertSame(['electrical' => 2, 'plumbing' => 2], $counts);

        foreach ($counts as $trade => $n) {
            $this->assertSame($n, $this->getJson("/api/agencies/{$this->agency->id}/service-providers?filter[specialty]={$trade}")->assertOk()->json('meta.total'), $trade);
        }
    }
}
