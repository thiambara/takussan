<?php

namespace Tests\Feature\Leases;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2645 (décision 3) — `abilities.rent_review_force` dit à la feuille de révision si « Passer
 * outre » sera accepté : la capacité `leases.rent_review_force` ET un plafond NON figé au contrat
 * (`rent_review_max_pct` nul). Un plafond figé n'est jamais forcé (`RentReviewService`, VERIF-596
 * passe 3) : l'offre et l'API disent la même chose.
 */
class LeaseRentReviewForceAbilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_la_capacite_sur_un_bail_sans_plafond_fige_offre_le_passage_outre_que_l_api_accepte(): void
    {
        [$landlord, $lease] = $this->scaffold(null);
        $this->materializeRoleProfile($landlord, 'super_admin');
        Sanctum::actingAs($landlord);

        $this->getJson("/api/leases/{$lease->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.rent_review_force', true);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 260_000,
            'reason' => 'Travaux',
            'force' => true,
        ])->assertOk();
    }

    public function test_un_plafond_fige_au_contrat_retire_l_offre_comme_l_api_refuse(): void
    {
        [$landlord, $lease] = $this->scaffold(10);
        $this->materializeRoleProfile($landlord, 'super_admin');
        Sanctum::actingAs($landlord);

        $this->getJson("/api/leases/{$lease->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.rent_review_force', false);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 260_000,
            'reason' => 'Travaux',
            'force' => true,
        ])->assertStatus(422)->assertJsonPath('code', 'lease.rent_review_above_contract_cap');
    }

    public function test_sans_la_capacite_le_bailleur_qui_revise_ne_se_voit_pas_offrir_le_passage_outre(): void
    {
        [$landlord, $lease] = $this->scaffold(null);
        Sanctum::actingAs($landlord);

        $this->getJson("/api/leases/{$lease->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.review_rent', true)
            ->assertJsonPath('data.abilities.rent_review_force', false);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 260_000,
            'reason' => 'Travaux',
            'force' => true,
        ])->assertStatus(422)->assertJsonValidationErrors('force');
    }

    /**
     * La capacité se juge dans l'agence DU BAIL, pas dans celle du profil actif : un bailleur qui est
     * aussi membre d'une autre agence, où il a `leases.rent_review_force`, ne passe pas outre sur un
     * bail d'une agence où il n'est rien — ni dans l'offre, ni dans l'API.
     */
    public function test_la_capacite_d_une_autre_agence_n_ouvre_pas_le_passage_outre(): void
    {
        [$landlord, $lease] = $this->scaffold(null);
        $agenceDuBail = Agency::factory()->create();
        $lease->forceFill(['agency_id' => $agenceDuBail->id])->save();

        $autreAgence = Agency::factory()->create();
        $roles = app(AgencyRoleService::class);
        $role = $roles->replaceCapabilities(
            $roles->create($autreAgence, ['name' => 'Rôle '.uniqid(), 'base_profile_type' => AgencyRoleBaseType::Agent->value]),
            [Capability::LeasesRentReviewForce],
        );
        $agent = AgentProfile::factory()->create([
            'user_id' => $landlord->id,
            'agency_id' => $autreAgence->id,
            'agency_role_id' => $role->id,
        ]);
        // Il est le bailleur du bail (profil propriétaire dans l'agence DU BAIL : `BailleurDuBien`) et
        // agit sous son profil d'agent de l'autre agence, où il a la capacité.
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agenceDuBail->id]);
        Sanctum::actingAs($landlord);
        $this->withHeader('X-Profile-Id', "agent:{$agent->id}");

        // Témoin : dans SON agence, la capacité est bien accordée.
        $this->assertTrue($landlord->can('leases.rent_review_force', $autreAgence));

        $this->getJson("/api/leases/{$lease->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.review_rent', true)
            ->assertJsonPath('data.abilities.rent_review_force', false);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 260_000,
            'reason' => 'Travaux',
            'force' => true,
        ])->assertStatus(422)->assertJsonValidationErrors('force');
    }

    /**
     * @return array{0: User, 1: Lease}
     */
    private function scaffold(?float $plafondFige): array
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create(['user_id' => User::factory()->create()->id]);

        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'monthly_rent' => 200_000,
            'rent_review_max_pct' => $plafondFige,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
        ]);

        return [$landlord, $lease];
    }
}
