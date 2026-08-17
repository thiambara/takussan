<?php

namespace Tests\Unit\Services\Membership;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Membership\AgencyRoleService;
use App\Services\Membership\AgencySystemRoleSeeder;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-315 (ADR-0015) — le rôle d'agence d'un prestataire vit sur la
 * COLLABORATION, donc **un rôle par agence**.
 *
 * Le test central est {@see self::test_provider_with_two_agencies_gets_two_different_verdicts}.
 * C'est lui, et lui seul, qui distingue cette décision de l'état antérieur :
 * avant TCK-315, la branche prestataire du résolveur répondait depuis
 * `SystemRoleCapabilities` pour toute agence où le prestataire collaborait,
 * donc le même verdict partout — un rôle personnalisé n'avait aucun effet.
 */
class ServiceProviderAgencyRoleTest extends TestCase
{
    use RefreshDatabase;

    private MembershipCapabilityResolver $resolver;

    private User $provider;

    private ServiceProviderProfile $profile;

    protected function setUp(): void
    {
        parent::setUp();

        $this->resolver = app(MembershipCapabilityResolver::class);
        $this->provider = User::factory()->create();
        $this->profile = ServiceProviderProfile::factory()->create(['user_id' => $this->provider->id]);
    }

    /**
     * LE test. Un prestataire, deux agences, deux rôles réellement
     * différents — et deux verdicts différents sur LA MÊME capacité.
     *
     * Les deux rôles sont construits en miroir exact : chacun porte ce que
     * l'autre n'a pas. Un test qui n'accorderait qu'à une seule agence
     * pourrait encore passer sur un résolveur qui répond « non » partout.
     */
    public function test_provider_with_two_agencies_gets_two_different_verdicts(): void
    {
        [$agencyA, $roleA] = $this->agencyWithProviderRole([Capability::MaintenanceClose]);
        [$agencyB, $roleB] = $this->agencyWithProviderRole([Capability::MaintenanceAssign]);

        $this->collaborate($agencyA, $roleA);
        $this->collaborate($agencyB, $roleB);

        // Agence A : ferme, n'assigne pas.
        $this->assertTrue(
            $this->resolver->allows($this->provider, Capability::MaintenanceClose, $agencyA),
            'agence A doit accorder maintenance.close',
        );
        $this->assertFalse(
            $this->resolver->allows($this->provider, Capability::MaintenanceAssign, $agencyA),
            'agence A ne doit PAS accorder maintenance.assign — son rôle ne la porte pas',
        );

        // Agence B : assigne, ne ferme pas. Le miroir exact.
        $this->assertTrue(
            $this->resolver->allows($this->provider, Capability::MaintenanceAssign, $agencyB),
            'agence B doit accorder maintenance.assign',
        );
        $this->assertFalse(
            $this->resolver->allows($this->provider, Capability::MaintenanceClose, $agencyB),
            'agence B ne doit PAS accorder maintenance.close — son rôle ne la porte pas',
        );
    }

    /**
     * Le verdict est celui de l'agence DEMANDÉE, pas celui d'une agence où
     * le prestataire collabore par ailleurs (principe non négociable n°2).
     */
    public function test_capability_of_one_agency_does_not_leak_to_a_third(): void
    {
        [$agencyA, $roleA] = $this->agencyWithProviderRole([Capability::MaintenanceClose, Capability::MaintenanceAssign]);
        $this->collaborate($agencyA, $roleA);

        $stranger = Agency::factory()->create();

        $this->assertFalse(
            $this->resolver->allows($this->provider, Capability::MaintenanceClose, $stranger),
            'une agence sans collaboration n\'accorde rien',
        );
    }

    /**
     * Le défaut n'a pas bougé : sans rôle personnalisé, un prestataire garde
     * exactement les capacités du rôle système `service_provider` de son
     * agence — celles-là mêmes que la table de vérité phase 1 accordait.
     * TCK-315 ouvre une capacité, il ne change aucun verdict existant.
     */
    public function test_default_verdict_is_unchanged_without_a_custom_role(): void
    {
        $agency = Agency::factory()->create();
        $this->collaborate($agency, null);

        $this->assertTrue($this->resolver->allows($this->provider, Capability::MaintenanceAssign, $agency));
        $this->assertTrue($this->resolver->allows($this->provider, Capability::MaintenanceClose, $agency));
        $this->assertFalse($this->resolver->allows($this->provider, Capability::LeasesTerminate, $agency));
    }

    /**
     * Règle 6, version prestataire : une collaboration ne peut pas exister
     * sans rôle. L'appelant qui n'en déclare pas reçoit le rôle système de
     * SON agence — sinon il faudrait que chacun des sites de création
     * (invitation, onboarding, seeders, tests) y pense.
     */
    public function test_collaboration_created_without_a_role_gets_the_system_one_of_its_agency(): void
    {
        $agency = Agency::factory()->create();
        $collaboration = $this->collaborate($agency, null);

        $expected = app(AgencySystemRoleSeeder::class)
            ->systemRoleFor((int) $agency->id, AgencyRoleBaseType::ServiceProvider);

        $this->assertNotNull($collaboration->agency_role_id);
        $this->assertSame((int) $expected->id, (int) $collaboration->agency_role_id);
        $this->assertSame((int) $agency->id, (int) $collaboration->agencyRole->agency_id);
    }

    /**
     * Un rôle prestataire encore porté bloque la suppression. Sans cette
     * branche, `attachedProfilesCount()` rendrait 0 — l'API déclarerait le
     * rôle libre, et la FK `restrictOnDelete` rendrait un 500 au lieu du 409.
     */
    public function test_a_service_provider_role_still_held_counts_as_attached(): void
    {
        [$agency, $role] = $this->agencyWithProviderRole([Capability::MaintenanceClose]);
        $this->collaborate($agency, $role);

        $this->assertSame(1, $role->attachedProfilesCount());
        $this->assertSame(
            (int) $this->provider->id,
            (int) app(AgencyRoleService::class)->blockingProfiles($role)[0]['user_id'],
            'le 409 doit nommer l\'utilisateur, pas seulement la ligne de collaboration',
        );
    }

    /**
     * AC3 — le backfill ne laisse AUCUNE collaboration sans rôle,
     * soft-deletées comprises : la colonne passe NOT NULL, et une contrainte
     * de colonne ne connaît pas `deleted_at`.
     *
     * On rejoue le triptyque en sens inverse puis en avant : `down()` de la
     * migration NOT NULL, mise à null, `up()` du backfill. Le `down()` est
     * donc exercé ici, pas seulement écrit.
     */
    public function test_backfill_leaves_no_collaboration_without_a_role(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        $this->collaborate($agencyA, null);
        $this->collaborate($agencyB, null);

        $secondProfile = ServiceProviderProfile::factory()->create();
        $soft = ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $secondProfile->id,
            'agency_id' => $agencyA->id,
            'status' => 'active',
            'started_at' => now()->subMonth(),
        ]);
        $soft->delete();

        $notNull = require database_path('migrations/2026_08_17_090200_make_agency_role_id_not_null_on_sp_collaborations.php');
        $backfill = require database_path('migrations/2026_08_17_090100_backfill_sp_collaboration_agency_roles.php');

        $notNull->down();

        // On efface AUSSI les rôles système prestataires : le backfill doit
        // les recréer, capacités comprises. Supposer l'état laissé par une
        // migration antérieure, c'est déduire au lieu de mesurer.
        DB::table('service_provider_agency_collaborations')->update(['agency_role_id' => null]);
        $providerRoleIds = DB::table('agency_roles')
            ->where('base_profile_type', AgencyRoleBaseType::ServiceProvider->value)
            ->pluck('id');
        DB::table('agency_role_capabilities')->whereIn('agency_role_id', $providerRoleIds)->delete();
        DB::table('agency_roles')->whereIn('id', $providerRoleIds)->delete();

        $this->assertSame(3, DB::table('service_provider_agency_collaborations')->count());
        $this->assertSame(3, DB::table('service_provider_agency_collaborations')->whereNull('agency_role_id')->count());

        $backfill->up();
        $notNull->up();

        $this->assertSame(
            0,
            DB::table('service_provider_agency_collaborations')->whereNull('agency_role_id')->count(),
            'AC3 — aucune collaboration ne doit rester sans rôle après backfill',
        );

        // Chacune porte le rôle système de SON agence, pas d'une autre.
        foreach ([$agencyA, $agencyB] as $agency) {
            $systemRoleId = DB::table('agency_roles')
                ->where('agency_id', $agency->id)
                ->where('base_profile_type', AgencyRoleBaseType::ServiceProvider->value)
                ->where('is_system', true)
                ->value('id');

            $this->assertNotNull($systemRoleId);
            $this->assertSame(
                0,
                DB::table('service_provider_agency_collaborations')
                    ->where('agency_id', $agency->id)
                    ->where('agency_role_id', '!=', $systemRoleId)
                    ->count(),
            );
        }

        // Les capacités du rôle recréé sont bien celles du catalogue.
        $this->assertTrue($this->resolver->allows(
            $this->provider,
            Capability::MaintenanceClose,
            $agencyA->fresh(),
        ));
    }

    /**
     * @param  array<int,Capability>  $capabilities
     * @return array{0:Agency,1:AgencyRole}
     */
    private function agencyWithProviderRole(array $capabilities): array
    {
        $agency = Agency::factory()->create();

        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::ServiceProvider)
            ->withCapabilities($capabilities)
            ->create(['agency_id' => $agency->id]);

        return [$agency, $role];
    }

    private function collaborate(Agency $agency, ?AgencyRole $role): ServiceProviderAgencyCollaboration
    {
        return ServiceProviderAgencyCollaboration::query()->create(array_filter([
            'service_provider_profile_id' => $this->profile->id,
            'agency_id' => $agency->id,
            'status' => 'active',
            'started_at' => now()->subMonth(),
            'agency_role_id' => $role?->id,
        ], static fn ($value): bool => $value !== null));
    }
}
