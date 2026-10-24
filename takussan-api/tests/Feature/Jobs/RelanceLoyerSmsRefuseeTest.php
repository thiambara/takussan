<?php

namespace Tests\Feature\Jobs;

use App\Jobs\SendLeasePaymentReminders;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * P207.01 (TCK-2157) — la relance de loyer d'un locataire sans compte part au plus une fois
 * (TCK-740) ; quand tous les fournisseurs SMS la refusent, le canal écrit l'activité alertable
 * `ops_critical_job_failed`, rattachée à l'échéance, sans le numéro ni les paramètres. Un échec
 * ambigu n'écrit rien, et rien ne renvoie (`docs/features.md`, relances de loyer).
 *
 * Rouge avant le correctif : le routeur change tout refus en `SmsResult::failed` sans lever, le job
 * réussit, et aucune trace ne disait quelle relance était perdue.
 */
class RelanceLoyerSmsRefuseeTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    /** Le sort que le faux routeur rend : `sent`, `failed` ou `ambiguous`. */
    public static string $sort = 'failed';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        self::$sort = 'failed';
        $this->sms = new class extends FakeSmsRouter
        {
            public function send(array|string $to, string $message, array $context = []): array
            {
                $results = [];
                foreach ((array) $to as $recipient) {
                    $number = PhoneNumber::normalize($recipient);
                    $this->sent[] = ['to' => $number, 'message' => $message, 'context' => $context];
                    $results[$number] = match (RelanceLoyerSmsRefuseeTest::$sort) {
                        'failed' => SmsResult::failed($number, 'fake', 'refused'),
                        'ambiguous' => SmsResult::failed($number, 'fake', 'timeout', ambiguous: true),
                        default => SmsResult::sent($number, 'fake', 'fake_'.count($this->sent)),
                    };
                }

                return $results;
            }
        };
        app()->instance(SmsRouterDriver::class, $this->sms);
        Carbon::setTestNow('2026-09-30 08:00:00');
    }

    public function test_une_relance_refusee_par_tous_les_fournisseurs_laisse_une_activite_rattachee_a_l_echeance(): void
    {
        $payment = $this->echeance();

        $this->relancer();

        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        $activite = Activity::query()->where('event', 'ops_critical_job_failed')->sole();
        $this->assertSame($payment->getMorphClass(), $activite->subject_type);
        $this->assertSame($payment->id, (int) $activite->subject_id);
        $this->assertSame('lease_payment.overdue', $activite->properties['code'] ?? null);
        $this->assertSame('sms', $activite->properties['channel'] ?? null);
        $this->assertStringNotContainsString('771234567', json_encode($activite->properties->toArray()));
        $this->assertStringNotContainsString('150', json_encode($activite->properties->toArray()), 'ni le montant');

        // Au plus une fois : le lendemain, dans la fenêtre de rattrapage, rien ne repart.
        Carbon::setTestNow('2026-10-01 08:00:00');
        $this->relancer();
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        $this->assertSame(1, Activity::query()->where('event', 'ops_critical_job_failed')->count());
    }

    /** @return array<string, array{0: string}> */
    public static function sortsSansTrace(): array
    {
        return ['accepté' => ['sent'], 'échec ambigu' => ['ambiguous']];
    }

    #[DataProvider('sortsSansTrace')]
    public function test_une_relance_acceptee_ou_ambigue_n_ecrit_rien(string $sort): void
    {
        self::$sort = $sort;
        $this->echeance();

        $this->relancer();

        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        $this->assertSame(0, Activity::query()->where('event', 'ops_critical_job_failed')->count());
    }

    private function echeance(): LeasePayment
    {
        $tenant = Customer::factory()->create(['user_id' => null, 'phone' => '+221 77 123 45 67']);
        $lease = Lease::factory()->active()->create(['tenant_id' => $tenant->id]);

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 150000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Late,
            'due_date' => '2026-09-29',
        ]);
    }

    private function relancer(): void
    {
        app()->call([new SendLeasePaymentReminders, 'handle']);
    }
}
