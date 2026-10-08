<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePaymentLink;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §1) — le lien de paiement vu par qui relance : émettre (idempotent),
 * régénérer, révoquer — sous l'autorisation de l'initiation (`update`, TCK-587).
 */
class LeasePaymentLinkTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config()->set('app.frontend_url', 'https://front.test');
    }

    public function test_the_agent_issues_reads_regenerates_and_revokes_the_link(): void
    {
        $ctx = $this->leaseDue();
        $this->actingAs($ctx['agent'], 'sanctum');
        $path = '/api/lease-payments/'.$ctx['payment']->id.'/payment-link';

        $first = $this->postJson($path)->assertOk()->json('data.url');
        $this->assertMatchesRegularExpression('#^https://front\.test/pay/[A-Za-z0-9_-]{43}$#', $first);
        $this->assertSame($first, $this->postJson($path)->assertOk()->json('data.url'));

        $second = $this->postJson($path, ['regenerate' => true])->assertOk()->json('data.url');
        $this->assertNotSame($first, $second);
        $this->assertSame(1, LeasePaymentLink::query()->whereNull('revoked_at')->count());
        $this->assertSame(2, LeasePaymentLink::query()->count());

        $this->deleteJson($path)->assertOk()->assertJsonPath('data.revoked', true);
        $this->deleteJson($path)->assertOk()->assertJsonPath('data.revoked', false);
        $this->getJson('/api/pay/'.substr($second, strlen('https://front.test/pay/')))->assertStatus(410);

        $this->assertSame(1, DB::table('activity_log')->where('event', 'lease_payment_link_revoked')->count());
        $this->assertSame(3, DB::table('activity_log')->where('event', 'lease_payment_link_issued')->count());
    }

    public function test_another_agency_and_a_guest_cannot_issue_it(): void
    {
        $ctx = $this->leaseDue();
        $path = '/api/lease-payments/'.$ctx['payment']->id.'/payment-link';

        $this->postJson($path)->assertUnauthorized();

        $outsider = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $this->actingAs($outsider, 'sanctum');
        $this->postJson($path)->assertForbidden();
        $this->deleteJson($path)->assertForbidden();
        $this->assertSame(0, LeasePaymentLink::query()->count());
    }

    public function test_a_settled_instalment_gets_no_link(): void
    {
        $ctx = $this->leaseDue();
        DB::table('lease_payments')->where('id', $ctx['payment']->id)->update(['status' => PaymentStatus::Paid->value, 'paid_at' => now(), 'late_fee_paid_at' => now()]);
        $this->actingAs($ctx['agent'], 'sanctum');

        $this->postJson('/api/lease-payments/'.$ctx['payment']->id.'/payment-link')
            ->assertStatus(409)->assertJsonPath('code', 'payment.not_payable');
        $this->assertSame(0, LeasePaymentLink::query()->count());
    }
}
