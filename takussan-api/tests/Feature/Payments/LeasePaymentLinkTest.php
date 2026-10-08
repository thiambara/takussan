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
        // Raccord TCK-601 (ADR-0044 §3) — la ligne appartient à l'agence du BAIL, et ne porte ni jeton
        // ni URL.
        $rows = DB::table('activity_log')->whereIn('event', ['lease_payment_link_issued', 'lease_payment_link_revoked'])->get();
        $this->assertSame([$ctx['agency']->id], $rows->pluck('agency_id')->map(fn ($id) => (int) $id)->unique()->values()->all());
        foreach ($rows as $row) {
            $this->assertStringNotContainsString('/pay/', (string) $row->properties);
            $this->assertStringNotContainsString(substr($second, -43), (string) $row->properties);
        }
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

    /**
     * Raccord TCK-596 — une échéance ANNULÉE par un renouvellement ne se paie plus : aucun lien
     * neuf (409), et le lien déjà envoyé rend 410 à la lecture comme à l'initiation, sans appel
     * sortant.
     */
    public function test_a_cancelled_instalment_gets_no_link_and_its_sent_link_is_gone(): void
    {
        $ctx = $this->leaseDue();
        $this->actingAs($ctx['agent'], 'sanctum');
        $path = '/api/lease-payments/'.$ctx['payment']->id.'/payment-link';
        $token = substr($this->postJson($path)->assertOk()->json('data.url'), strlen('https://front.test/pay/'));

        DB::table('lease_payments')->where('id', $ctx['payment']->id)->update(['status' => PaymentStatus::Cancelled->value]);

        $this->postJson($path)->assertStatus(409)->assertJsonPath('code', 'payment.not_payable');
        $this->postJson($path, ['regenerate' => true])->assertStatus(409);
        $this->assertSame(1, LeasePaymentLink::query()->count());

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/pay/{$token}")->assertStatus(410)->assertJsonPath('code', 'pay_link.gone');
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertStatus(410);
        Http::assertNothingSent();
    }
}
