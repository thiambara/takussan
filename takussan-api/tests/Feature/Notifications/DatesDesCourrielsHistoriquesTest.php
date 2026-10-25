<?php

namespace Tests\Feature\Notifications;

use App\Models\AccountDeletionRequest;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Task;
use App\Models\User;
use App\Notifications\AccountDeletionReminderNotification;
use App\Notifications\AccountDeletionRequestedNotification;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Notifications\LeaseEarlyTerminationNotification;
use App\Notifications\LeaseRenewedNotification;
use App\Notifications\LeaseRentReviewedNotification;
use App\Notifications\TaskDueReminderNotification;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\App;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2325 (P128.03) — les sept classes historiques (sans code) écrivent leurs dates par le
 * formateur du rendu par code : `LL` pour une date, `LLL` dans `users.timezone` pour une échéance,
 * SMS compris. Elles passaient `toDateString()`, `format('Y-m-d H:i')` en UTC ou `format('d/m/Y')`,
 * quelle que soit la langue du destinataire.
 */
class DatesDesCourrielsHistoriquesTest extends TestCase
{
    use RefreshDatabase;

    private const DATE_BRUTE = '#\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}#';

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-22 10:00:00');
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> */
    public static function attendus(): array
    {
        return [
            'renouvellement en' => ['renouvellement', 'en', 'November 1, 2026'],
            'renouvellement fr' => ['renouvellement', 'fr', '1 novembre 2026'],
            'résiliation anticipée en' => ['résiliation', 'en', 'December 15, 2026'],
            'résiliation anticipée fr' => ['résiliation', 'fr', '15 décembre 2026'],
            'relance de facture en' => ['relance', 'en', 'October 19, 2026'],
            'relance de facture fr' => ['relance', 'fr', '19 octobre 2026'],
            'révision de loyer en' => ['révision', 'en', 'November 1, 2026'],
            'révision de loyer fr' => ['révision', 'fr', '1 novembre 2026'],
            'rappel de tâche en' => ['tâche', 'en', 'October 23, 2026 10:00 AM'],
            'rappel de tâche fr' => ['tâche', 'fr', '23 octobre 2026 10:00'],
            'demande de suppression en' => ['suppression', 'en', 'November 21, 2026'],
            'demande de suppression fr' => ['suppression', 'fr', '21 novembre 2026'],
            'rappel de suppression en' => ['rappel de suppression', 'en', 'November 21, 2026'],
            'rappel de suppression fr' => ['rappel de suppression', 'fr', '21 novembre 2026'],
        ];
    }

    #[DataProvider('attendus')]
    public function test_le_courriel_ecrit_sa_date_dans_la_langue_du_destinataire(string $cas, string $langue, string $attendu): void
    {
        [$notification, $destinataire] = $this->fixtures()[$cas]();
        App::setLocale($langue);

        $texte = $this->texte($notification->toMail($destinataire));

        $this->assertStringContainsString($attendu, $texte);
        $this->assertDoesNotMatchRegularExpression(self::DATE_BRUTE, $texte);
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> */
    public static function sms(): array
    {
        return [
            'demande de suppression en' => ['suppression', 'en', 'November 21, 2026'],
            'demande de suppression fr' => ['suppression', 'fr', '21 novembre 2026'],
            'rappel de suppression en' => ['rappel de suppression', 'en', 'November 21, 2026'],
            'rappel de suppression fr' => ['rappel de suppression', 'fr', '21 novembre 2026'],
        ];
    }

    #[DataProvider('sms')]
    public function test_le_sms_ecrit_sa_date_dans_la_langue_du_destinataire(string $cas, string $langue, string $attendu): void
    {
        [$notification, $destinataire] = $this->fixtures()[$cas]();
        App::setLocale($langue);

        $texte = $notification->toSms($destinataire);

        $this->assertStringContainsString($attendu, $texte);
        $this->assertDoesNotMatchRegularExpression(self::DATE_BRUTE, $texte);
    }

    /**
     * La date d'un instant (la suppression du compte) est celle du fuseau du destinataire : à
     * 23 h 30 UTC, c'est déjà le lendemain à Tokyo.
     */
    public function test_la_date_d_un_instant_est_celle_du_fuseau_du_destinataire(): void
    {
        $destinataire = User::factory()->create(['timezone' => 'Asia/Tokyo']);
        $demande = AccountDeletionRequest::factory()->create([
            'user_id' => $destinataire->id,
            'scheduled_for' => Carbon::parse('2026-11-21 23:30:00', 'UTC'),
        ]);
        App::setLocale('en');

        $texte = $this->texte((new AccountDeletionRequestedNotification($demande))->toMail($destinataire));

        $this->assertStringContainsString('November 22, 2026', $texte);
    }

    /** @return array<string, Closure(): array{0: Notification, 1: User}> */
    private function fixtures(): array
    {
        $destinataire = fn (): User => User::factory()->create(['timezone' => 'Africa/Dakar']);

        return [
            'renouvellement' => fn () => [
                new LeaseRenewedNotification(
                    Lease::factory()->create(),
                    Lease::factory()->create(['start_date' => '2026-11-01', 'end_date' => '2027-10-31']),
                ),
                $destinataire(),
            ],
            'résiliation' => fn () => [
                new LeaseEarlyTerminationNotification(
                    Lease::factory()->create(['early_termination_effective_date' => '2026-12-15']),
                    LeaseEarlyTerminationNotification::TRANSITION_REQUESTED,
                ),
                $destinataire(),
            ],
            'relance' => fn () => [
                new InvoiceOverdueReminderNotification(Invoice::factory()->create(['due_date' => '2026-10-19']), 3),
                $destinataire(),
            ],
            'révision' => fn () => [
                new LeaseRentReviewedNotification(Lease::factory()->create(), 100000, 110000, 'Révision annuelle', '2026-11-01'),
                $destinataire(),
            ],
            'tâche' => fn () => [
                new TaskDueReminderNotification(Task::factory()->create(['due_at' => Carbon::parse('2026-10-23 14:00:00', 'UTC')])),
                User::factory()->create(['timezone' => 'America/New_York']),
            ],
            'suppression' => fn () => [
                new AccountDeletionRequestedNotification(AccountDeletionRequest::factory()->create([
                    'scheduled_for' => Carbon::parse('2026-11-21 10:00:00', 'UTC'),
                ])),
                $destinataire(),
            ],
            'rappel de suppression' => fn () => [
                new AccountDeletionReminderNotification(AccountDeletionRequest::factory()->create([
                    'scheduled_for' => Carbon::parse('2026-11-21 10:00:00', 'UTC'),
                ])),
                $destinataire(),
            ],
        ];
    }

    /** Le sujet et les lignes du courriel, sans le gabarit HTML (ses liens portent des chiffres). */
    private function texte(MailMessage $message): string
    {
        return implode("\n", [(string) $message->subject, ...$message->introLines, ...$message->outroLines]);
    }
}
