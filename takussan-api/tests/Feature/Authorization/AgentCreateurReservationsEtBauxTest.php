<?php

namespace Tests\Feature\Authorization;

use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use App\Services\Model\LeaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1722 (P160.03) — l'agent qui a SAISI le bien d'agence (`properties.user_id` = lui) n'en est
 * pas le bailleur, ni du bail que `LeaseService::create` lui fait porter en `landlord_id` : il
 * confirme et annule une réservation, ouvre, renouvelle et résilie un bail, et en rend le dépôt au
 * titre du personnel, donc sous les capacités de son rôle. Il passait par la branche « bailleur »
 * (`landlordWrites`) avant toute capacité.
 *
 * Chaque refus a son témoin : le même agent, rôle système (qui porte ces capacités), passe.
 */
class AgentCreateurReservationsEtBauxTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private const CAPACITES = [
        Capability::BookingsValidate,
        Capability::BookingsCancel,
        Capability::LeasesCreate,
        Capability::LeasesTerminate,
        Capability::LeasesRenew,
        Capability::LeasesRefundDeposit,
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();
    }

    private function createur(bool $avecCapacites): User
    {
        $createur = $avecCapacites
            ? $this->agencyAgent($this->agency)
            : $this->agentWithout($this->agency, ...self::CAPACITES);
        $this->property->forceFill(['user_id' => $createur->id])->save();

        return $createur;
    }

    /** Le bail tel que `LeaseService::create` l'écrit pour un bien saisi par l'agent. */
    private function bailDe(User $landlord): Lease
    {
        return Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->client->id])->id,
            'status' => LeaseStatus::Active,
        ]);
    }

    /** @return array<string, mixed> */
    private function donneesDeBail(User $createur): array
    {
        $tenant = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $createur->id]);

        return collect(Lease::factory()->raw(['property_id' => $this->property->id, 'tenant_id' => $tenant->id]))
            ->except(['landlord_id', 'agency_id', 'reference_number', 'status', 'agent_id', 'commission_amount', 'booking_id', 'guarantor_id'])
            ->all();
    }

    /** @return array<string, bool> */
    private function gestes(User $user): array
    {
        $booking = $this->bookingOfClient();
        $lease = $this->bailDe($user);
        $gate = Gate::forUser($user);

        return [
            'validate' => $gate->allows('validate', $booking),
            'cancel' => $gate->allows('cancel', $booking),
            'renew' => $gate->allows('renew', $lease),
            'requestEarlyTermination' => $gate->allows('requestEarlyTermination', $lease),
            'confirmEarlyTermination' => $gate->allows('confirmEarlyTermination', $lease),
            'refundDeposit' => $gate->allows('refundDeposit', $lease),
        ];
    }

    public function test_l_agent_createur_sans_capacites_est_juge_par_elles(): void
    {
        $gestes = $this->gestes($this->createur(false));

        $this->assertSame(array_fill_keys(array_keys($gestes), false), $gestes);
    }

    public function test_l_agent_createur_du_role_systeme_garde_ses_gestes(): void
    {
        $gestes = $this->gestes($this->createur(true));

        $this->assertSame(array_fill_keys(array_keys($gestes), true), $gestes);
    }

    public function test_le_bailleur_du_bien_garde_ses_gestes_sans_capacite(): void
    {
        $gestes = $this->gestes($this->landlord);

        $this->assertSame(array_fill_keys(array_keys($gestes), true), $gestes);
    }

    public function test_l_agent_createur_sans_leases_create_n_ouvre_pas_de_bail(): void
    {
        $createur = $this->createur(false);
        $this->actingAs($createur);

        try {
            app(LeaseService::class)->create($this->property, $createur, $this->donneesDeBail($createur));
            $this->fail('Le bail a été ouvert.');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }

        $this->assertSame(0, Lease::query()->where('property_id', $this->property->id)->count());
    }

    /** Témoin : le même locataire, l'agent du rôle système (`leases.create`) ouvre le bail. */
    public function test_l_agent_createur_avec_leases_create_ouvre_le_bail(): void
    {
        $createur = $this->createur(true);
        $this->actingAs($createur);

        $lease = app(LeaseService::class)->create($this->property, $createur, $this->donneesDeBail($createur));

        $this->assertTrue($lease->exists);
    }
}
