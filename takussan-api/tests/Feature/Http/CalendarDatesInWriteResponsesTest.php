<?php

namespace Tests\Feature\Http;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-1500 (P94.04) — une date calendaire (cast `date`) sort en `Y-m-d` (ADR-0018), y compris
 * dans les réponses d'écriture qui rendaient un modèle brut ; et la date de tri d'une échéance
 * impayée de l'historique des paiements est figée : son `period_start` à minuit UTC.
 *
 * Avant : `POST /api/customers/{c}/primary-contact` rendait `started_at` en
 * `2026-10-01T00:00:00.000000Z`, et `PATCH /api/profiles/{p}/suspend` de même `hire_date` et
 * `active_until`.
 */
class CalendarDatesInWriteResponsesTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_le_referent_d_un_client_rend_ses_dates_calendaires_en_y_m_d(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $customer = Customer::factory()->create(['agency_id' => $agency->id, 'added_by_id' => $agent->id]);
        UserCustomerRelationship::query()->create([
            'customer_id' => $customer->id,
            'user_id' => $agent->id,
            'relationship_type' => 'agent_client',
            'started_at' => '2026-10-01',
            'ended_at' => '2026-12-31',
        ]);

        $this->actingAsApi($agent)
            ->apiPost("/api/customers/{$customer->id}/primary-contact", ['user_id' => $agent->id])
            ->assertOk()
            ->assertJsonPath('data.started_at', '2026-10-01')
            ->assertJsonPath('data.ended_at', '2026-12-31')
            ->assertJsonPath('data.is_primary', true);
    }

    public function test_suspendre_un_agent_rend_ses_dates_calendaires_en_y_m_d(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $profile = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Active->value,
            'hire_date' => '2026-10-21',
            'active_until' => '2027-01-31',
        ]);

        $this->patchJson("/api/profiles/{$profile->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.status', AgentProfileStatus::Suspended->value)
            ->assertJsonPath('data.hire_date', '2026-10-21')
            ->assertJsonPath('data.active_until', '2027-01-31');
    }

    public function test_une_echeance_impayee_se_trie_a_minuit_utc_de_son_debut_de_periode(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $customer = Customer::factory()->create();
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $customer->id,
        ]);
        $ligne = fn (array $attrs): LeasePayment => LeasePayment::factory()->create(array_merge([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 100_000,
        ], $attrs));

        $apres = $ligne(['status' => PaymentStatus::Paid, 'paid_at' => '2026-10-01 10:00:00', 'period_start' => '2026-09-01']);
        $impayee = $ligne(['status' => PaymentStatus::Pending, 'paid_at' => null, 'period_start' => '2026-10-01']);
        $avant = $ligne(['status' => PaymentStatus::Paid, 'paid_at' => '2026-09-30 23:00:00', 'period_start' => '2026-08-01']);

        Sanctum::actingAs($owner);
        $rows = collect($this->getJson('/api/payments/history?sort=-date')->assertOk()->json('data'))
            ->where('source', 'lease')->values();

        $this->assertSame([$apres->id, $impayee->id, $avant->id], $rows->pluck('id')->all());
        $this->assertSame('2026-10-01T00:00:00.000000Z', $rows[1]['date']);
        $this->assertSame('2026-10-01', $rows[1]['period_start']);
    }
}
