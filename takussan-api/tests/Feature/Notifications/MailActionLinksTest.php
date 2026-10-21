<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Mail\InvitationMailable;
use App\Mail\NotificationDigestMail;
use App\Models\AccountDeletionRequest;
use App\Models\AgencyUpgradeRequest;
use App\Models\AppNotification;
use App\Models\DataExport;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\Invitation;
use App\Models\Lease;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\AccountDeletionReminderNotification;
use App\Notifications\AccountDeletionRequestedNotification;
use App\Notifications\AgencyAdminActivationNotification;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Notifications\AgentTenantInventoryReminderNotification;
use App\Notifications\CodedNotification;
use App\Notifications\DataExportReadyNotification;
use App\Notifications\FavoriteChangesNotification;
use App\Notifications\RegistrationConfirmationNotification;
use App\Notifications\ResetPasswordNotification;
use App\Notifications\SearchAlertConfirmationNotification;
use App\Notifications\TenantInventoryReminderNotification;
use App\Notifications\TenantWelcomeNotification;
use App\Notifications\ThresholdAlertTriggered;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * P97.05 (TCK-1185) — le bouton de chaque courriel mène à une PAGE DU FRONT, sur l'hôte du front.
 *
 * `scripts/check-notification-target-paths.mjs` ne lit que `NotificationTarget::PATHS` : les liens
 * écrits à la main dans les `toMail()` lui échappent, et P97.01 (un bouton sur l'hôte de l'API, vers
 * une page qui n'y existe pas) ne se voyait d'aucune garde. Ce test rend chaque `toMail()` qui pose
 * un bouton, sur un destinataire de fabrique, et exige :
 *
 *   · que `actionUrl` commence par la base du front (`app.frontend_url`, à défaut `app.url`) — y
 *     compris quand `app.frontend_url` est VIDE : `config('app.frontend_url', …)` ne se repliait
 *     jamais (la clé est toujours définie), et le lien sortait alors relatif ;
 *   · que son chemin suive celui que déclare {@see CHEMINS} — et le test du front
 *     `takussan-web/src/__tests__/liens-des-courriels.test.ts`, dont la clé d'attestation couvre
 *     l'API, exige que chaque chemin déclaré mène à une page du front.
 *
 * Toute classe de `app/Notifications` qui pose un bouton (`->action(`) doit figurer dans
 * {@see cas()} ou dans {@see EXEMPTIONS}, avec sa raison : une classe neuve n'échappe pas au test.
 */
class MailActionLinksTest extends TestCase
{
    use RefreshDatabase;

    private const API = 'https://api.exemple.test';

    private const FRONT = 'https://front.exemple.test';

    /**
     * Le chemin de chaque lien, `{id}` pour un segment variable. ⚠ C'est
     * `takussan-web/src/__tests__/liens-des-courriels.test.ts` qui les résout en pages de
     * `takussan-web/src/app`, comme la garde des cibles de `NotificationTarget::PATHS` : ce test-ci
     * ne lit pas le front, l'attestation de l'API (ADR-0063) n'en portant pas la clé. Il vérifie que
     * le lien rendu suit le chemin déclaré, le test du front que le chemin déclaré mène à une page.
     */
    public const CHEMINS = [
        'ThresholdAlertTriggered' => '/app/overview',
        'AgencyAdminActivationNotification' => '/auth/reset-password',
        'DataExportReadyNotification' => '/app/account/privacy',
        'FavoriteChangesNotification' => '/app/favorites',
        'TenantWelcomeNotification' => '/app',
        'TenantInventoryReminderNotification' => '/app/inventories',
        'AgentTenantInventoryReminderNotification' => '/app/leases/onboarding-pending',
        'AgencyUpgradeApprovedNotification' => '/app',
        'AgencyUpgradeRejectedNotification' => '/app/settings/agency/upgrade',
        'AgencyUpgradeRequestSubmittedNotification' => '/super-admin/agency-upgrade-requests/{id}',
        'SearchAlertConfirmationNotification' => '/{id}/search-alerts/confirm',
        'AccountDeletionRequestedNotification' => '/app/profile',
        'AccountDeletionReminderNotification' => '/app/profile',
        'CodedNotification' => '/app/messages',
        'ResetPasswordNotification' => '/auth/reset-password',
        'RegistrationConfirmationNotification' => '/auth/verify-email/{id}/{id}',
        'InvitationMailable' => '/invitations/accept',
        'NotificationDigestMail' => '/app/notifications',
        'NotificationDigestMail (désabonnement)' => '/{id}/notifications/unsubscribe',
    ];

    /** Les boutons qui ne visent pas le front, et pourquoi. */
    private const EXEMPTIONS = [
        'ActivityLogExportReadyNotification' => 'lien de téléchargement signé, servi par l\'API (ReportExport et journal d\'audit, AgencyAuditScopeTest)',
        'ReportExportReadyNotification' => 'lien de téléchargement signé, servi par l\'API (ReportExportDownloadTest)',
    ];

    /** @return array<string, Closure(): array{0: Notification, 1: User}> */
    private function cas(): array
    {
        return [
            'ThresholdAlertTriggered' => fn () => [new ThresholdAlertTriggered((new ThresholdAlert)->forceFill([
                'metric' => 'unpaid_rate_percent', 'operator' => '>', 'threshold' => 10.0, 'severity' => 'critical', 'cooldown_hours' => 24,
            ]), 12.5), $this->destinataire()],
            'AgencyAdminActivationNotification' => fn () => [new AgencyAdminActivationNotification('jeton-activation'), $this->destinataire()],
            'DataExportReadyNotification' => fn () => [new DataExportReadyNotification((new DataExport)->forceFill(['expires_at' => now()->addDays(7)])), $this->destinataire()],
            'FavoriteChangesNotification' => fn () => [new FavoriteChangesNotification(FavoriteChangesNotification::KIND_UNAVAILABLE, [
                ['property_id' => 1, 'title' => 'Villa', 'availability' => 'rented'],
            ]), $this->destinataire()],
            'TenantWelcomeNotification' => fn () => [new TenantWelcomeNotification(Lease::factory()->create()), $this->destinataire()],
            'TenantInventoryReminderNotification' => fn () => [new TenantInventoryReminderNotification(Lease::factory()->create()), $this->destinataire()],
            'AgentTenantInventoryReminderNotification' => fn () => [new AgentTenantInventoryReminderNotification(Lease::factory()->create()), $this->destinataire()],
            'AgencyUpgradeApprovedNotification' => fn () => [new AgencyUpgradeApprovedNotification(AgencyUpgradeRequest::factory()->create()), $this->destinataire()],
            'AgencyUpgradeRejectedNotification' => fn () => [new AgencyUpgradeRejectedNotification(AgencyUpgradeRequest::factory()->create()), $this->destinataire()],
            'AgencyUpgradeRequestSubmittedNotification' => fn () => [new AgencyUpgradeRequestSubmittedNotification(
                AgencyUpgradeRequest::factory()->create(), $this->destinataire(),
            ), $this->destinataire()],
            'SearchAlertConfirmationNotification' => fn () => [new SearchAlertConfirmationNotification('jeton-de-confirmation'), $this->destinataire()],
            'AccountDeletionRequestedNotification' => fn () => [new AccountDeletionRequestedNotification($this->demandeDeSuppression()), $this->destinataire()],
            'AccountDeletionReminderNotification' => fn () => [new AccountDeletionReminderNotification($this->demandeDeSuppression()), $this->destinataire()],
            'CodedNotification' => fn () => [new CodedNotification(
                NotificationCode::BookingCreated, [], ['kind' => 'conversation', 'id' => 42, 'path' => '/app/messages?conversation=42'],
            ), $this->destinataire()],
            'ResetPasswordNotification' => fn () => [new ResetPasswordNotification('jeton-reinitialisation'), $this->destinataire()],
            'RegistrationConfirmationNotification' => fn () => [new RegistrationConfirmationNotification, $this->destinataire()],
        ];
    }

    private function destinataire(): User
    {
        return User::factory()->create(['preferred_language' => 'fr']);
    }

    private function demandeDeSuppression(): AccountDeletionRequest
    {
        return (new AccountDeletionRequest)->forceFill(['scheduled_for' => now()->addDays(30)]);
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function bases(): array
    {
        return [
            'app.frontend_url posée' => [self::FRONT.'/', self::FRONT],
            'app.frontend_url vide : repli sur app.url' => ['', self::API],
        ];
    }

    #[DataProvider('bases')]
    public function test_chaque_bouton_de_courriel_mene_a_une_page_du_front(string $frontendUrl, string $base): void
    {
        config(['app.url' => self::API, 'app.frontend_url' => $frontendUrl]);
        $fautes = [];

        foreach ($this->cas() as $classe => $fabrique) {
            [$notification, $destinataire] = $fabrique();
            $mail = $notification->toMail($destinataire);
            $this->assertInstanceOf(MailMessage::class, $mail, $classe);
            if (($faute = $this->fauteDe($classe, (string) $mail->actionUrl, $base)) !== null) {
                $fautes[] = "{$classe} → {$mail->actionUrl} : {$faute}";
            }
        }

        $this->assertSame([], $fautes);
    }

    #[DataProvider('bases')]
    public function test_les_liens_des_mailables_menent_a_une_page_du_front(string $frontendUrl, string $base): void
    {
        config(['app.url' => self::API, 'app.frontend_url' => $frontendUrl]);
        $fautes = [];

        $invitation = Invitation::factory()->create();
        $accept = (string) (new InvitationMailable($invitation))->content()->with['acceptUrl'];
        if (($faute = $this->fauteDe('InvitationMailable', $accept, $base)) !== null) {
            $fautes[] = "InvitationMailable → {$accept} : {$faute}";
        }

        $user = $this->destinataire();
        $notification = AppNotification::query()->create([
            'user_id' => $user->id,
            'type' => NotificationType::System->value,
            'delivery_channel' => NotificationChannel::App->value,
            'title' => 'Une notification',
            'body' => 'Corps',
            'is_read' => false,
        ]);
        $digest = new NotificationDigestMail($user, collect(['system' => collect([$notification])]), truncated: true);
        $html = $digest->render();
        foreach ([self::CHEMINS['NotificationDigestMail'], '/fr/notifications/unsubscribe'] as $chemin) {
            if (! str_contains($html, e($base.$chemin))) {
                $fautes[] = "NotificationDigestMail : aucun lien {$base}{$chemin}";
            }
        }

        $this->assertSame([], $fautes);
    }

    public function test_toute_classe_qui_pose_un_bouton_est_eprouvee_ou_exemptee(): void
    {
        $avecBouton = [];
        foreach (glob(app_path('Notifications/*.php')) ?: [] as $fichier) {
            if (str_contains((string) file_get_contents($fichier), '->action(')) {
                $avecBouton[] = basename($fichier, '.php');
            }
        }
        // ResetPassword et VerifyEmail posent leur bouton dans la classe parente du framework.
        $connues = [...array_keys($this->cas()), ...array_keys(self::EXEMPTIONS)];

        $this->assertNotEmpty($avecBouton, 'le balayage ne voit plus aucun bouton : il ne prouverait rien');
        $this->assertSame([], array_values(array_diff($avecBouton, $connues)), 'classe à bouton absente de cas() et des EXEMPTIONS');
        $this->assertSame([], array_values(array_diff(array_keys(self::EXEMPTIONS), $avecBouton)), 'exemption sans classe à bouton');
    }

    private function fauteDe(string $classe, string $url, string $base): ?string
    {
        if (! str_starts_with($url, $base.'/')) {
            return "n'est pas sur la base du front {$base}";
        }
        $attendu = self::CHEMINS[$classe] ?? null;
        if ($attendu === null) {
            return 'aucun chemin déclaré dans CHEMINS';
        }
        $chemin = (string) parse_url($url, PHP_URL_PATH);
        $motif = '#^'.str_replace(preg_quote('{id}', '#'), '[^/]+', preg_quote($attendu, '#')).'$#';

        return preg_match($motif, $chemin) === 1 ? null : "le chemin {$chemin} n'est pas {$attendu}";
    }
}
