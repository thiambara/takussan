<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
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
 * TCK-2652 — le carnet `GET /api/agencies/{agency}/service-providers` rend le téléphone joignable (le
 * compte, sinon le numéro saisi à l'invitation) et `completed_interventions_count`, les interventions
 * réalisées (rendues ou closes) pour CETTE agence — sans requête par ligne.
 */
class ServiceProviderIndexPhoneAndCountTest extends TestCase
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

    /** @return array<int, array<string, mixed>> */
    private function directory(): array
    {
        Sanctum::actingAs($this->admin);

        return collect($this->getJson("/api/agencies/{$this->agency->id}/service-providers")->assertOk()->json('data'))
            ->keyBy('id')->all();
    }

    private function profileOf(User $user): ServiceProviderProfile
    {
        return ServiceProviderProfile::query()->where('user_id', $user->id)->firstOrFail();
    }

    public function test_the_phone_is_the_accounts_else_the_invitations(): void
    {
        $withAccountPhone = $this->profileOf($this->providerFor($this->agency, userAttributes: ['phone' => '+221770000001']));
        $withAccountPhone->update(['metadata' => ['phone' => '+221770000099']]);
        $invitedOnly = $this->profileOf($this->providerFor($this->agency, userAttributes: ['phone' => null]));
        $invitedOnly->update(['metadata' => ['phone' => '+221770000002']]);
        $none = $this->profileOf($this->providerFor($this->agency, userAttributes: ['phone' => null]));

        $rows = $this->directory();

        $this->assertSame('+221770000001', $rows[$withAccountPhone->id]['phone']);
        $this->assertSame('+221770000002', $rows[$invitedOnly->id]['phone']);
        $this->assertNull($rows[$none->id]['phone']);
        $this->assertArrayNotHasKey('account_phone', $rows[$none->id]);
    }

    public function test_completed_interventions_count_only_done_work_for_this_agency(): void
    {
        $user = $this->providerFor($this->agency);
        $profile = $this->profileOf($user);
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $deleted = Property::factory()->create(['agency_id' => $this->agency->id]);
        $elsewhere = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        $make = fn (Property $p, MaintenanceStatus $status, ?int $assignee = null) => MaintenanceRequest::factory()->create([
            'property_id' => $p->id, 'assigned_to' => $assignee ?? $user->id, 'status' => $status,
        ]);
        $make($property, MaintenanceStatus::Completed);
        $make($property, MaintenanceStatus::Closed);
        $make($deleted, MaintenanceStatus::Closed);
        $make($property, MaintenanceStatus::InProgress);
        $make($property, MaintenanceStatus::Cancelled);
        $make($elsewhere, MaintenanceStatus::Closed);
        $make($property, MaintenanceStatus::Closed, $this->providerFor($this->agency)->id);
        $make($property, MaintenanceStatus::Completed)->delete();
        $deleted->delete();

        $this->assertSame(3, $this->directory()[$profile->id]['completed_interventions_count']);
    }

    public function test_the_page_costs_the_same_queries_whatever_its_size(): void
    {
        $this->providerFor($this->agency);
        $count = function (): int {
            Sanctum::actingAs($this->admin);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson("/api/agencies/{$this->agency->id}/service-providers?include=user")->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $few = $count();
        foreach (range(1, 5) as $_) {
            $this->providerFor($this->agency, userAttributes: ['phone' => '+22177'.random_int(1000000, 9999999)]);
        }

        $this->assertSame($few, $count());
    }
}
