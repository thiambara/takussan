<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Accounting\BankStatementImported;
use App\Events\Permissions\RoleDelegationActivated;
use App\Listeners\Accounting\NotifyStatementImported;
use App\Listeners\Permissions\NotifyDelegationActivated;
use App\Models\AppNotification;
use App\Models\BankStatement;
use App\Models\Enums\Currency;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-588, AC2 — une notification est rendue dans la langue de son DESTINATAIRE, sur chaque
 * surface, quelle que soit la langue de l'application, de l'acteur ou du worker.
 */
class NotificationLocaleTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, mixed> */
    private array $params;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        app()->setLocale('fr');
        $this->params = [
            'amount' => NotificationRenderer::money(150000, 'XOF'),
            'days' => 7,
            'due_date' => '2026-09-29',
            'property' => 'Villa Almadies',
        ];
    }

    private function inLocale(string $locale, \Closure $callback): mixed
    {
        $previous = app()->getLocale();
        app()->setLocale($locale);
        try {
            return $callback();
        } finally {
            app()->setLocale($previous);
        }
    }

    /** @return array<string, array{string}> */
    public static function langues(): array
    {
        return ['en' => ['en'], 'wo' => ['wo']];
    }

    #[DataProvider('langues')]
    public function test_le_destinataire_recoit_sa_langue_en_in_app_e_mail_et_sms(string $locale): void
    {
        $tenant = User::factory()->create(['preferred_language' => $locale, 'phone_verified_at' => now()]);

        app(NotificationService::class)->send($tenant, NotificationCode::LeasePaymentOverdue, $this->params, NotificationTarget::of('lease', 12));

        $row = AppNotification::query()->where('user_id', $tenant->id)->sole();
        $this->assertSame('lease_payment.overdue', $row->code);
        $this->assertEquals($this->params, $row->params); // jsonb ne garde pas l'ordre des clés
        $expectedBody = trans_choice('notifications.codes.lease_payment.overdue.body', 7, [
            'amount' => app(CurrencyFormatter::class)->format(150000, Currency::XOF, $locale),
            'days' => 7,
            'due_date' => Carbon::parse('2026-09-29')->locale($locale)->isoFormat('LL'),
            'property' => 'Villa Almadies',
        ], $locale);
        $this->assertSame($expectedBody, $row->body);
        $this->assertNotSame(trans_choice('notifications.codes.lease_payment.overdue.body', 7, [], 'fr'), $row->body);

        Notification::assertSentTo($tenant, CodedNotification::class, function (CodedNotification $n, array $channels, User $to, ?string $sentLocale) use ($locale, $expectedBody) {
            $mail = $this->inLocale($sentLocale, fn () => $n->toMail($to));
            $sms = $this->inLocale($sentLocale, fn () => $n->toSms($to));

            return $sentLocale === $locale
                && in_array('mail', $channels, true)
                && $mail->subject === __('notifications.codes.lease_payment.overdue.title', [], $locale)
                && in_array($expectedBody, $mail->introLines, true)
                && str_contains($sms, 'Villa Almadies')
                && $sms === $this->inLocale($locale, fn () => app(NotificationRenderer::class)->render(NotificationCode::LeasePaymentOverdue, $this->params, $locale, null, 'sms'));
        });
    }

    public function test_une_ligne_ecrite_pour_un_destinataire_fr_se_lit_en_anglais_sous_accept_language_en(): void
    {
        $user = User::factory()->create(['preferred_language' => 'fr']);
        app(NotificationService::class)->send($user, NotificationCode::LeasePaymentOverdue, $this->params);
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/notifications', ['Accept-Language' => 'en'])->assertOk();

        $this->assertSame(__('notifications.codes.lease_payment.overdue.title', [], 'en'), $response->json('data.0.title'));
        $this->assertNotSame(AppNotification::query()->sole()->title, $response->json('data.0.title'));
    }

    public function test_delegation_acteur_fr_beneficiaire_wo(): void
    {
        $delegation = RoleDelegation::factory()->create([
            'user_id' => User::factory()->create(['preferred_language' => 'wo'])->id,
            'delegator_id' => User::factory()->create(['preferred_language' => 'fr'])->id,
        ]);

        app()->setLocale('fr');
        app(NotifyDelegationActivated::class)->handle(new RoleDelegationActivated($delegation));

        $title = AppNotification::query()->where('user_id', $delegation->user_id)->sole()->title;
        $this->assertSame(__('notifications.codes.role_delegation.activated.title', ['role' => 'agent'], 'wo'), $title);
        $this->assertNotSame(__('notifications.codes.role_delegation.activated.title', ['role' => 'agent'], 'en'), $title);
    }

    public function test_releve_importe_par_un_worker_fr_pour_un_destinataire_en(): void
    {
        $statement = BankStatement::factory()->create([
            'uploaded_by' => User::factory()->create(['preferred_language' => 'en'])->id,
            'lines_count' => 12,
        ]);

        app()->setLocale('fr');
        app(NotifyStatementImported::class)->handle(new BankStatementImported($statement));

        $row = AppNotification::query()->where('user_id', $statement->uploaded_by)->sole();
        $this->assertSame(__('notifications.codes.bank_statement.imported.title', [], 'en'), $row->title);
        $this->assertStringContainsString('12 lines', $row->body);
    }

    public function test_le_sujet_du_rappel_de_visite_wo_n_est_pas_le_repli_anglais(): void
    {
        $visitor = User::factory()->create(['preferred_language' => 'wo']);
        $params = ['property' => 'Villa Almadies', 'scheduled_at' => '2026-10-08T10:00:00+00:00', 'window' => '24h'];

        app(NotificationService::class)->send($visitor, NotificationCode::VisitReminder, $params);

        Notification::assertSentTo($visitor, CodedNotification::class, function (CodedNotification $n, array $channels, User $to, ?string $locale) {
            $subject = $this->inLocale($locale, fn () => $n->toMail($to)->subject);

            return $subject === __('notifications.codes.visit.reminder.title', ['property' => 'Villa Almadies'], 'wo')
                && $subject !== __('notifications.codes.visit.reminder.title', ['property' => 'Villa Almadies'], 'en');
        });
    }
}
