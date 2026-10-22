<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Http\Controllers\NotificationUnsubscribeController;
use App\Mail\InvitationMailable;
use App\Mail\NotificationDigestMail;
use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\Invitation;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\ReportExport;
use App\Models\SavedSearch;
use App\Models\Task;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\AccountDeletionExecutedNotification;
use App\Notifications\AccountDeletionReminderNotification;
use App\Notifications\AccountDeletionRequestedNotification;
use App\Notifications\AccountDeletionStepUpCodeNotification;
use App\Notifications\ActivityLogExportReadyNotification;
use App\Notifications\AgencyAdminActivationNotification;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Notifications\AgentTenantInventoryReminderNotification;
use App\Notifications\BookingExpiredNotification;
use App\Notifications\CodedNotification;
use App\Notifications\DataExportReadyNotification;
use App\Notifications\FavoriteChangesNotification;
use App\Notifications\InvitationAcceptedNotification;
use App\Notifications\InvitationExpiredNotification;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Notifications\LeaseDepositRefundNotification;
use App\Notifications\LeaseEarlyTerminationNotification;
use App\Notifications\LeasePaymentLateFeeNotification;
use App\Notifications\LeaseRenewedNotification;
use App\Notifications\LeaseRentReviewedNotification;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Notifications\PropertyApprovedNotification;
use App\Notifications\PropertyRejectedNotification;
use App\Notifications\RegistrationConfirmationNotification;
use App\Notifications\ReportExportReadyNotification;
use App\Notifications\ResetPasswordNotification;
use App\Notifications\SavedSearchMatchesNotification;
use App\Notifications\SearchAlertConfirmationNotification;
use App\Notifications\SuperAdminAcceptedBroadcast;
use App\Notifications\SuperAdminInvitedBroadcast;
use App\Notifications\TaskDueReminderNotification;
use App\Notifications\TenantInventoryReminderNotification;
use App\Notifications\TenantWelcomeNotification;
use App\Notifications\ThresholdAlertTriggered;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Services\Notifications\NotificationRenderer;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Mailable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\App;
use ReflectionClass;
use Tests\TestCase;
use Throwable;

/**
 * P155.02 (TCK-1507) — chaque courriel de l'application se rend, sous `fr`, `en` et `wo`, sans
 * exception, sans clé de traduction brute et sans `:paramètre` resté.
 *
 * Les classes sont énumérées par réflexion sur `app/Notifications` (celles qui ont un `toMail()`)
 * et `app/Mail` (les Mailables) : une classe neuve sans fixture rougit
 * {@see test_chaque_courriel_a_une_fixture()}, pour qu'aucune ne lui échappe. C'est par l'absence
 * d'un tel rendu que P155.01 a survécu : ses tests étaient sous `Mail::fake()`.
 *
 * Une fixture rend `[notification ou Mailable, destinataire]`. Elle vise le cas commun de la
 * classe, pas toutes ses variantes : les variantes ont leurs tests propres.
 */
class RenduDesCourrielsTest extends TestCase
{
    use RefreshDatabase;

    private const LANGUES = ['fr', 'en', 'wo'];

    public function test_chaque_courriel_a_une_fixture(): void
    {
        $sansFixture = array_values(array_diff($this->classesDeCourriel(), array_keys($this->fixtures())));

        $this->assertSame([], $sansFixture, 'ces courriels n\'ont pas de fixture dans RenduDesCourrielsTest');
    }

    public function test_chaque_courriel_se_rend_sans_cle_brute_ni_parametre_reste(): void
    {
        $domaines = array_map(fn (string $f) => basename($f, '.php'), glob(lang_path('fr/*.php')) ?: []);
        $cleBrute = '/\b(?:'.implode('|', array_map('preg_quote', $domaines)).')\.[a-z_]+(?:\.[a-z_0-9]+)*\b/';
        $parametreReste = '/(?<![\w\/&#-]):[a-z][a-z_]+\b/';

        $defauts = [];
        foreach ($this->fixtures() as $classe => $fixture) {
            foreach (self::LANGUES as $langue) {
                App::setLocale($langue);
                try {
                    [$courriel, $destinataire] = $fixture($langue);
                    $texte = $this->rendre($courriel, $destinataire, $langue);
                } catch (Throwable $e) {
                    $defauts[] = "{$classe} ({$langue}) : ".$e::class.' — '.$e->getMessage();

                    continue;
                }

                if (preg_match($cleBrute, $texte, $m)) {
                    $defauts[] = "{$classe} ({$langue}) : clé brute « {$m[0]} »";
                }
                if (preg_match($parametreReste, $texte, $m)) {
                    $defauts[] = "{$classe} ({$langue}) : paramètre resté « {$m[0]} »";
                }
            }
        }

        $this->assertSame([], $defauts);
    }

    /** Le sujet et le texte visible, sans balises ni feuille de style. */
    private function rendre(Notification|Mailable $courriel, User $destinataire, string $langue): string
    {
        if ($courriel instanceof Mailable) {
            $courriel->locale($langue);
            $html = (string) $courriel->render();
            $sujet = (string) ($courriel->envelope()->subject ?? '');
        } else {
            $message = $courriel->toMail($destinataire);
            $html = (string) $message->render();
            $sujet = (string) ($message->subject ?? '');
        }

        $html = preg_replace('#<(style|head)\b.*?</\1>#is', '', $html) ?? $html;

        return $sujet."\n".html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5);
    }

    /** @return list<class-string> */
    private function classesDeCourriel(): array
    {
        $classes = [];
        foreach (['Notifications' => Notification::class, 'Mail' => Mailable::class] as $dossier => $base) {
            foreach (glob(app_path($dossier.'/*.php')) ?: [] as $fichier) {
                $classe = 'App\\'.$dossier.'\\'.basename($fichier, '.php');
                if (! class_exists($classe)) {
                    continue;
                }
                $reflexion = new ReflectionClass($classe);
                if ($reflexion->isAbstract() || ! $reflexion->isSubclassOf($base)) {
                    continue;
                }
                if ($base === Notification::class && ! $reflexion->hasMethod('toMail')) {
                    continue;
                }
                $classes[] = $classe;
            }
        }
        sort($classes);

        return $classes;
    }

    /** @return array<class-string, Closure(string): array{0: Notification|Mailable, 1: User}> */
    private function fixtures(): array
    {
        $destinataire = fn (string $langue): User => User::factory()->create(['preferred_language' => $langue]);
        $bail = fn (): Lease => Lease::factory()->create();

        return [
            AccountDeletionExecutedNotification::class => fn (string $l) => [
                new AccountDeletionExecutedNotification(AccountDeletionRequest::factory()->create()),
                $destinataire($l),
            ],
            AccountDeletionReminderNotification::class => fn (string $l) => [
                new AccountDeletionReminderNotification(AccountDeletionRequest::factory()->create()),
                $destinataire($l),
            ],
            AccountDeletionRequestedNotification::class => fn (string $l) => [
                new AccountDeletionRequestedNotification(AccountDeletionRequest::factory()->create()),
                $destinataire($l),
            ],
            AccountDeletionStepUpCodeNotification::class => fn (string $l) => [
                new AccountDeletionStepUpCodeNotification('123456', 10),
                $destinataire($l),
            ],
            ActivityLogExportReadyNotification::class => fn (string $l) => [
                new ActivityLogExportReadyNotification('https://api.test/exports/audit.csv', 'audit.csv', 12),
                $destinataire($l),
            ],
            AgencyAdminActivationNotification::class => fn (string $l) => [
                new AgencyAdminActivationNotification(str_repeat('a', 40)),
                $destinataire($l),
            ],
            AgencyUpgradeApprovedNotification::class => fn (string $l) => [
                new AgencyUpgradeApprovedNotification(AgencyUpgradeRequest::factory()->create()),
                $destinataire($l),
            ],
            AgencyUpgradeRejectedNotification::class => fn (string $l) => [
                new AgencyUpgradeRejectedNotification(AgencyUpgradeRequest::factory()->create()),
                $destinataire($l),
            ],
            AgencyUpgradeRequestSubmittedNotification::class => fn (string $l) => [
                new AgencyUpgradeRequestSubmittedNotification(AgencyUpgradeRequest::factory()->create(), User::factory()->create()),
                $destinataire($l),
            ],
            AgentTenantInventoryReminderNotification::class => fn (string $l) => [
                new AgentTenantInventoryReminderNotification($bail()),
                $destinataire($l),
            ],
            BookingExpiredNotification::class => fn (string $l) => [
                new BookingExpiredNotification(Booking::factory()->create()),
                $destinataire($l),
            ],
            CodedNotification::class => fn (string $l) => [
                new CodedNotification(NotificationCode::VisitRequested, $this->parametresDuCode(NotificationCode::VisitRequested), ['path' => '/app/visits']),
                $destinataire($l),
            ],
            DataExportReadyNotification::class => function (string $l) use ($destinataire) {
                $user = $destinataire($l);

                return [new DataExportReadyNotification(DataExport::query()->create([
                    'user_id' => $user->id,
                    'requested_by' => $user->id,
                    'status' => DataExportStatus::Ready,
                    'requested_at' => now(),
                    'ready_at' => now(),
                    'expires_at' => now()->addDays(7),
                ])), $user];
            },
            FavoriteChangesNotification::class => fn (string $l) => [
                new FavoriteChangesNotification(FavoriteChangesNotification::KIND_PRICE_DROP, [
                    ['property_id' => 1, 'title' => 'Villa Almadies', 'old' => '150000.00', 'new' => '120000.00'],
                ]),
                $destinataire($l),
            ],
            InvitationAcceptedNotification::class => fn (string $l) => [
                new InvitationAcceptedNotification(Invitation::factory()->create()),
                $destinataire($l),
            ],
            InvitationExpiredNotification::class => fn (string $l) => [
                new InvitationExpiredNotification(Invitation::factory()->create()),
                $destinataire($l),
            ],
            InvoiceOverdueReminderNotification::class => fn (string $l) => [
                new InvoiceOverdueReminderNotification(Invoice::factory()->create(), 3),
                $destinataire($l),
            ],
            LeaseDepositRefundNotification::class => fn (string $l) => [
                new LeaseDepositRefundNotification($bail(), 100000, 50000, 'Peinture à refaire'),
                $destinataire($l),
            ],
            LeaseEarlyTerminationNotification::class => fn (string $l) => [
                new LeaseEarlyTerminationNotification($bail(), LeaseEarlyTerminationNotification::TRANSITION_REQUESTED),
                $destinataire($l),
            ],
            LeasePaymentLateFeeNotification::class => fn (string $l) => [
                new LeasePaymentLateFeeNotification(LeasePayment::factory()->create(), 5000, 5, 100000),
                $destinataire($l),
            ],
            LeaseRenewedNotification::class => fn (string $l) => [
                new LeaseRenewedNotification($bail(), $bail()),
                $destinataire($l),
            ],
            LeaseRentReviewedNotification::class => fn (string $l) => [
                new LeaseRentReviewedNotification($bail(), 100000, 110000, 'Révision annuelle', '2026-11-01'),
                $destinataire($l),
            ],
            LeaseSignatureCodeNotification::class => fn (string $l) => [
                new LeaseSignatureCodeNotification('123456', 'BAIL-2026-001', 10, 'mail'),
                $destinataire($l),
            ],
            PropertyApprovedNotification::class => fn (string $l) => [
                new PropertyApprovedNotification(Property::factory()->create()),
                $destinataire($l),
            ],
            PropertyRejectedNotification::class => fn (string $l) => [
                new PropertyRejectedNotification(Property::factory()->create(), 'Photos floues'),
                $destinataire($l),
            ],
            ReportExportReadyNotification::class => function (string $l) use ($destinataire) {
                $user = $destinataire($l);

                return [new ReportExportReadyNotification(ReportExport::query()->create([
                    'requested_by' => $user->id,
                    'report' => 'revenue',
                    'format' => 'csv',
                    'status' => 'ready',
                    'row_count' => 1,
                    'ready_at' => now(),
                    'expires_at' => now()->addDays(7),
                ])), $user];
            },
            RegistrationConfirmationNotification::class => fn (string $l) => [
                new RegistrationConfirmationNotification,
                $destinataire($l),
            ],
            ResetPasswordNotification::class => fn (string $l) => [
                new ResetPasswordNotification(str_repeat('b', 40)),
                $destinataire($l),
            ],
            SavedSearchMatchesNotification::class => function (string $l) use ($destinataire) {
                $user = $destinataire($l);

                return [new SavedSearchMatchesNotification(
                    SavedSearch::factory()->create(['user_id' => $user->id]),
                    Property::factory()->count(2)->create(),
                    2,
                ), $user];
            },
            SearchAlertConfirmationNotification::class => fn (string $l) => [
                new SearchAlertConfirmationNotification(str_repeat('c', 40)),
                $destinataire($l),
            ],
            SuperAdminAcceptedBroadcast::class => fn (string $l) => [
                new SuperAdminAcceptedBroadcast(User::factory()->create()),
                $destinataire($l),
            ],
            SuperAdminInvitedBroadcast::class => fn (string $l) => [
                new SuperAdminInvitedBroadcast(Invitation::factory()->create(), User::factory()->create()),
                $destinataire($l),
            ],
            TaskDueReminderNotification::class => fn (string $l) => [
                new TaskDueReminderNotification(Task::factory()->create()),
                $destinataire($l),
            ],
            TenantInventoryReminderNotification::class => fn (string $l) => [
                new TenantInventoryReminderNotification($bail()),
                $destinataire($l),
            ],
            TenantWelcomeNotification::class => fn (string $l) => [
                new TenantWelcomeNotification($bail()),
                $destinataire($l),
            ],
            ThresholdAlertTriggered::class => fn (string $l) => [
                new ThresholdAlertTriggered(new ThresholdAlert([
                    'agency_id' => Agency::factory()->create()->id,
                    'metric' => ThresholdAlert::allowedMetrics()[0],
                    'operator' => '<',
                    'threshold' => 70,
                    'severity' => ThresholdAlert::allowedSeverities()[0],
                    'cooldown_hours' => 24,
                ]), 62.5),
                $destinataire($l),
            ],
            UrgentMaintenanceCreatedNotification::class => fn (string $l) => [
                new UrgentMaintenanceCreatedNotification(MaintenanceRequest::factory()->create()),
                $destinataire($l),
            ],
            InvitationMailable::class => fn (string $l) => [
                new InvitationMailable(Invitation::factory()->create()),
                $destinataire($l),
            ],
            NotificationDigestMail::class => function (string $l) use ($destinataire) {
                $user = $destinataire($l);
                $avis = AppNotification::query()->create([
                    'user_id' => $user->id,
                    'type' => NotificationType::System->value,
                    'delivery_channel' => NotificationChannel::App->value,
                    'title' => 'Bail signé',
                    'body' => 'Le bail BAIL-2026-001 est signé.',
                    'is_read' => false,
                ]);
                $liens = NotificationUnsubscribeController::liens($user);

                return [new NotificationDigestMail(
                    $user,
                    collect([NotificationType::System->value => collect([$avis])]),
                    $liens['page'],
                    $liens['one_click'],
                ), $user];
            },
        ];
    }

    /** @return array<string, mixed> */
    private function parametresDuCode(NotificationCode $code): array
    {
        $parametres = [];
        foreach ($code->params() + $code->optionalParams() as $nom => $type) {
            $parametres[$nom] = match ($type) {
                NotificationCode::PARAM_MONEY => NotificationRenderer::money(150000, 'XOF'),
                NotificationCode::PARAM_DATE => '2026-10-22',
                NotificationCode::PARAM_DATETIME => '2026-10-22 10:00:00',
                NotificationCode::PARAM_COUNT => 3,
                NotificationCode::PARAM_URL => 'https://front.test/fr/pay/'.str_repeat('Q', 43),
                default => 'Villa',
            };
        }

        return $parametres;
    }
}
