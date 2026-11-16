<?php

namespace Tests\Feature\Accounting;

use App\Models\BookingPayment;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\ReconciliationIgnoredPayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\RapprochementFixture;

/**
 * TCK-2932 (AC1) — `POST/DELETE /api/agencies/{agency}/reconciliation/ignored-payments` : un paiement
 * qui n'aura jamais de ligne de banque sort du reste à rapprocher, et y revient. Rien d'autre ne
 * change : ni le paiement, ni une quittance, ni un reversement. Le geste est journalisé.
 */
class ReconciliationIgnorePaymentTest extends ApiTestCase
{
    use RapprochementFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRapprochement();
    }

    private function url(string $suffix = ''): string
    {
        return "/api/agencies/{$this->agency->id}/reconciliation/ignored-payments".$suffix;
    }

    /** @param  array<string, mixed>  $body */
    private function ignore(array $body, ?User $as = null): TestResponse
    {
        $this->actingAsApi($as ?? $this->admin);

        return $this->postJson($this->url(), $body);
    }

    /** @return list<int> */
    private function pendingIds(): array
    {
        $this->actingAsApi($this->admin);

        return collect($this->getJson("/api/agencies/{$this->agency->id}/reconciliation/pending-payments?period=2026-11&per_page=100")
            ->assertOk()->json('data'))->pluck('id')->all();
    }

    private function toReconcile(): int
    {
        $this->actingAsApi($this->admin);

        return $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/overview?period=2026-11")->assertOk()->json('data.to_reconcile.total');
    }

    public function test_ac1_ignorer_retire_du_reste_et_de_la_synthese_et_le_delete_l_y_remet(): void
    {
        $cash = $this->leasePayment(['amount' => 120000]);
        $other = $this->leasePayment(['payment_method' => PaymentMethod::BankTransfer]);
        $this->assertSame(2, $this->toReconcile());

        $row = $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $cash->id, 'reason' => 'cash_kept'])
            ->assertCreated()
            ->assertJsonPath('data.reason', 'cash_kept')
            ->assertJsonPath('data.ignored_by.id', $this->admin->id)
            ->assertJsonPath('data.payment.type', 'lease_payment')
            ->assertJsonPath('data.payment.id', $cash->id)
            ->json('data');

        $this->assertSame([$other->id], $this->pendingIds());
        $this->assertSame(1, $this->toReconcile());
        $overview = $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/overview?period=2026-11")->json('data');
        $this->assertSame(1, $overview['ignored']);
        $this->assertSame($overview['payments_total'], $overview['confirmed_automatically']['total'] + $overview['to_reconcile']['total'] + $overview['reconciled_manually'] + $overview['ignored']);

        // La liste des gestes, pour les défaire après un rechargement.
        $this->getJson($this->url('?period=2026-11'))->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $row['id']);
        $this->getJson($this->url('?period=2026-10'))->assertOk()->assertJsonPath('meta.total', 0);

        $this->deleteJson($this->url("/{$row['id']}"))->assertNoContent();

        $this->assertEqualsCanonicalizing([$cash->id, $other->id], $this->pendingIds());
        $this->assertSame(2, $this->toReconcile());
        $this->assertDatabaseCount('reconciliation_ignored_payments', 0);
    }

    public function test_le_paiement_n_est_jamais_ecrit_et_les_deux_gestes_sont_journalises(): void
    {
        $payment = $this->leasePayment();
        $before = DB::table('lease_payments')->where('id', $payment->id)->first();
        // L'horloge avance : un `touch()` ou un `save()` du paiement changerait son `updated_at`.
        $this->travel(5)->minutes();

        $id = $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $payment->id, 'reason' => 'other', 'note' => 'Versé au syndic'])
            ->assertCreated()->json('data.id');
        $this->assertEquals($before, DB::table('lease_payments')->where('id', $payment->id)->first());

        $this->deleteJson($this->url("/{$id}"))->assertNoContent();
        $this->assertEquals($before, DB::table('lease_payments')->where('id', $payment->id)->first());

        $events = Activity::query()->where('subject_type', LeasePayment::class)->where('subject_id', $payment->id)
            ->whereIn('event', ['payment_ignored', 'payment_unignored'])->orderBy('id')->get();
        // Aucun autre événement ne naît sur le paiement par ces gestes (le `created` de la fabrique est antérieur).
        $this->assertSame(0, Activity::query()->where('subject_type', LeasePayment::class)->where('subject_id', $payment->id)
            ->where('id', '>', $events->first()->id)->whereNotIn('event', ['payment_ignored', 'payment_unignored'])->count());
        $this->assertSame(['payment_ignored', 'payment_unignored'], $events->pluck('event')->all());
        foreach ($events as $event) {
            $this->assertSame($this->admin->id, (int) $event->causer_id);
            $this->assertSame('other', $event->properties['reason']);
            $this->assertSame('Versé au syndic', $event->properties['note']);
        }
    }

    public function test_un_acompte_de_reservation_s_ignore_aussi(): void
    {
        $payment = BookingPayment::factory()->create(['booking_id' => $this->booking()->id, 'status' => PaymentStatus::Paid,
            'paid_at' => '2026-11-04 10:00:00', 'payment_method' => PaymentMethod::Cash, 'amount' => 80000]);

        $this->ignore(['payable_type' => 'booking_payment', 'payable_id' => $payment->id, 'reason' => 'other_account'])->assertCreated();

        $this->assertSame([], $this->pendingIds());
    }

    public function test_ac1_un_agent_recoit_403_et_un_paiement_d_une_autre_agence_404(): void
    {
        $payment = $this->leasePayment();
        $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $payment->id, 'reason' => 'cash_kept'], $this->agent)->assertForbidden();

        $foreign = $this->leasePayment(['lease_id' => Lease::factory()->create(['agency_id' => $this->otherAgency->id])->id]);
        $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $foreign->id, 'reason' => 'cash_kept'])
            ->assertNotFound()->assertJsonPath('code', 'reconciliation.payment_not_found');

        // Le geste d'une autre agence ne se défait pas d'ici, ni par son agent.
        $theirs = ReconciliationIgnoredPayment::query()->create([
            'agency_id' => $this->otherAgency->id, 'payable_type' => LeasePayment::class, 'payable_id' => $foreign->id,
            'reason' => 'cash_kept', 'ignored_by_id' => $this->otherAdmin->id,
        ]);
        $this->actingAsApi($this->admin);
        $this->deleteJson($this->url("/{$theirs->id}"))->assertNotFound();
        $this->assertDatabaseHas('reconciliation_ignored_payments', ['id' => $theirs->id]);

        $mine = $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $payment->id, 'reason' => 'cash_kept'])->json('data.id');
        $this->actingAsApi($this->agent);
        $this->deleteJson($this->url("/{$mine}"))->assertForbidden();
        $this->getJson($this->url())->assertForbidden();
    }

    public function test_seul_un_paiement_du_reste_a_rapprocher_s_ignore_et_une_seule_fois(): void
    {
        $gateway = $this->leasePayment(['payment_method' => PaymentMethod::Wave, 'metadata' => $this->gatewaySettled('wave', 'wv_1'), 'marked_paid_at' => null]);
        $reconciled = $this->leasePayment(['bank_reconciled_at' => '2026-11-12 00:00:00']);
        $unpaid = $this->leasePayment(['status' => PaymentStatus::Pending, 'paid_at' => null]);
        foreach ([$gateway, $reconciled, $unpaid] as $payment) {
            $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $payment->id, 'reason' => 'cash_kept'])
                ->assertUnprocessable()->assertJsonPath('code', 'reconciliation.payment_not_pending');
        }

        $payment = $this->leasePayment();
        $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $payment->id, 'reason' => 'cash_kept'])->assertCreated();
        $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $payment->id, 'reason' => 'cash_kept'])
            ->assertUnprocessable()->assertJsonPath('code', 'reconciliation.payment_already_ignored');
        $this->assertDatabaseCount('reconciliation_ignored_payments', 1);
    }

    public function test_validation_du_corps(): void
    {
        $payment = $this->leasePayment();

        $this->ignore(['payable_type' => 'invoice', 'payable_id' => $payment->id, 'reason' => 'cash_kept'])->assertUnprocessable()->assertJsonValidationErrors('payable_type');
        $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $payment->id, 'reason' => 'lost'])->assertUnprocessable()->assertJsonValidationErrors('reason');
        // `other` exige sa note.
        $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $payment->id, 'reason' => 'other'])->assertUnprocessable()->assertJsonValidationErrors('note');
        $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => [$payment->id], 'reason' => 'cash_kept'])->assertUnprocessable();
        $this->assertDatabaseCount('reconciliation_ignored_payments', 0);
    }

    /** La liste des gestes en effet a pour total le `ignored` de la synthèse, même après un rapprochement. */
    public function test_la_liste_des_gestes_a_pour_total_le_compte_ignored_de_la_synthese(): void
    {
        $a = $this->leasePayment();
        $b = $this->leasePayment(['amount' => 90000]);
        $this->leasePayment(['paid_at' => '2026-10-10 09:00:00']);
        foreach ([$a, $b] as $payment) {
            $this->ignore(['payable_type' => 'lease_payment', 'payable_id' => $payment->id, 'reason' => 'cash_kept'])->assertCreated();
        }
        // Rapproché ensuite malgré tout : il compte rapproché, et sort de la liste des gestes.
        DB::table('lease_payments')->where('id', $b->id)->update(['bank_reconciled_at' => '2026-11-15 00:00:00']);

        $this->actingAsApi($this->admin);
        $overview = $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/overview?period=2026-11")->json('data');
        $listed = $this->getJson($this->url('?period=2026-11'))->assertOk();

        $this->assertSame(1, $overview['ignored']);
        $this->assertSame(1, $overview['reconciled_manually']);
        $this->assertSame($overview['ignored'], $listed->json('meta.total'));
        $this->assertSame($a->id, $listed->json('data.0.payment.id'));
    }
}
