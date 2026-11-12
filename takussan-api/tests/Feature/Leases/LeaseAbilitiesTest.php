<?php

namespace Tests\Feature\Leases;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * P152.02 — le détail d'un bail dit, par `abilities`, ce que le lecteur peut y faire parmi les quatre
 * gestes que `LeasePolicy` juge par capacité : renouveler, réviser le loyer, encaisser, restituer le
 * dépôt. La fiche montait ces gestes à tout rôle de gestion, et l'API les refusait (403).
 */
class LeaseAbilitiesTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** @param  list<Capability>  $capabilities */
    private function customRole(Agency $agency, array $capabilities): AgencyRole
    {
        $roles = app(AgencyRoleService::class);
        $role = $roles->create($agency, ['name' => 'Rôle '.uniqid(), 'base_profile_type' => AgencyRoleBaseType::Agent->value]);

        return $roles->replaceCapabilities($role, $capabilities);
    }

    /**
     * @param  list<Capability>  $capabilities
     * @return array<string, bool>
     */
    private function abilitiesOfAgent(array $capabilities): array
    {
        $agency = Agency::factory()->create();
        $lease = Lease::factory()->active()->create(['agency_id' => $agency->id]);
        $user = User::factory()->create();
        $profile = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->customRole($agency, $capabilities)->id,
        ]);

        $this->actingAs($user, 'sanctum');

        return $this->apiGet("/api/leases/{$lease->id}", ['X-Profile-Id' => "agent:{$profile->id}"])
            ->assertOk()
            ->json('data.abilities');
    }

    public function test_un_agent_sans_les_capacites_ne_se_voit_offrir_aucun_des_quatre_gestes(): void
    {
        $this->assertSame([
            'renew' => false,
            'review_rent' => false,
            'record_payment' => false,
            'refund_deposit' => false,
            'request_early_termination' => false,
            'update' => true,
            // TCK-2642 — joindre une pièce et le contrat suivent l'envoi de document et la lecture.
            'add_document' => true,
            'download_contract' => true,
            'leave_review' => false,
            'give_notice' => false,
            // TCK-2645 (décision 3) — « Passer outre » le plafond de révision : capacité dédiée.
            'rent_review_force' => false,
        ], $this->abilitiesOfAgent([Capability::CrmViewAll]));
    }

    public function test_chaque_geste_suit_sa_capacite(): void
    {
        $this->assertSame([
            'renew' => true,
            'review_rent' => false,
            'record_payment' => true,
            'refund_deposit' => false,
            'request_early_termination' => false,
            'update' => true,
            // TCK-2642 — joindre une pièce et le contrat suivent l'envoi de document et la lecture.
            'add_document' => true,
            'download_contract' => true,
            'leave_review' => false,
            'give_notice' => false,
            // TCK-2645 (décision 3) — « Passer outre » le plafond de révision : capacité dédiée.
            'rent_review_force' => false,
        ], $this->abilitiesOfAgent([Capability::LeasesRenew, Capability::PaymentsRecord]));
    }

    public function test_le_bailleur_du_bail_garde_ses_quatre_gestes(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->active()->create(['landlord_id' => $landlord->id]);

        $this->actingAs($landlord, 'sanctum');

        $this->apiGet("/api/leases/{$lease->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities', [
                'renew' => true,
                'review_rent' => true,
                'record_payment' => true,
                'refund_deposit' => true,
                'request_early_termination' => true,
                'update' => true,
                // TCK-2642 — les gestes que la fiche ouvrait encore par le rôle.
                'add_document' => true,
                'download_contract' => true,
                'leave_review' => false,
                'give_notice' => false,
                // TCK-2645 (décision 3) — sans `leases.rent_review_force`, le bailleur ne passe pas outre.
                'rent_review_force' => false,
            ]);
    }

    /**
     * P189.03 (TCK-1871) — le préavis, l'ajout de garant et le lien de paiement suivent
     * `request_early_termination` et `update` : la fiche les ouvrait par le rôle, que le bailleur
     * suspendu garde, et l'API les lui refusait (403).
     */
    public function test_le_bailleur_suspendu_ne_se_voit_offrir_ni_preavis_ni_garant_ni_lien(): void
    {
        $agency = Agency::factory()->create();
        $landlord = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);
        $lease = Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $agency->id,
        ]);
        OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)
            ->update(['status' => OwnerProfileStatus::Blocked->value]);

        $this->actingAs($landlord, 'sanctum');

        $this->apiGet("/api/leases/{$lease->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.request_early_termination', false)
            ->assertJsonPath('data.abilities.update', false);
        $this->apiPost("/api/leases/{$lease->id}/early-termination", [])->assertForbidden();
    }

    /**
     * Réserve de contre-vérification (2026-11-12) — le bailleur ACTIF d'un bien d'agence se voit offrir
     * `record_payment` sur la fiche du bail : l'offre et l'API disent la même chose. `POST
     * /api/leases/{id}/payments` passe pour lui (`LeasePolicy::recordPayment`, TCK-587 : « le bailleur
     * du bail, toujours »), et la ligne est écrite ; suspendu, l'offre et le geste tombent ensemble.
     */
    public function test_le_bailleur_d_un_bien_d_agence_encaisse_comme_la_fiche_le_lui_offre(): void
    {
        $agency = Agency::factory()->create();
        $landlord = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);
        $lease = Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $agency->id,
        ]);
        $ligne = ['amount' => 50000, 'payment_type' => 'charges', 'period_start' => '2026-01-01', 'period_end' => '2026-01-31'];

        $this->actingAs($landlord, 'sanctum');
        $this->apiGet("/api/leases/{$lease->id}")->assertOk()->assertJsonPath('data.abilities.record_payment', true);
        $this->apiPost("/api/leases/{$lease->id}/payments", $ligne)->assertCreated();
        $this->assertSame(1, $lease->payments()->count());

        OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)
            ->update(['status' => OwnerProfileStatus::Blocked->value]);
        $this->app['auth']->forgetGuards();
        $this->actingAs($landlord->fresh(), 'sanctum');
        $this->apiGet("/api/leases/{$lease->id}")->assertOk()->assertJsonPath('data.abilities.record_payment', false);
        $this->apiPost("/api/leases/{$lease->id}/payments", $ligne)->assertForbidden();
        $this->assertSame(1, $lease->payments()->count());
    }

    public function test_le_locataire_peut_donner_preavis_sans_gerer_le_bail(): void
    {
        $tenantUser = User::factory()->create();
        $lease = Lease::factory()->active()->create([
            'tenant_id' => Customer::factory()->create(['user_id' => $tenantUser->id])->id,
        ]);

        $this->actingAs($tenantUser, 'sanctum');

        $this->apiGet("/api/leases/{$lease->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.request_early_termination', true)
            ->assertJsonPath('data.abilities.update', false);
    }

    /**
     * TCK-2642, AC6 — le contrat se télécharge par toute partie qui lit le bail : la fiche le refusait
     * à la gestion, l'API l'autorisait déjà (`view`). La clé et l'endpoint disent la même chose.
     */
    public function test_le_bailleur_telecharge_le_contrat(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->active()->create(['landlord_id' => $landlord->id]);

        $this->actingAs($landlord, 'sanctum');

        $this->apiGet("/api/leases/{$lease->id}")->assertOk()->assertJsonPath('data.abilities.download_contract', true);
        $this->apiGet("/api/leases/{$lease->id}/contract/pdf")->assertOk();
    }

    public function test_l_admin_d_agence_telecharge_le_contrat_et_ne_donne_ni_conge_ni_avis(): void
    {
        $agency = Agency::factory()->create();
        $lease = Lease::factory()->active()->create(['agency_id' => $agency->id]);
        $admin = $this->agencyAdmin($agency);

        $this->actingAs($admin, 'sanctum');

        $abilities = $this->apiGet("/api/leases/{$lease->id}")->assertOk()->json('data.abilities');
        $this->assertTrue($abilities['download_contract']);
        $this->assertTrue($abilities['add_document']);
        $this->assertFalse($abilities['give_notice'], 'le congé est un geste du locataire');
        $this->assertFalse($abilities['leave_review'], 'l\'avis est un geste du locataire');
    }

    /** TCK-2642 — congé et avis sont des gestes de PARTIE : le super-admin, que `Gate::before` laisse tout faire, ne les reçoit pas. */
    public function test_le_super_admin_ne_donne_ni_conge_ni_avis(): void
    {
        $lease = Lease::factory()->active()->create();
        $operator = User::factory()->create();
        $this->materializeRoleProfile($operator, 'super_admin');
        $this->actingAs($operator, 'sanctum');

        $abilities = $this->apiGet("/api/leases/{$lease->id}")->assertOk()->json('data.abilities');
        $this->assertTrue($abilities['download_contract']);
        $this->assertFalse($abilities['give_notice']);
        $this->assertFalse($abilities['leave_review']);
    }

    /** TCK-2642 — le locataire donne congé, joint un document, télécharge son contrat ; l'avis suit le statut que juge le dépôt. */
    public function test_les_gestes_du_locataire(): void
    {
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $active = Lease::factory()->active()->create(['tenant_id' => $tenant->id]);
        $draft = Lease::factory()->create(['tenant_id' => $tenant->id, 'status' => LeaseStatus::Draft]);

        $this->actingAs($tenantUser, 'sanctum');

        $this->apiGet("/api/leases/{$active->id}")->assertOk()
            ->assertJsonPath('data.abilities.give_notice', true)
            ->assertJsonPath('data.abilities.leave_review', true)
            ->assertJsonPath('data.abilities.download_contract', true)
            ->assertJsonPath('data.abilities.add_document', true);
        $this->apiGet("/api/leases/{$draft->id}")->assertOk()
            ->assertJsonPath('data.abilities.leave_review', false);
    }

    /** TCK-2642 — le bien déjà noté (avis retiré compris) : le dépôt refuserait, la clé le dit. */
    public function test_le_locataire_qui_a_deja_note_le_bien_ne_se_voit_plus_offrir_l_avis(): void
    {
        $tenantUser = User::factory()->create();
        $lease = Lease::factory()->active()->create(['tenant_id' => Customer::factory()->create(['user_id' => $tenantUser->id])->id]);
        $this->actingAs($tenantUser, 'sanctum');
        $this->apiGet("/api/leases/{$lease->id}")->assertOk()->assertJsonPath('data.abilities.leave_review', true);

        $lease->property->reviews()->create(['author_id' => $tenantUser->id, 'rating' => 4, 'content' => 'Bien tenu, quartier calme.', 'is_approved' => false])->delete();

        $this->apiGet("/api/leases/{$lease->id}")->assertOk()->assertJsonPath('data.abilities.leave_review', false);
        $this->apiPost("/api/properties/{$lease->property_id}/reviews", ['rating' => 5, 'content' => 'Un second avis sur le même bien.'])
            ->assertStatus(422);
    }
}
