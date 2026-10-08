<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC18c : le carnet de l'agence ne liste par défaut que les collaborations `active`.
 *
 * `scopeForAgency()` ne regardait pas le statut : un prestataire dont la collaboration avait pris fin
 * restait proposé, et l'assignation le refuse désormais (AC3). Le filtre explicite le rend.
 */
class ServiceProviderDirectoryFilterTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_default_lists_active_only_and_the_filter_returns_ended(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $active = $this->profileOf($this->providerFor($agency));
        $ended = $this->profileOf($this->providerFor($agency, CollaborationStatus::Ended));
        $paused = $this->profileOf($this->providerFor($agency, CollaborationStatus::Paused));

        Sanctum::actingAs($admin);

        $this->assertSame([$active], $this->ids("/api/agencies/{$agency->id}/service-providers"));
        $this->assertSame([$ended], $this->ids("/api/agencies/{$agency->id}/service-providers?filter[collaboration_status]=ended"));
        $this->assertEqualsCanonicalizing(
            [$active, $paused],
            $this->ids("/api/agencies/{$agency->id}/service-providers?filter[collaboration_status]=active,paused"),
        );
    }

    public function test_specialty_and_zone_filters(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $plumber = $this->profileOf($this->providerFor($agency));
        $electrician = $this->providerFor($agency);
        ServiceProviderProfile::query()->where('user_id', $electrician->id)
            ->update(['specialties' => json_encode(['electrical']), 'service_areas' => json_encode(['Thiès'])]);

        Sanctum::actingAs($admin);

        $this->assertSame([$plumber], $this->ids("/api/agencies/{$agency->id}/service-providers?filter[specialty]=plumbing"));
        $this->assertSame([$this->profileOf($electrician)], $this->ids("/api/agencies/{$agency->id}/service-providers?filter[zone]=Thiès"));
    }

    /** Qui assigne choisit dans le carnet : un agent de l'agence le lit, un inconnu non. */
    public function test_agent_reads_the_directory_and_a_stranger_does_not(): void
    {
        [$agency] = $this->agencyWithAdmin();
        $this->providerFor($agency);

        Sanctum::actingAs($this->agentOf($agency));
        $this->getJson("/api/agencies/{$agency->id}/service-providers")->assertOk();

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/agencies/{$agency->id}/service-providers")->assertForbidden();
    }

    /** @return list<int> */
    private function ids(string $url): array
    {
        return collect($this->getJson($url)->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
    }

    private function profileOf(User $user): int
    {
        return (int) ServiceProviderProfile::query()->where('user_id', $user->id)->value('id');
    }

    /** @return array{Agency, User} */
    private function agencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        return [$agency, $admin];
    }
}
