<?php

namespace Tests\Unit\Services\Membership;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-278 — table de vérité du résolveur de capacités (phase 1).
 *
 * On vérifie chaque (Capability, ProfileType) clé pour qu'un changement
 * de mapping silencieux remonte en CI.
 */
class MembershipCapabilityResolverTest extends TestCase
{
    use RefreshDatabase;

    private MembershipCapabilityResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = app(MembershipCapabilityResolver::class);
    }

    public function test_super_admin_allows_everything(): void
    {
        $user = User::factory()->create();
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $user->id]);
        $agency = Agency::factory()->create();

        foreach (Capability::cases() as $capability) {
            $this->assertTrue(
                $this->resolver->allows($user, $capability, $agency),
                "super_admin doit autoriser {$capability->value}",
            );
        }
    }

    public function test_revoked_platform_profile_does_not_grant(): void
    {
        $user = User::factory()->create();
        PlatformProfile::factory()->superAdmin()->revoked()->create(['user_id' => $user->id]);

        $this->assertFalse($this->resolver->allows($user, Capability::ReportsViewGlobal));
    }

    public function test_viewer_only_allows_reports_view_global(): void
    {
        $user = User::factory()->create();
        PlatformProfile::factory()->create(['user_id' => $user->id]); // default = viewer

        $this->assertTrue($this->resolver->allows($user, Capability::ReportsViewGlobal));
        $this->assertFalse($this->resolver->allows($user, Capability::ReportsExport));
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesCreate, Agency::factory()->create()));
    }

    public function test_support_has_read_export_subset(): void
    {
        $user = User::factory()->create();
        PlatformProfile::factory()->support()->create(['user_id' => $user->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::CrmViewAll));
        $this->assertTrue($this->resolver->allows($user, Capability::PaymentsExport));
        $this->assertFalse($this->resolver->allows($user, Capability::PaymentsRefund));
        $this->assertFalse($this->resolver->allows($user, Capability::BookingsCancel));
    }

    public function test_no_agency_context_for_agency_scoped_capability_returns_false(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        // Sans agency, même un admin n'a pas la capacité agency-scoped.
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesCreate, null));
    }

    public function test_agency_admin_allows_operational_capabilities_in_own_agency(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        foreach ([
            Capability::AgencyUpdate,
            Capability::TeamInvite,
            Capability::PropertiesCreate,
            Capability::PropertiesPublish,
            Capability::BookingsCancel,
            Capability::LeasesTerminate,
            Capability::PaymentsRefund,
            Capability::PayoutsApprove,
            Capability::RolesCreateCustom,
        ] as $cap) {
            $this->assertTrue($this->resolver->allows($user, $cap, $agency), "agency_admin doit avoir {$cap->value}");
        }

        // Capacités plateforme : pas pour agency_admin.
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesModerate, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::ReportsViewGlobal, $agency));
    }

    public function test_agency_admin_does_not_leak_across_agencies(): void
    {
        $user = User::factory()->create();
        $home = Agency::factory()->create();
        $other = Agency::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $home->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesCreate, $home));
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesCreate, $other));
    }

    public function test_agent_truth_table_subset(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesCreate, $agency));
        $this->assertTrue($this->resolver->allows($user, Capability::BookingsValidate, $agency));
        $this->assertTrue($this->resolver->allows($user, Capability::MaintenanceAssign, $agency));

        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesDelete, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::PaymentsRefund, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::TeamInvite, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::RolesCreateCustom, $agency));
    }

    public function test_owner_only_updates_own_properties(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesUpdateOwn, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesCreate, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::BookingsValidate, $agency));
    }

    public function test_additive_model_when_user_holds_two_profiles(): void
    {
        // agent + owner dans la même agence : capacité = OR
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesCreate, $agency)); // agent
        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesUpdateOwn, $agency)); // both
    }

    // =================================================================
    // ÉCART MESURÉ AVEC LE MAPPING SPATIE — un cas par capacité
    // =================================================================
    //
    // TCK-278 s'était engagé à ce que « la table de vérité phase 1 reproduise
    // le mapping actuel rôle spatie → permissions ». Elle ne le reproduit pas.
    // Le diff complet, sa règle de correspondance et la décision prise sont
    // dans `MembershipCapabilityResolver` (bloc « TABLE DE VÉRITÉ PHASE 1 »).
    //
    // Les tests ci-dessous le rendent EXÉCUTABLE. Ils n'affirment pas que
    // l'écart est souhaitable — ils affirment qu'il est CONNU. Un écart
    // documenté seulement en prose se referme ou s'aggrave en silence au
    // premier refactor ; TCK-279 va seeder cette table en base pour chaque
    // agence, et c'est le dernier moment où elle est encore rattrapable.
    //
    // Chaque cas est un `@dataProvider` : une capacité = un test nommé, donc
    // un échec nomme la capacité en cause au lieu d'un rang dans une boucle.
    // Source de l'ancien mapping :
    //   git show 33ce4f69^:…/database/seeders/System/RolesAndPermissionsSeeder.php

    /**
     * Capacités que le rôle spatie `owner` portait sous un nom IDENTIQUE, et
     * que `ownerAllows()` n'accorde plus.
     *
     * @return array<string,array{Capability}>
     */
    public static function ownerRemovedCapabilityProvider(): array
    {
        return [
            'properties.create' => [Capability::PropertiesCreate],
            'leases.create' => [Capability::LeasesCreate],
            'leases.terminate' => [Capability::LeasesTerminate],
            'leases.renew' => [Capability::LeasesRenew],
            'leases.refund_deposit' => [Capability::LeasesRefundDeposit],
            'leases.rent_review' => [Capability::LeasesRentReview],
            'leases.rent_review_force' => [Capability::LeasesRentReviewForce],
        ];
    }

    #[DataProvider('ownerRemovedCapabilityProvider')]
    public function test_owner_no_longer_holds_capability_the_spatie_role_carried(Capability $capability): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertFalse(
            $this->resolver->allows($user, $capability, $agency),
            "RETRAIT ACTÉ : le rôle spatie `owner` portait `{$capability->value}` ; ".
            'la table phase 1 ne l’accorde plus. Si ce test devient rouge, la '.
            'capacité a été rendue — mettre à jour le bloc « TABLE DE VÉRITÉ '.
            'PHASE 1 » du resolver, ce n’est pas ce test qu’il faut ajuster.',
        );
    }

    public function test_owner_keeps_the_only_capability_it_did_not_lose(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        // `properties.update` du rôle spatie → `properties.update_own`.
        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesUpdateOwn, $agency));
    }

    /**
     * Capacités dont la famille de ressources était ENTIÈREMENT absente du
     * grant spatie de `agent` (ni lease_payments, ni invoices, ni
     * maintenance_requests) et que `agentAllows()` accorde désormais.
     *
     * @return array<string,array{Capability}>
     */
    public static function agentAddedCapabilityProvider(): array
    {
        return [
            'payments.record' => [Capability::PaymentsRecord],
            'invoices.create' => [Capability::InvoicesCreate],
            'invoices.send' => [Capability::InvoicesSend],
            'maintenance.assign' => [Capability::MaintenanceAssign],
            'maintenance.close' => [Capability::MaintenanceClose],
        ];
    }

    #[DataProvider('agentAddedCapabilityProvider')]
    public function test_agent_gained_capability_absent_from_the_spatie_role(Capability $capability): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertTrue(
            $this->resolver->allows($user, $capability, $agency),
            'ÉLARGISSEMENT ACTÉ : le rôle spatie `agent` n’avait aucune permission '.
            "sur la famille de `{$capability->value}` ; la table phase 1 la lui accorde.",
        );
    }

    /**
     * Capacités que le rôle spatie `agent` portait sous un nom IDENTIQUE et
     * que la table phase 1 a bien préservées — la moitié du diff qui va bien,
     * et qu'un « nettoyage » de `agentAllows()` casserait sans bruit.
     *
     * @return array<string,array{Capability}>
     */
    public static function agentPreservedCapabilityProvider(): array
    {
        return [
            'properties.create' => [Capability::PropertiesCreate],
            'leases.create' => [Capability::LeasesCreate],
            'leases.terminate' => [Capability::LeasesTerminate],
            'leases.renew' => [Capability::LeasesRenew],
            'leases.refund_deposit' => [Capability::LeasesRefundDeposit],
            'leases.rent_review' => [Capability::LeasesRentReview],
        ];
    }

    #[DataProvider('agentPreservedCapabilityProvider')]
    public function test_agent_preserved_capability_from_the_spatie_role(Capability $capability): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertTrue(
            $this->resolver->allows($user, $capability, $agency),
            "PRÉSERVATION : le rôle spatie `agent` portait `{$capability->value}`.",
        );
    }

    public function test_agent_did_not_gain_rent_review_force(): void
    {
        // Le rôle spatie `agent` avait `leases.rent_review` mais PAS `_force`,
        // réservé à agency_admin et owner. La table phase 1 tient la
        // distinction — c'est la seule des 5 extras `leases.*` qu'elle refuse
        // à l'agent, et la moins visible.
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertFalse($this->resolver->allows($user, Capability::LeasesRentReviewForce, $agency));
    }

    /**
     * Capacités dont la famille de ressources était ENTIÈREMENT absente du
     * grant spatie de `agency_admin` (ni agencies, ni invoices, ni payouts,
     * ni users, ni reports) et que `agencyAdminAllows()` accorde désormais.
     *
     * @return array<string,array{Capability}>
     */
    public static function agencyAdminAddedCapabilityProvider(): array
    {
        return [
            'agency.update' => [Capability::AgencyUpdate],
            'invoices.create' => [Capability::InvoicesCreate],
            'invoices.write_off' => [Capability::InvoicesWriteOff],
            'invoices.send' => [Capability::InvoicesSend],
            'payouts.create' => [Capability::PayoutsCreate],
            'payouts.approve' => [Capability::PayoutsApprove],
            'reports.export' => [Capability::ReportsExport],
        ];
    }

    #[DataProvider('agencyAdminAddedCapabilityProvider')]
    public function test_agency_admin_gained_capability_absent_from_the_spatie_role(Capability $capability): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertTrue(
            $this->resolver->allows($user, $capability, $agency),
            'ÉLARGISSEMENT ACTÉ : le rôle spatie `agency_admin` n’avait aucune '.
            "permission sur la famille de `{$capability->value}`. TCK-279 doit ".
            'trancher AVANT de seeder cette table en base.',
        );
    }

    /**
     * La forme de `agencyAdminAllows()` est elle-même le risque : une liste
     * NOIRE de 2 capacités, là où le rôle spatie fonctionnait par liste
     * blanche. Ce test grave le compte pour que l'ajout d'un cas à l'enum ne
     * puisse plus élargir l'agency_admin sans qu'une décision soit prise.
     */
    public function test_agency_admin_breadth_is_pinned_to_42_of_44(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $granted = array_values(array_filter(
            Capability::cases(),
            fn (Capability $c) => $this->resolver->allows($user, $c, $agency),
        ));

        $this->assertCount(
            42,
            $granted,
            'La largeur de `agency_admin` a changé. Ce n’est pas un compte à '.
            'rafraîchir : c’est une décision à prendre, puis à reporter dans le '.
            'bloc « TABLE DE VÉRITÉ PHASE 1 » du resolver.',
        );
        $this->assertCount(44, Capability::cases());
    }
}
