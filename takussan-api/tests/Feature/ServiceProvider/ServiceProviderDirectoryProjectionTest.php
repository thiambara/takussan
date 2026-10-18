<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-904 (P21.06) — le carnet des prestataires ne sort de `metadata` que les sous-clés que le
 * front lit, et jamais `insurance_policy_id`.
 *
 * Le contrôleur rendait la ligne `service_provider_profiles` brute : tout `metadata` (le brouillon
 * d'invitation et ce qu'on y range) et `insurance_policy_id`, même sans les demander. Les lecteurs
 * sont `ServiceProvidersList.tsx` (nom, e-mail, métiers, zones du brouillon) et
 * `MaintenanceAssignmentBlock.tsx` (nom, e-mail, `availability`).
 */
class ServiceProviderDirectoryProjectionTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** `SERVICE_PROVIDER_PROFILE_FIELDS`, `lib/queries/service-providers.ts`. */
    private const FIELDS = 'fields[service_provider_profiles]=id,user_id,status,specialties,service_areas,metadata,created_at';

    private const SOUS_CLES_LUES = ['first_name', 'last_name', 'email', 'trades', 'intervention_zones', 'availability'];

    public function test_le_carnet_ne_sort_que_les_sous_cles_lues_de_metadata(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $profile = $this->profileWithMetadata($agency);

        Sanctum::actingAs($admin);
        $row = $this->getJson("/api/agencies/{$agency->id}/service-providers?".self::FIELDS)
            ->assertOk()->json('data.0');

        $this->assertSame($profile->id, $row['id']);
        $this->assertEqualsCanonicalizing(self::SOUS_CLES_LUES, array_keys($row['metadata']));
        $this->assertSame('awa@example.sn', $row['metadata']['email']);
        $this->assertSame([['day' => 'monday']], $row['metadata']['availability']);
        $this->assertArrayNotHasKey('insurance_policy_id', $row);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/', $row['created_at'], 'ADR-0018');
    }

    public function test_le_numero_de_police_ne_sort_ni_demande_ni_par_defaut(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $this->profileWithMetadata($agency);

        Sanctum::actingAs($admin);
        foreach ([
            "/api/agencies/{$agency->id}/service-providers",
            "/api/agencies/{$agency->id}/service-providers?fields[service_provider_profiles]=id,insurance_policy_id",
        ] as $url) {
            $row = $this->getJson($url)->assertOk()->json('data.0');
            $this->assertArrayNotHasKey('insurance_policy_id', $row, $url);
            $this->assertStringNotContainsString('POL-SECRET', json_encode($row), $url);
        }
    }

    private function profileWithMetadata(Agency $agency): ServiceProviderProfile
    {
        $user = $this->providerFor($agency);
        $profile = ServiceProviderProfile::query()->where('user_id', $user->id)->sole();
        $profile->forceFill([
            'insurance_policy_id' => 'POL-SECRET-42',
            'metadata' => [
                'first_name' => 'Awa',
                'last_name' => 'Diop',
                'email' => 'awa@example.sn',
                'trades' => ['plumbing'],
                'intervention_zones' => ['Dakar'],
                'availability' => [['day' => 'monday']],
                'phone' => '+221770000000',
                'invited_by_note' => 'POL-SECRET interne',
            ],
        ])->save();

        return $profile;
    }

    /** @return array{0: Agency, 1: User} */
    private function agencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        return [$agency, $admin];
    }
}
