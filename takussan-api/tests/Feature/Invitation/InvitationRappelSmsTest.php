<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Invitation;
use App\Services\Invitation\InvitationService;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * P179.01 (TCK-2155) — le rappel automatique d'une invitation adressée à un numéro relit le sort
 * de son SMS : il part HORS FILE, et n'est tenu pour posé que sur un `sent`, un `failed` ambigu
 * (le fournisseur a pu le recevoir) ou un report de nuit. Un refus sûr se retente, un essai par
 * jour, trois au plus (`invitations.reminder_attempts`, `last_reminded_at` = dernier essai).
 *
 * Rouge avant le correctif : sous `queue.default=database`, le rappel était mis en file et marqué
 * aussitôt ; un SMS refusé par tous les fournisseurs n'était jamais retenté.
 */
class InvitationRappelSmsTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000803';

    private FakeSmsRouter $sms;

    /** Le sort que le faux routeur rend : `sent`, `failed`, `ambiguous` ou `quiet`. */
    public static string $sort = 'sent';

    protected function setUp(): void
    {
        parent::setUp();
        self::$sort = 'sent';
        config(['auth.phone_login.enabled' => true]);
        Mail::fake();
        $this->sms = new class extends FakeSmsRouter
        {
            public function send(array|string $to, string $message, array $context = []): array
            {
                $results = [];
                foreach ((array) $to as $recipient) {
                    $number = PhoneNumber::normalize($recipient);
                    $this->sent[] = ['to' => $number, 'message' => $message, 'context' => $context];
                    $results[$number] = match (InvitationRappelSmsTest::$sort) {
                        'failed' => SmsResult::failed($number, 'fake', 'refused'),
                        'ambiguous' => SmsResult::failed($number, 'fake', 'timeout', ambiguous: true),
                        'quiet' => SmsResult::deferred($number, 'router', 'quiet_hours'),
                        default => SmsResult::sent($number, 'fake', 'fake_'.count($this->sent)),
                    };
                }

                return $results;
            }
        };
        app()->instance(SmsRouterDriver::class, $this->sms);

        $this->travelTo(now()->setDate(2026, 10, 20)->setTime(12, 0));
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'phone' => self::NUMERO,
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
        ])->assertCreated();
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));

        // La production met les notifications en file : le rappel ne doit pas en dépendre.
        config(['queue.default' => 'database']);
        $this->travel(InvitationService::REMINDER_OFFSET_DAYS + 1)->days();
    }

    public function test_un_rappel_refuse_par_tous_les_fournisseurs_se_retente_un_jour_sur_trois_au_plus(): void
    {
        self::$sort = 'failed';

        $this->rappeler();
        $this->assertSame(2, $this->envois(), 'le rappel part hors file, dans la tâche');
        $this->assertSame(0, DB::table('jobs')->count(), 'rien n\'est mis en file');
        $this->assertSame(1, $this->invitation()->reminder_attempts);
        $this->assertNotNull($this->invitation()->last_reminded_at);

        $this->travel(1)->hours();
        $this->rappeler();
        $this->assertSame(2, $this->envois(), 'un essai par jour au plus');

        $this->travel(1)->days();
        $this->rappeler();
        $this->travel(1)->days();
        $this->rappeler();
        $this->assertSame(4, $this->envois());
        $this->assertSame(3, $this->invitation()->reminder_attempts);

        $this->travel(1)->days();
        $this->rappeler();
        $this->assertSame(4, $this->envois(), 'trois essais au plus');
    }

    public function test_un_rappel_refuse_puis_accepte_n_est_plus_retente(): void
    {
        self::$sort = 'failed';
        $this->rappeler();

        self::$sort = 'sent';
        $this->travel(1)->days();
        $this->rappeler();
        $this->travel(1)->days();
        $this->rappeler();

        $this->assertSame(3, $this->envois());
    }

    /** @return array<string, array{0: string}> */
    public static function sortsPoses(): array
    {
        return [
            'accepté' => ['sent'],
            'échec ambigu' => ['ambiguous'],
            'reporté à la nuit' => ['quiet'],
        ];
    }

    #[DataProvider('sortsPoses')]
    public function test_un_rappel_accepte_ambigu_ou_reporte_est_pose_et_ne_repart_pas(string $sort): void
    {
        self::$sort = $sort;

        $this->rappeler();
        $this->assertSame(2, $this->envois());
        $this->assertSame(0, DB::table('jobs')->count());
        $this->assertNotNull($this->invitation()->last_reminded_at);

        $this->travel(1)->days();
        $this->rappeler();
        $this->assertSame(2, $this->envois());
    }

    public function test_la_relance_remet_le_compte_des_essais_a_zero(): void
    {
        self::$sort = 'failed';
        $this->rappeler();
        $this->assertSame(1, $this->invitation()->reminder_attempts);

        $this->postJson('/api/invitations/'.$this->invitation()->id.'/resend')->assertOk();

        $this->assertSame(0, $this->invitation()->reminder_attempts);
        $this->assertNull($this->invitation()->last_reminded_at);
    }

    public function test_une_invitation_rappelee_avant_le_compte_des_essais_n_est_pas_rappelee_de_nouveau(): void
    {
        $this->invitation()->forceFill(['last_reminded_at' => now()->subDays(2), 'reminder_attempts' => 0])->save();

        $this->rappeler();

        $this->assertSame(1, $this->envois());
    }

    private function rappeler(): void
    {
        app(InvitationService::class)->remindPending();
    }

    private function envois(): int
    {
        return count($this->sms->sentTo(self::NUMERO));
    }

    private function invitation(): Invitation
    {
        return Invitation::query()->sole();
    }
}
