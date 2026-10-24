<?php

namespace Tests\Feature\Notifications;

use App\Models\AgencyUpgradeRequest;
use App\Models\Invitation;
use App\Models\ReportExport;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Notifications\ReportExportReadyNotification;
use App\Notifications\SuperAdminAcceptedBroadcast;
use App\Notifications\SuperAdminInvitedBroadcast;
use App\Notifications\ThresholdAlertTriggered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\App;
use Tests\TestCase;

/**
 * P155.05 (TCK-1441) — ces sept courriels s'ouvrent par `notifications.greeting` et se ferment
 * par `notifications.salutation`, comme les autres. Les deux avis de cooptation s'ouvraient par la
 * signature (« L'équipe Takussan » en tête et en pied) ; les cinq autres prenaient les formules
 * du gabarit de Laravel (« Bonjour ! », « Cordialement, » et le nom de l'application).
 */
class FormulesDesCourrielsTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, MailMessage> */
    private function courriels(User $destinataire): array
    {
        $demande = AgencyUpgradeRequest::factory()->create();
        $invitation = Invitation::factory()->create(['role' => 'super_admin']);
        $alerte = new ThresholdAlert([
            'agency_id' => $demande->agency_id,
            'metric' => 'overdue_count',
            'operator' => '>',
            'threshold' => 3,
            'severity' => 'warning',
            'cooldown_hours' => 24,
        ]);
        $export = ReportExport::query()->create([
            'requested_by' => $destinataire->id,
            'report' => 'growth',
            'format' => 'csv',
            'status' => 'ready',
            'row_count' => 1,
            'ready_at' => now(),
            'expires_at' => now()->addDays(7),
        ]);

        return [
            'SuperAdminInvitedBroadcast' => (new SuperAdminInvitedBroadcast($invitation, $destinataire))->toMail($destinataire),
            'SuperAdminAcceptedBroadcast' => (new SuperAdminAcceptedBroadcast($destinataire))->toMail($destinataire),
            'AgencyUpgradeApprovedNotification' => (new AgencyUpgradeApprovedNotification($demande))->toMail($destinataire),
            'AgencyUpgradeRejectedNotification' => (new AgencyUpgradeRejectedNotification($demande))->toMail($destinataire),
            'AgencyUpgradeRequestSubmittedNotification' => (new AgencyUpgradeRequestSubmittedNotification($demande, $destinataire))->toMail($destinataire),
            'ReportExportReadyNotification' => (new ReportExportReadyNotification($export))->toMail($destinataire),
            'ThresholdAlertTriggered' => (new ThresholdAlertTriggered($alerte, 5))->toMail($destinataire),
        ];
    }

    public function test_les_sept_courriels_portent_les_formules_du_depot(): void
    {
        $destinataire = User::factory()->create();

        foreach (['fr', 'en', 'wo'] as $langue) {
            App::setLocale($langue);
            foreach ($this->courriels($destinataire) as $classe => $courriel) {
                $this->assertSame(__('notifications.greeting'), $courriel->greeting, "{$classe}, appel, {$langue}");
                $this->assertSame(__('notifications.salutation'), $courriel->salutation, "{$classe}, signature, {$langue}");
            }
        }
    }
}
