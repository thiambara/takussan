<?php

namespace Tests\Feature\Api;

use App\Exceptions\ApiError;
use App\Http\Resources\LeasePaymentResource;
use App\Jobs\GenerateLeasePaymentSchedule;
use App\Jobs\Lease\ApplyLateFeesJob;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\LateFeeCalculator;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Model\LeasePaymentService;
use App\Services\Model\LeaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-596 (VERIF-596 passe 5, M-E) — un renouvellement à mi-terme ne facture aucun mois deux fois.
 *
 * Avant : `renew` ramenait la fin du parent à la veille du début de l'enfant sans toucher à ses
 * échéances, et §4A générait l'échéancier de l'enfant — chaque mois du chevauchement était facturé
 * deux fois, pénalités de retard comprises. Les échéances de loyer du parent dues à partir du début
 * de l'enfant passent `cancelled` ; une échéance déjà réglée dans la zone rend 409 ; pour un enfant
 * `pending_signature`, la coupure du parent attend son activation.
 */
class LeaseRenewalOverlapTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        Storage::fake(config('media-library.disk_name'));
    }

    /** Un bail actif, son échéancier généré (le 5 de chaque mois). */
    private function parent(array $attributes = []): Lease
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create($attributes + [
            'property_id' => Property::factory()->create(['user_id' => $landlord->id])->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create(['user_id' => User::factory()->create()->id])->id,
            'status' => LeaseStatus::Active,
            'monthly_rent' => 100_000,
            'payment_frequency' => 'monthly',
            'payment_day' => 5,
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 0,
            'start_date' => now()->subMonths(2)->toDateString(),
            'end_date' => now()->addMonths(8)->toDateString(),
        ]);
        app(LeaseService::class)->generateSchedule($lease);
        Sanctum::actingAs($landlord);

        return $lease->fresh();
    }

    private function renew(Lease $parent, array $body): TestResponse
    {
        return $this->postJson("/api/leases/{$parent->id}/renew", $body);
    }

    private function child(Lease $parent): Lease
    {
        return Lease::query()->where('renewed_from_lease_id', $parent->id)->firstOrFail();
    }

    /** La génération de l'échéancier que l'activation a mise en file, exécutée pour de vrai. */
    private function runChildSchedule(Lease $child): void
    {
        Bus::assertDispatched(GenerateLeasePaymentSchedule::class, fn ($job) => $job->lease->id === $child->id);
        (new GenerateLeasePaymentSchedule($child->fresh()))->handle(app(LeaseService::class));
    }

    /** @return array<string, float> mois → montant des échéances de loyer encore dues */
    private function openRentByMonth(Lease $lease): array
    {
        return LeasePayment::query()->where('lease_id', $lease->id)
            ->where('payment_type', LeasePaymentType::Rent->value)
            ->whereIn('status', [PaymentStatus::Pending->value, PaymentStatus::Late->value, PaymentStatus::PartiallyPaid->value])
            ->get()->mapWithKeys(fn (LeasePayment $p) => [$p->due_date->format('Y-m') => (float) $p->amount])->all();
    }

    /** @return list<string> */
    private function doubledMonths(Lease $parent, Lease $child): array
    {
        return array_keys(array_intersect_key($this->openRentByMonth($parent), $this->openRentByMonth($child)));
    }

    private function cancelledCount(Lease $lease): int
    {
        return LeasePayment::query()->where('lease_id', $lease->id)->where('status', PaymentStatus::Cancelled->value)->count();
    }

    /** Une échéance du parent dans la zone de chevauchement, réglée (ou en partie). */
    private function settleDueAfter(Lease $parent, Carbon $from, array $attributes): LeasePayment
    {
        $due = LeasePayment::query()->where('lease_id', $parent->id)->whereDate('due_date', '>=', $from)->orderBy('due_date')->firstOrFail();
        $due->forceFill($attributes)->saveQuietly();

        return $due;
    }

    public function test_a_mid_term_renewal_bills_each_month_once(): void
    {
        $parent = $this->parent();
        $start = now()->addDay();

        $this->renew($parent, ['start_date' => $start->toDateString(), 'end_date' => $start->copy()->addYear()->toDateString()])->assertCreated();
        $child = $this->child($parent);
        $this->assertSame(LeaseStatus::Active, $child->status);
        $this->runChildSchedule($child);

        $this->assertSame([], $this->doubledMonths($parent, $child));
        $cancelled = LeasePayment::query()->where('lease_id', $parent->id)->where('status', PaymentStatus::Cancelled->value)->get();
        $this->assertNotEmpty($cancelled);
        $this->assertTrue($cancelled->every(fn (LeasePayment $p) => $p->due_date->gte($start->copy()->startOfDay())));
        $this->assertSame(0, LeasePayment::query()->where('lease_id', $parent->id)->where('status', PaymentStatus::Pending->value)
            ->whereDate('due_date', '>=', $start)->count());
        $logged = Activity::query()->where('event', 'lease_renewal_schedule_cancelled')->where('subject_id', $parent->id)->sole();
        $this->assertEqualsCanonicalizing($cancelled->pluck('reference_number')->all(), $logged->properties['cancelled']);

        // Les échéances annulées ne prennent aucune pénalité de retard.
        $this->travelTo(now()->addMonths(3));
        app(ApplyLateFeesJob::class)->handle(app(LateFeeCalculator::class));
        $this->assertSame(0, LeasePayment::query()->where('lease_id', $parent->id)->where('status', PaymentStatus::Cancelled->value)
            ->whereNotNull('late_fee_applied_at')->count());
    }

    /**
     * Enfant `pending_signature` (m-d : un terme signé change) : le parent garde son bail, sa fin et
     * son échéancier tant que l'enfant n'est pas signé ; à l'activation, la coupure et l'annulation.
     */
    public function test_a_mid_term_renewal_awaiting_signature_leaves_the_parent_intact_until_activation(): void
    {
        $parent = $this->parent(['early_termination_penalty_months' => 2, 'rent_review_max_pct' => 10]);
        $end = $parent->end_date->toDateString();
        $start = now()->addDay();

        $this->renew($parent, ['start_date' => $start->toDateString(), 'end_date' => $start->copy()->addYear()->toDateString(), 'monthly_rent' => 150_000])
            ->assertCreated();
        $child = $this->child($parent);

        $this->assertSame(LeaseStatus::PendingSignature, $child->status);
        $this->assertSame(LeaseStatus::Active, $parent->fresh()->status);
        $this->assertSame($end, $parent->fresh()->end_date->toDateString());
        $this->assertSame(0, $this->cancelledCount($parent));

        app(LeaseSignatureService::class)->signOnPaper($child, UploadedFile::fake()->create('avenant.pdf', 20, 'application/pdf'), $child->landlord);
        $this->runChildSchedule($child);

        $this->assertSame(LeaseStatus::Active, $child->fresh()->status);
        $this->assertSame(LeaseStatus::Renewed, $parent->fresh()->status);
        $this->assertSame($start->copy()->subDay()->toDateString(), $parent->fresh()->end_date->toDateString());
        $this->assertGreaterThan(0, $this->cancelledCount($parent));
        $this->assertSame([], $this->doubledMonths($parent, $child));
    }

    /** Parent sans fin (douze échéances), renouvelé avec la date par défaut du front : aujourd'hui. */
    public function test_an_open_ended_parent_renewed_from_today_bills_each_month_once(): void
    {
        $parent = $this->parent(['end_date' => null]);

        $this->renew($parent, ['start_date' => now()->toDateString(), 'end_date' => now()->addYear()->toDateString()])->assertCreated();
        $child = $this->child($parent);
        $this->runChildSchedule($child);

        $this->assertSame([], $this->doubledMonths($parent, $child));
        $this->assertGreaterThan(0, $this->cancelledCount($parent));
    }

    /** Une échéance réglée (ou en partie) dans le chevauchement : 409, rien ne bouge. */
    public function test_a_settled_due_in_the_overlap_refuses_the_renewal(): void
    {
        foreach ([
            'payée' => ['status' => PaymentStatus::Paid->value, 'paid_at' => now()],
            'en partie' => ['status' => PaymentStatus::PartiallyPaid->value, 'metadata' => ['paid_amount' => 40_000]],
            'acompte sur une échéance en attente' => ['metadata' => ['paid_amount' => 10_000]],
            'pénalité de retard payée' => ['status' => PaymentStatus::Late->value, 'late_fee_paid_at' => now()],
            'paiement en ligne ouvert' => ['metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'tx-overlap', 'checkout_url' => 'https://pay.test/tx-overlap', 'initiated_at' => now()->toIso8601String()]]],
        ] as $label => $settlement) {
            $parent = $this->parent();
            $end = $parent->end_date->toDateString();
            $start = now()->addDay();
            $settled = $this->settleDueAfter($parent, $start, $settlement);

            $this->renew($parent, ['start_date' => $start->toDateString(), 'end_date' => $start->copy()->addYear()->toDateString()])
                ->assertStatus(409)
                ->assertJsonPath('code', 'lease.renewal_overlaps_paid_schedule')
                ->assertJsonPath('payments.0.reference_number', $settled->reference_number);

            $this->assertSame(0, Lease::query()->where('renewed_from_lease_id', $parent->id)->count(), $label);
            $this->assertSame(LeaseStatus::Active, $parent->fresh()->status, $label);
            $this->assertSame($end, $parent->fresh()->end_date->toDateString(), $label);
            $this->assertSame(0, $this->cancelledCount($parent), $label);
        }
    }

    /** Le contrôle se rejoue à l'activation d'un enfant en attente : une échéance réglée entre-temps. */
    public function test_a_due_settled_before_the_child_activation_refuses_the_activation(): void
    {
        $parent = $this->parent(['early_termination_penalty_months' => 2]);
        $start = now()->addDay();
        $this->renew($parent, ['start_date' => $start->toDateString(), 'end_date' => $start->copy()->addYear()->toDateString(), 'monthly_rent' => 150_000])
            ->assertCreated();
        $child = $this->child($parent);
        $this->settleDueAfter($parent, $start, ['status' => PaymentStatus::Paid->value, 'paid_at' => now()]);

        try {
            app(LeaseSignatureService::class)->signOnPaper($child, UploadedFile::fake()->create('avenant.pdf', 20, 'application/pdf'), $child->landlord);
            $this->fail('l\'activation a coupé un parent dont une échéance du chevauchement est réglée');
        } catch (ApiError $e) {
            $this->assertSame('lease.renewal_overlaps_paid_schedule', $e->errorCode);
        }

        $this->assertSame(LeaseStatus::PendingSignature, $child->fresh()->status);
        $this->assertSame(LeaseStatus::Active, $parent->fresh()->status);
        $this->assertSame(0, $this->cancelledCount($parent));
    }

    /**
     * VERIF-596 passe 6 (M-F, sonde E6) — pendant que l'avenant attend sa signature, le parent part
     * en préavis ou est résilié. L'activation de l'enfant ne le relevait pas et passait quand même :
     * huit mois facturés deux fois. Elle rend 409, comme `renew` sur un tel parent ; le contrat signé
     * n'est pas écrit sur le disque, l'enfant n'a pas d'échéancier, le parent reste tel quel.
     */
    public function test_a_renewal_whose_parent_is_leaving_cannot_take_effect(): void
    {
        foreach ([
            'préavis' => [LeaseStatus::Terminating, fn (Lease $p) => $this->postJson("/api/leases/{$p->id}/early-termination", [
                'effective_date' => now()->addDays(45)->toDateString(), 'reason' => 'Départ',
            ])->assertCreated()],
            'résilié' => [LeaseStatus::Terminated, fn (Lease $p) => $this->postJson("/api/leases/{$p->id}/terminate", [])->assertOk()],
        ] as $label => [$status, $leave]) {
            $parent = $this->parent(['early_termination_penalty_months' => 2]);
            $start = now()->addDay();
            $this->renew($parent, ['start_date' => $start->toDateString(), 'end_date' => $start->copy()->addYear()->toDateString(), 'monthly_rent' => 150_000])
                ->assertCreated();
            $child = $this->child($parent);
            $leave($parent);

            $this->post("/api/leases/{$child->id}/activate", ['contract' => UploadedFile::fake()->create('avenant.pdf', 20, 'application/pdf')], ['Accept' => 'application/json'])
                ->assertStatus(409)
                ->assertJsonPath('code', 'lease.renewal_parent_not_renewable');

            $this->assertSame(LeaseStatus::PendingSignature, $child->fresh()->status, $label);
            $this->assertNull($child->fresh()->contract_sha256, $label);
            $this->assertSame($status, $parent->fresh()->status, $label);
            $this->assertSame(0, $this->cancelledCount($parent), $label);
            $this->assertSame([], $this->openRentByMonth($child), $label);
            Bus::assertNotDispatched(GenerateLeasePaymentSchedule::class, fn ($job) => $job->lease->id === $child->id);
            $this->assertSame([], Storage::disk(config('media-library.disk_name'))->allFiles(), "{$label} : contrat laissé sur le disque");
        }
    }

    /**
     * Un enfant en attente né avant la passe 5 a déjà relevé son parent (`renewed`) à sa création :
     * son activation passe, sans seconde relève.
     */
    public function test_a_pending_child_whose_parent_was_already_renewed_activates(): void
    {
        $parent = $this->parent(['early_termination_penalty_months' => 2]);
        $this->renew($parent, ['monthly_rent' => 150_000])->assertCreated();
        $child = $this->child($parent);
        $parent->forceFill(['status' => LeaseStatus::Renewed])->saveQuietly();

        app(LeaseSignatureService::class)->signOnPaper($child, UploadedFile::fake()->create('avenant.pdf', 20, 'application/pdf'), $child->landlord);

        $this->assertSame(LeaseStatus::Active, $child->fresh()->status);
        $this->assertSame(0, $this->cancelledCount($parent));
    }

    /**
     * VERIF-596 passe 6 (M-G, sonde E5) — l'encaissement manuel lisait l'échéance AVANT le
     * renouvellement et écrivait `paid` après : l'argent du guichet sur une échéance annulée du
     * parent, le même mois facturé par l'enfant. Relue sous verrou, une échéance annulée rend 409.
     */
    public function test_a_due_cancelled_since_it_was_read_cannot_be_marked_paid(): void
    {
        // Le service, sur une instance lue avant le renouvellement.
        $parent = $this->parent();
        $start = now()->addDay();
        $bound = LeasePayment::query()->where('lease_id', $parent->id)->whereDate('due_date', '>=', $start)->orderBy('due_date')->firstOrFail();
        $this->renew($parent, ['start_date' => $start->toDateString(), 'end_date' => $start->copy()->addYear()->toDateString()])->assertCreated();
        $this->assertSame(PaymentStatus::Cancelled, $bound->fresh()->status);
        $this->assertSame(PaymentStatus::Pending, $bound->status);

        try {
            app(LeasePaymentService::class)->markPaid($bound, ['payment_method' => 'cash']);
            $this->fail('une échéance annulée a été encaissée');
        } catch (ApiError $e) {
            $this->assertSame('lease_payment.cancelled', $e->errorCode);
        }
        $this->assertSame(PaymentStatus::Cancelled, $bound->fresh()->status);

        // La route : l'annulation validée entre la liaison et l'écriture.
        $parent = $this->parent();
        $due = LeasePayment::query()->where('lease_id', $parent->id)->orderByDesc('due_date')->firstOrFail();
        $slipped = false;
        LeasePayment::retrieved(function (LeasePayment $model) use ($due, &$slipped): void {
            if (! $slipped && $model->id === $due->id) {
                $slipped = true;
                LeasePayment::query()->whereKey($due->id)->update(['status' => PaymentStatus::Cancelled->value]);
            }
        });

        $this->postJson("/api/lease-payments/{$due->id}/mark-paid", ['payment_method' => 'cash'])
            ->assertStatus(409)->assertJsonPath('code', 'lease_payment.cancelled');
        $this->assertTrue($slipped);
        $this->assertSame(PaymentStatus::Cancelled, $due->fresh()->status);
        $this->assertNull($due->fresh()->paid_at);
    }

    /**
     * VERIF-596 passe 6 (m-h, m-k P6-ME.9, sonde E4) — un enfant qui commence à une date passée : les
     * échéances du chevauchement sont `late`, pénalité posée et non réglée. Elles s'annulent (pas
     * seulement les `pending`), et leur pénalité avec : rien à régler, ni en ligne ni à l'agence, et
     * le job ne la repose pas.
     */
    public function test_late_dues_in_the_overlap_are_cancelled_with_their_late_fee(): void
    {
        $parent = $this->parent([
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
        ]);
        app(ApplyLateFeesJob::class)->handle(app(LateFeeCalculator::class));
        $start = now()->subMonths(2);
        $late = LeasePayment::query()->where('lease_id', $parent->id)->where('status', PaymentStatus::Late->value)
            ->whereDate('due_date', '>=', $start)->pluck('id');
        $this->assertNotEmpty($late, 'aucune échéance en retard dans le chevauchement : le test ne mesure rien');
        // Lue par le job AVANT le renouvellement (encore `pending`), traitée après.
        $stale = LeasePayment::query()->where('lease_id', $parent->id)->whereDate('due_date', '>', now())->orderBy('due_date')->firstOrFail();

        $this->renew($parent, ['start_date' => $start->toDateString(), 'end_date' => $start->copy()->addYear()->toDateString()])->assertCreated();
        $child = $this->child($parent);
        $this->runChildSchedule($child);

        $this->assertSame([], $this->doubledMonths($parent, $child));
        foreach (LeasePayment::query()->whereIn('id', $late)->get() as $due) {
            $this->assertSame(PaymentStatus::Cancelled, $due->status);
            $this->assertGreaterThan(0, (float) $due->late_fee_amount);
            $this->assertSame(0.0, $due->lateFeeOutstanding());
            $this->assertSame(0.0, LeasePaymentResource::make($due)->toArray(request())['late_fee_outstanding']);

            $this->postJson("/api/lease-payments/{$due->id}/late-fee/mark-paid", [])
                ->assertStatus(422)->assertJsonPath('code', 'lease_payment.cancelled');
            $this->assertNull($due->fresh()->late_fee_paid_at);
        }

        // Rejugé sous verrou : le job a lu l'échéance `pending`, le renouvellement l'a annulée depuis.
        $this->travelTo(now()->addMonths(3));
        $this->assertSame(PaymentStatus::Pending, $stale->status);
        $this->assertSame(PaymentStatus::Cancelled, $stale->fresh()->status);
        $this->assertSame(0.0, app(LateFeeCalculator::class)->apply($stale));
        $this->assertSame(PaymentStatus::Cancelled, $stale->fresh()->status);
        $this->assertNull($stale->fresh()->late_fee_applied_at);
    }

    /** À terme (fin + 1) : rien à annuler, rien ne change. */
    public function test_a_renewal_at_term_is_unchanged(): void
    {
        $parent = $this->parent();
        $end = $parent->end_date->copy();

        $this->renew($parent, ['start_date' => $end->copy()->addDay()->toDateString(), 'end_date' => $end->copy()->addYear()->toDateString()])->assertCreated();
        $child = $this->child($parent);
        $this->runChildSchedule($child);

        $this->assertSame(LeaseStatus::Renewed, $parent->fresh()->status);
        $this->assertSame($end->toDateString(), $parent->fresh()->end_date->toDateString());
        $this->assertSame(0, $this->cancelledCount($parent));
        $this->assertSame([], $this->doubledMonths($parent, $child));
    }
}
