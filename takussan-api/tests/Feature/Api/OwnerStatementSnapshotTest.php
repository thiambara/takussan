<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\TestCase;

/**
 * TCK-2321 (P177.05 ; ADR-0039, amendement du 2026-10-25) — le relevé envoyé est conservé.
 * `payouts:send-owner-statements` écrit un instantané (`owner_statement_snapshots`) de chaque relevé
 * dont il envoie l'avis ; le mois clos est servi depuis lui, et ce qui a été écrit depuis se montre
 * en rectificatif. Un relevé sans instantané (envoyé avant, ou jamais) reste le calcul du jour.
 *
 * Avant (mesuré par la piste) : relevé de septembre lu le 2 octobre `gross 220000` ; le 20 novembre,
 * le loyer de septembre marqué payé au 15 septembre → le même relevé rendait `gross 420000`, sans
 * trace de ce qui avait été envoyé.
 */
class OwnerStatementSnapshotTest extends TestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    private LeasePayment $pendingRent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = $this->moneyAgency();
        $this->landlord = $this->landlordOf($this->agency);
        // Loyer et charges payés (220 000 à 10 %), caution, et un loyer de septembre encore dû.
        [, , , $this->pendingRent] = $this->septemberOf($this->leaseOf($this->agency, $this->landlord, 10));
    }

    public function test_p177_05_the_sent_statement_is_served_and_a_later_entry_shows_as_a_rectification(): void
    {
        $this->travelTo('2026-10-01 08:00:00');
        $this->artisan('payouts:send-owner-statements', ['--period' => '2026-09'])->assertSuccessful();

        $row = DB::table('owner_statement_snapshots')->sole();
        $this->assertSame([$this->agency->id, $this->landlord->id, '2026-09'], [(int) $row->agency_id, (int) $row->landlord_id, $row->period]);
        $this->assertArrayNotHasKey('name', json_decode($row->payload, true)['landlord'], 'l\'instantané ne garde pas le nom du bailleur');

        Sanctum::actingAs($this->landlord);
        $sent = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data');
        $this->assertSame('2026-10-01T08:00:00+00:00', $sent['snapshot']['sent_at']);
        $this->assertNull($sent['rectification'], 'rien n\'a changé depuis l\'envoi');

        // Le 20 novembre, le loyer dû de septembre est encaissé, daté du 15 septembre.
        $this->travelTo('2026-11-20 10:00:00');
        $this->pendingRent->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => '2026-09-15 10:00:00'])->save();

        $data = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data');
        $this->assertSame([220000, 22000, 198000], array_map('intval', [$data['totals']['gross'], $data['totals']['commission'], $data['totals']['net']]));
        $this->assertSame(1, $data['unpaid']['count'], 'les impayés restent ceux du jour de l\'envoi');
        $this->assertSame($this->landlord->id, $data['landlord']['id']);
        $this->assertNotEmpty($data['landlord']['name']);

        $rectification = $data['rectification'];
        $this->assertSame('2026-11-20T10:00:00+00:00', $rectification['as_of']);
        $this->assertSame([200000, 20000, 180000], array_map('intval', [
            $rectification['delta']['gross'], $rectification['delta']['commission'], $rectification['delta']['net'],
        ]));
        $this->assertEquals(420000, $rectification['totals']['gross']);
        $this->assertSame([$this->pendingRent->id], array_column($rectification['lines']['added']['lease_payments'], 'id'));
        $this->assertSame([], $rectification['lines']['removed']['lease_payments']);

        app()->setLocale('fr');
        $html = html_entity_decode(view('pdf.statements.owner', [
            'title' => 'Relevé', 'document_label' => 'Relevé', 'agency' => $this->agency, 'statement' => $data,
        ])->render(), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $this->assertStringContainsString('Relevé envoyé le 01/10/2026', $html);
        $this->assertStringContainsString('Rectificatif au 20/11/2026', $html);
        $this->assertStringContainsString($this->pendingRent->reference_number, $html);

        $this->get('/api/owner-statements/pdf?period=2026-09')->assertOk()->assertHeader('Content-Type', 'application/pdf');

        $csv = $this->get('/api/owner-statements/csv?period=2026-09')->assertOk()->streamedContent();
        $rows = array_map(fn (string $l): array => str_getcsv($l, ';'), array_values(array_filter(explode("\n", $csv))));
        $types = array_column($rows, 0);
        $this->assertContains('sent_at', $types);
        $this->assertContains('rectification_added:lease_payments', $types);
        $this->assertSame(['rectification_net', '', '', '2026-11-20T10:00:00+00:00', '180000', '20000'], $rows[array_search('rectification_net', $types, true)]);
    }

    public function test_p177_05_without_a_snapshot_the_closed_month_and_the_year_are_computed_as_today(): void
    {
        $this->travelTo('2026-11-20 10:00:00');
        $this->pendingRent->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => '2026-09-15 10:00:00'])->save();

        Sanctum::actingAs($this->landlord);
        foreach (['2026-09', '2026'] as $period) {
            $data = $this->getJson("/api/owner-statements?period={$period}")->assertOk()->json('data');
            $this->assertEquals(420000, $data['totals']['gross'], $period);
            $this->assertNull($data['snapshot'], $period);
            $this->assertNull($data['rectification'], $period);
        }
        $this->assertSame(0, DB::table('owner_statement_snapshots')->count(), 'aucun instantané rétroactif');
    }

    public function test_p177_05_a_second_run_keeps_the_snapshot_that_was_sent(): void
    {
        $this->travelTo('2026-10-01 08:00:00');
        $this->artisan('payouts:send-owner-statements', ['--period' => '2026-09'])->assertSuccessful();

        $this->travelTo('2026-11-20 10:00:00');
        $this->pendingRent->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => '2026-09-15 10:00:00'])->save();
        Cache::flush();
        $this->artisan('payouts:send-owner-statements', ['--period' => '2026-09'])->assertSuccessful();

        $row = DB::table('owner_statement_snapshots')->sole();
        $this->assertEquals(220000, json_decode($row->payload, true)['totals']['gross']);
        $this->assertSame('2026-10-01 08:00:00', (string) $row->sent_at);
    }
}
