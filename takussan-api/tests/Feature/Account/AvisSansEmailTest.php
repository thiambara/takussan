<?php

namespace Tests\Feature\Account;

use App\Jobs\Audit\ExportActivityLogJob;
use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\User;
use App\Notifications\AccountDeletionExecutedNotification;
use App\Notifications\AccountDeletionReminderNotification;
use App\Notifications\AccountDeletionRequestedNotification;
use App\Notifications\AccountDeletionStepUpCodeNotification;
use App\Notifications\ActivityLogExportReadyNotification;
use App\Notifications\AgencyAdminActivationNotification;
use App\Notifications\DataExportReadyNotification;
use App\Notifications\InvitationAcceptedNotification;
use App\Notifications\InvitationExpiredNotification;
use App\Notifications\RegistrationConfirmationNotification;
use App\Notifications\ReportExportReadyNotification;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use ReflectionClass;
use Tests\ApiTestCase;
use Tests\Support\FakeSmsRouter;
use Throwable;

/**
 * P193.04 (TCK-2051) — un avis qui ne part que par `mail` disparaît sans trace pour un compte
 * sans e-mail : `MailChannel::send` sort sans rien faire quand le destinataire n'a pas de route.
 *
 * Les trois avis de suppression de compte partent par SMS au numéro vérifié, l'export
 * asynchrone du journal d'audit est refusé par un code, et `reminder_sent_at` ne se pose que si
 * un canal existe. Toute autre notification à `via()` = `['mail']` pour un compte sans e-mail
 * doit se justifier dans {@see self::EXCEPTIONS}.
 */
class AvisSansEmailTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000193';

    /**
     * Les notifications qui restent `['mail']` pour un compte sans e-mail, et pourquoi.
     *
     * @var array<class-string, string>
     */
    private const EXCEPTIONS = [
        ResetPasswordNotification::class => 'réinitialisation par lien envoyé à une adresse : sans adresse, rien à réinitialiser par ce chemin',
        RegistrationConfirmationNotification::class => 'vérification d\'une adresse : n\'a de sens qu\'avec elle',
        AgencyAdminActivationNotification::class => 'gérant provisionné par un super-admin à partir de son adresse',
        AccountDeletionStepUpCodeNotification::class => 'DeletionStepUpService envoie le code par SMS au compte sans e-mail (TCK-589) et ne notifie que les autres',
        DataExportReadyNotification::class => 'le fichier s\'atteint aussi par la liste des exports et son relais de téléchargement (TCK-1519)',
        ReportExportReadyNotification::class => 'export de la console : un opérateur a toujours un e-mail (InviteSuperAdminRequest l\'exige)',
        ActivityLogExportReadyNotification::class => 'l\'export asynchrone est refusé en amont pour un compte sans e-mail',
        InvitationExpiredNotification::class => 'reste de P193.04 : la cloche quand l\'invitant n\'a pas d\'e-mail n\'est pas faite',
        InvitationAcceptedNotification::class => 'reste de P193.04 : la cloche quand l\'invitant n\'a pas d\'e-mail n\'est pas faite',
    ];

    private function compteParTelephone(bool $verifie = true): User
    {
        return User::factory()->create([
            'email' => null,
            'email_verified_at' => null,
            'phone' => self::NUMERO,
            'phone_verified_at' => $verifie ? now() : null,
        ]);
    }

    public function test_seules_les_exceptions_justifiees_restent_mail_seul_pour_un_compte_sans_email(): void
    {
        $compte = User::factory()->make([
            'email' => null,
            'phone' => self::NUMERO,
            'phone_verified_at' => now(),
        ]);

        $mailSeul = [];
        foreach (glob(app_path('Notifications/*.php')) ?: [] as $fichier) {
            $classe = 'App\\Notifications\\'.basename($fichier, '.php');
            if (! class_exists($classe) || ! is_subclass_of($classe, Notification::class)) {
                continue;
            }
            $reflexion = new ReflectionClass($classe);
            if ($reflexion->isAbstract()) {
                continue;
            }
            try {
                $canaux = $reflexion->newInstanceWithoutConstructor()->via($compte);
            } catch (Throwable) {
                // Un `via()` qui lit l'état de la notification ne se juge pas sans elle.
                continue;
            }
            if (array_values((array) $canaux) === ['mail']) {
                $mailSeul[] = $classe;
            }
        }

        $this->assertEqualsCanonicalizing(array_keys(self::EXCEPTIONS), $mailSeul);
    }

    public function test_les_trois_avis_de_suppression_partent_par_sms_au_numero_verifie(): void
    {
        Mail::fake();
        $sms = FakeSmsRouter::install();
        $compte = $this->compteParTelephone();
        $demande = AccountDeletionRequest::factory()->for($compte)->create(['scheduled_for' => now()->addDays(5)]);

        $compte->notifyNow(new AccountDeletionRequestedNotification($demande));
        $compte->notifyNow(new AccountDeletionReminderNotification($demande));
        $compte->notifyNow(new AccountDeletionExecutedNotification($demande));

        $envois = $sms->sentTo(self::NUMERO);
        $this->assertCount(3, $envois);
        // TCK-2325 (P128.03) — la date en `LL`, dans la langue du compte, et non plus `d/m/Y`.
        $date = $demande->scheduled_for->copy()->setTimezone($compte->timezone)->locale('fr')->isoFormat('LL');
        $this->assertStringContainsString($date, $envois[0]['message']);
        $this->assertStringContainsString($date, $envois[1]['message']);
        $this->assertTrue($envois[0]['context']['is_critical']);
        Mail::assertNothingOutgoing();
    }

    public function test_un_compte_a_email_recoit_le_courriel_et_aucun_sms(): void
    {
        $sms = FakeSmsRouter::install();
        $compte = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $demande = AccountDeletionRequest::factory()->for($compte)->create();

        $this->assertSame(['mail'], (new AccountDeletionRequestedNotification($demande))->via($compte));
        $compte->notifyNow(new AccountDeletionExecutedNotification($demande));

        $this->assertSame([], $sms->sent);
    }

    public function test_le_rappel_ne_se_marque_envoye_que_si_un_canal_existe(): void
    {
        FakeSmsRouter::install();
        $injoignable = $this->compteParTelephone(verifie: false);
        $sansRappel = AccountDeletionRequest::factory()->for($injoignable)->create(['scheduled_for' => now()->addDays(3)]);
        $joignable = User::factory()->create([
            'email' => null, 'phone' => '+221770000194', 'phone_verified_at' => now(),
        ]);
        $avecRappel = AccountDeletionRequest::factory()->for($joignable)->create(['scheduled_for' => now()->addDays(3)]);

        $this->artisan('account:execute-deletions')->assertExitCode(0);

        $this->assertNull($sansRappel->fresh()->reminder_sent_at);
        $this->assertNotNull($avecRappel->fresh()->reminder_sent_at);
    }

    public function test_l_export_asynchrone_du_journal_est_refuse_sans_email(): void
    {
        Queue::fake();
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $admin->forceFill(['email' => null, 'email_verified_at' => null])->save();
        $now = now();
        DB::table('activity_log')->insert(array_map(fn () => [
            'log_name' => 'default', 'description' => 'updated', 'event' => 'updated',
            'subject_type' => Agency::class, 'subject_id' => $agency->id,
            'causer_type' => User::class, 'causer_id' => $admin->id, 'agency_id' => $agency->id,
            'created_at' => $now, 'updated_at' => $now,
        ], range(1, 5001)));

        $this->apiGet('/api/activity-logs/export?format=csv')
            ->assertStatus(422)
            ->assertJsonPath('code', 'activity_log.export_needs_email');
        Queue::assertNotPushed(ExportActivityLogJob::class);
    }
}
