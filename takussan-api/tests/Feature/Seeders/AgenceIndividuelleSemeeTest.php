<?php

namespace Tests\Feature\Seeders;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Property;
use Database\Seeders\Catalog\PropertyCollaboratorSeeder;
use Database\Seeders\Catalog\PropertySeeder;
use Database\Seeders\Core\AgencySeeder;
use Database\Seeders\Core\UserSeeder;
use Database\Seeders\Support\DemoUsersSeeder;
use Database\Seeders\Support\EdgeCaseSeeder;
use Database\Seeders\Support\FilterCoverageSeeder;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\System\TagSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2776 — l'hôte d'une agence `individual` est le bailleur de chacun de ses biens, comme
 * `HostIndividualOnboardingService` l'écrit pour un hôte réel. Mesuré le 2026-11-14 sur la démo :
 * l'agence 4 « Studio de Aminata » avait trois bailleurs (owner1, owner2 et le bailleur de démo),
 * 82 biens à eux, et 0 `OwnerProfile` pour son admin — dont l'accueil affichait « Biens 0 ».
 */
class AgenceIndividuelleSemeeTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_hote_d_une_agence_individuelle_est_le_seul_bailleur_de_ses_biens(): void
    {
        app()->instance(SeedingContext::class, new SeedingContext(new SeedingConfig(
            agencies: 4,
            propertiesPerAgency: 12,
            includeEdgeCases: true,
            ensureReferentialIntegrity: false,
            includeFilterCoverage: true,
            includeDemoUsers: true,
            downloadMedia: false,
        )));
        config(['scout.driver' => null]);

        foreach ([
            TagSeeder::class, AgencySeeder::class, UserSeeder::class, DemoUsersSeeder::class,
            PropertySeeder::class, PropertyCollaboratorSeeder::class, FilterCoverageSeeder::class, EdgeCaseSeeder::class,
        ] as $classe) {
            app($classe)->run();
        }

        $individuelles = Agency::query()->where('kind', AgencyKind::Individual)->get();
        $this->assertNotEmpty($individuelles, 'non-vacuité : une agence individual');

        foreach ($individuelles as $agence) {
            $hote = (int) $agence->primary_admin_id;

            $this->assertTrue(AgencyAdminProfile::query()->where('agency_id', $agence->id)->where('user_id', $hote)->exists());
            $this->assertSame(
                [$hote],
                OwnerProfile::query()->where('agency_id', $agence->id)->pluck('user_id')->map(fn ($id) => (int) $id)->all(),
                "agence {$agence->slug} : un seul OwnerProfile, celui de l'hôte",
            );
            $this->assertTrue(OwnerProfile::query()->where('agency_id', $agence->id)->where('user_id', $hote)->where('status', OwnerProfileStatus::Active->value)->exists(), 'OwnerProfile actif');

            $biens = Property::query()->where('agency_id', $agence->id);
            $this->assertGreaterThan(0, (clone $biens)->count(), "non-vacuité : des biens dans {$agence->slug}");
            $this->assertSame(0, (clone $biens)->where('user_id', '!=', $hote)->count(), "agence {$agence->slug} : chaque bien est à l'hôte");

            // Les prestataires restent : l'invitation d'un prestataire est ouverte à l'agence `individual`.
            $this->assertGreaterThan(0, ServiceProviderAgencyCollaboration::query()->where('agency_id', $agence->id)->count());
        }

        // AC4 — une agence `standard` garde plusieurs bailleurs, et l'admin n'en est pas un.
        foreach (Agency::query()->where('kind', AgencyKind::Standard)->get() as $agence) {
            $bailleurs = OwnerProfile::query()->where('agency_id', $agence->id)->pluck('user_id')->map(fn ($id) => (int) $id);
            $this->assertGreaterThanOrEqual(2, $bailleurs->count(), "agence {$agence->slug}");
            $this->assertNotContains((int) $agence->primary_admin_id, $bailleurs->all());
        }
    }
}
