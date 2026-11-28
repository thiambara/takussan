<?php

namespace Tests\Feature\Console;

use App\Jobs\Audit\PurgeExpiredActivityLogExports;
use App\Jobs\Billing\ProcessTrialExpirations;
use App\Jobs\Billing\RenewAgencySubscriptionPeriods;
use App\Jobs\Booking\CompleteEndedBookingsJob;
use App\Jobs\Booking\ExpirePendingBookingsJob;
use App\Jobs\Crm\SendProspectMatchDigest;
use App\Jobs\Documents\PurgerLesArchivesDuCoffre;
use App\Jobs\EscalateUrgentMaintenanceJob;
use App\Jobs\ExpireBookings;
use App\Jobs\Invoice\SendOverdueRemindersJob;
use App\Jobs\Lease\ApplyLateFeesJob;
use App\Jobs\Lease\ConfirmEarlyTerminationsJob;
use App\Jobs\Lease\ExpireEndedLeasesJob;
use App\Jobs\Notifications\SendNotificationDigestJob;
use App\Jobs\Permissions\ProcessRoleDelegationsJob;
use App\Jobs\Privacy\PurgeExpiredDataExports;
use App\Jobs\RecordQueueHeartbeat;
use App\Jobs\RefreshDirectoryResponseTimes;
use App\Jobs\RefreshNewBuildSearchLabel;
use App\Jobs\Reporting\PurgeExpiredReportExports;
use App\Jobs\Reporting\SnapshotPlatformMetricsJob;
use App\Jobs\SendFavoriteChangeAlerts;
use App\Jobs\SendLeasePaymentReminders;
use App\Jobs\SendPropertyVisitReminders;
use App\Jobs\SendSavedSearchAlerts;
use App\Jobs\SyncPropertyCalendarFeedsJob;
use App\Services\Admin\ScheduledRunRecorder;
use Cron\CronExpression;
use DateTimeZone;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-3015 (ADR-0140 § 4) — la planification se garde par UN recensement, pas par un test « est planifié »
 * recopié dans chaque fichier de commande.
 *
 * `PLAN` est la table FERMÉE du `Schedule` résolu (`routes/console.php` chargé) : une ligne par tâche,
 * avec sa commande ARGUMENTS COMPRIS (nommée comme `ScheduledRunRecorder::nomDe()` la journalise), sa
 * fréquence, son fuseau et son verrou `withoutOverlapping()`. Une tâche retirée, ajoutée sans ligne, qui
 * change d'heure, de fuseau, d'argument ou perd son verrou rougit ici. Les règles qui lient plusieurs
 * lignes (verrou borné par la période, comptage radar avant la purge) sont des tests à part : deux
 * lignes de la table se modifient ensemble sans rien dire de leur relation.
 *
 * Absorbe `ScheduleOverlapLockTest` (TCK-737) et les ~30 tests « est planifié » listés dans le ticket.
 */
class PlanificationTest extends TestCase
{
    private const UTC = 'UTC';

    private const DAKAR = 'Africa/Dakar';

    /**
     * Les files dont le battement est planifié chaque minute : les six du compose, `ai` comprise
     * (TCK-2402). Écrites en dur, pour qu'une file retirée de `RecordQueueHeartbeat::QUEUES` se voie.
     */
    private const FILES_DU_BATTEMENT = ['default', 'media', 'notifications-urgent', 'reconciliation', 'long', 'ai'];

    /**
     * [tâche, expression cron, fuseau, sans chevauchement], dans l'ordre de `routes/console.php`.
     * Le battement des files (une ligne par file) est ajouté par `attendu()`.
     *
     * @var list<array{0: string, 1: string, 2: string, 3: bool}>
     */
    private const PLAN = [
        [ExpirePendingBookingsJob::class, '*/15 * * * *', self::UTC, true],
        [ExpireBookings::class, '0 * * * *', self::UTC, true],
        [SyncPropertyCalendarFeedsJob::class, '0 * * * *', self::UTC, true],
        [ApplyLateFeesJob::class, '0 2 * * *', self::UTC, true],
        [ProcessTrialExpirations::class, '15 2 * * *', self::UTC, true],
        [RenewAgencySubscriptionPeriods::class, '20 2 * * *', self::UTC, true],
        [ConfirmEarlyTerminationsJob::class, '0 3 * * *', self::UTC, true],
        [ExpireEndedLeasesJob::class, '15 3 * * *', self::UTC, true],
        [CompleteEndedBookingsJob::class, '30 3 * * *', self::UTC, true],
        [SendLeasePaymentReminders::class, '0 8 * * *', self::UTC, false],
        [SendSavedSearchAlerts::class, '0 9 * * *', self::UTC, true],
        ['search-alerts:purge-unconfirmed', '0 * * * *', self::UTC, true],
        // Horaire : sinon une empreinte de visiteur vit jusqu'à 71 h (TCK-2472).
        ['search:purge-journal', '0 * * * *', self::UTC, true],
        ['search:build-suggestions', '0 * * * *', self::UTC, true],
        ['search:refresh-aliases', '10 4 * * 1', self::DAKAR, true],
        [SendFavoriteChangeAlerts::class, '15 9 * * *', self::UTC, true],
        [SendProspectMatchDigest::class, '30 8 * * *', self::UTC, true],
        [SendOverdueRemindersJob::class, '0 9 * * *', self::UTC, true],
        [SendPropertyVisitReminders::class, '*/5 * * * *', self::UTC, true],
        ['commitments:signal', '*/5 * * * *', self::UTC, true],
        [SendNotificationDigestJob::class, '0 * * * *', self::UTC, true],
        ['media:cleanup', '0 3 * * *', self::UTC, false],
        // Éteinte par défaut (`ai.eval_nightly`) : le filtre `when` est jugé par AdminAiEvaluationSuiteTest.
        ['ai:eval --all', '30 2 * * *', self::UTC, true],
        [RefreshNewBuildSearchLabel::class, '0 4 * * *', self::UTC, true],
        [RefreshDirectoryResponseTimes::class, '20 4 * * *', self::DAKAR, true],
        ['dashboard:check-alerts', '0 * * * *', self::UTC, true],
        ['tasks:send-due-reminders', '0 * * * *', self::UTC, true],
        ['account:execute-deletions', '0 * * * *', self::UTC, true],
        [PurgeExpiredDataExports::class, '30 2 * * *', self::UTC, true],
        [PurgeExpiredReportExports::class, '40 2 * * *', self::UTC, true],
        [PurgeExpiredActivityLogExports::class, '0 * * * *', self::UTC, true],
        ['exports:purge-files', '0 * * * *', self::UTC, true],
        ['properties:purge-daily-views', '20 4 * * *', self::DAKAR, true],
        [PurgerLesArchivesDuCoffre::class, '0 * * * *', self::UTC, true],
        ['kyc:expire-dossiers', '0 6 * * *', self::UTC, true],
        ['documents:remind-expiring', '0 7 * * *', self::DAKAR, true],
        [EscalateUrgentMaintenanceJob::class, '0 * * * *', self::UTC, true],
        [ProcessRoleDelegationsJob::class, '*/5 * * * *', self::UTC, true],
        ['maintenance:auto-close', '0 4 * * *', self::UTC, true],
        ['invitations:expire', '0 * * * *', self::UTC, true],
        ['invitations:remind', '0 * * * *', self::UTC, true],
        // TCK-589 AC10 — sans elle, `personal_access_tokens` ne fait que grossir.
        ['sanctum:prune-expired --hours=24', '0 0 * * *', self::UTC, true],
        ['sessions:prune-idle --hours=24', '0 0 * * *', self::UTC, true],
        // TCK-1015 — le broker `activations` (7 jours), jamais `users` (60 min) : la table est partagée avec le
        // lien d'activation du gérant provisionné. PasswordResetTokensPruneTest rejoue la commande planifiée.
        ['auth:clear-resets activations', '0 0 * * *', self::UTC, true],
        ['impersonation:close-expired', '* * * * *', self::UTC, true],
        ['health:probe', '* * * * *', self::UTC, true],
        ['alerts:evaluate', '*/5 * * * *', self::UTC, true],
        ['wizard-drafts:purge', '30 3 * * *', self::UTC, true],
        ['tenant-onboarding:remind', '0 * * * *', self::UTC, true],
        ['sms:pull-mtarget-dlr', '*/5 * * * *', self::UTC, true],
        ['payouts:remind-due', '30 7 * * *', self::DAKAR, true],
        ['payouts:send-owner-statements', '0 8 1 * *', self::DAKAR, true],
        [SnapshotPlatformMetricsJob::class, '30 0 * * *', self::UTC, true],
        ['webhooks:prune', '45 3 * * *', self::DAKAR, true],
        ['notifications:prune-delivery-attempts', '50 3 * * *', self::DAKAR, true],
        // ADR-0044, amendement TCK-723 : un job échoué se garde 30 jours.
        ['queue:prune-failed --hours=720', '55 3 * * *', self::DAKAR, true],
        ['queue:prune-batches', '57 3 * * *', self::DAKAR, true],
        ['notifications:prune-read', '5 4 * * *', self::DAKAR, true],
        ['radar:purge', '15 4 * * *', self::DAKAR, true],
        ['messaging:purge-copilot-proposals', '25 4 * * *', self::DAKAR, true],
        ['radar:count-natures', '13 4 * * *', self::DAKAR, true],
        ['radar:observe-sources', '*/15 * * * *', self::UTC, true],
        ['audit:prune-activity-log', '10 4 * * *', self::DAKAR, true],
        // TCK-537 — les durées de la politique de confidentialité (§ 6).
        ['kyc:prune-ended-pieces', '15 4 * * *', self::DAKAR, true],
        ['crm:prune-contact-leads', '20 4 * * *', self::DAKAR, true],
        ['account:prune-consent-proofs', '25 4 * * *', self::DAKAR, true],
        ['boosts:tick', '*/5 * * * *', self::UTC, true],
        ['radar:crawl', '*/15 * * * *', self::UTC, true],
        ['radar:embed-listings', '*/15 * * * *', self::UTC, true],
        ['radar:refresh-demand-targets', '40 3 * * *', self::DAKAR, true],
        ['users:public-slugs', '25 * * * *', self::UTC, true],
        ['pont:effacer-numeros', '55 3 * * *', self::DAKAR, true],
        ['owners:weekly-digest', '0 9 * * 1', self::DAKAR, true],
    ];

    public function test_le_planificateur_rend_exactement_la_table(): void
    {
        $reelles = array_map($this->ligne(...), $this->evenements());
        $attendues = array_map(fn (array $l) => implode(' | ', [$l[0], $l[1], $l[2], $l[3] ? 'sans chevauchement' : 'chevauchement permis']), $this->attendu());

        $this->assertSame(
            [[], []],
            [$this->ecart($attendues, $reelles), $this->ecart($reelles, $attendues)],
            "Le planificateur s'écarte de PLAN — [absentes du planificateur, absentes de la table]. Une tâche "
            .'ajoutée ou modifiée dans routes/console.php s\'écrit aussi dans PLAN (TCK-3015).',
        );
    }

    /** Le battement de chaque file : la table écrit les files en dur, le job les lit dans sa constante. */
    public function test_chaque_file_surveillee_a_son_battement(): void
    {
        $this->assertSame(self::FILES_DU_BATTEMENT, RecordQueueHeartbeat::QUEUES);
    }

    /**
     * TCK-737 (P05.01) — le verrou `withoutOverlapping()` d'une tâche ne survit pas à sa période.
     *
     * Un `schedule:run` tué au redéploiement ne rend pas son verrou : il reste dans le cache jusqu'à
     * son échéance, 1 440 minutes par défaut. Une tâche de 5 minutes en sauterait 288 exécutions.
     * Borné à la période, le verrou orphelin ne coûte au plus qu'une exécution.
     */
    public function test_aucun_verrou_ne_survit_a_la_periode_de_sa_tache(): void
    {
        $tropLongs = [];
        foreach ($this->evenements() as $evenement) {
            $periode = $this->periodeEnMinutes($evenement->expression);
            if ($evenement->withoutOverlapping && $evenement->expiresAt > $periode) {
                $tropLongs[] = ScheduledRunRecorder::nomDe($evenement)." : verrou {$evenement->expiresAt} min, période {$periode} min";
            }
        }

        $this->assertSame([], $tropLongs, 'Un verrou withoutOverlapping() plus long que la période de sa tâche.');
    }

    /** TCK-2431 — le comptage des natures du radar lit les annonces AVANT que la purge ne les efface, au même fuseau. */
    public function test_le_comptage_radar_precede_la_purge(): void
    {
        $compte = $this->seul('radar:count-natures');
        $purge = $this->seul('radar:purge');

        $this->assertSame($this->fuseau($purge), $this->fuseau($compte));
        $this->assertLessThan($this->minuteDuJour($purge), $this->minuteDuJour($compte));
    }

    /** @return list<array{0: string, 1: string, 2: string, 3: bool}> */
    private function attendu(): array
    {
        $battements = array_map(
            fn () => [RecordQueueHeartbeat::class, '* * * * *', self::UTC, false],
            self::FILES_DU_BATTEMENT,
        );

        return [...self::PLAN, ...$battements];
    }

    /** @return list<Event> */
    private function evenements(): array
    {
        return array_values(app(Schedule::class)->events());
    }

    private function ligne(Event $evenement): string
    {
        return implode(' | ', [
            ScheduledRunRecorder::nomDe($evenement),
            $evenement->expression,
            $this->fuseau($evenement),
            $evenement->withoutOverlapping ? 'sans chevauchement' : 'chevauchement permis',
        ]);
    }

    /**
     * Ce que `$de` porte en plus de `$moins`, en multiensemble (le battement compte six lignes identiques).
     *
     * @param  list<string>  $de
     * @param  list<string>  $moins
     * @return list<string>
     */
    private function ecart(array $de, array $moins): array
    {
        $reste = array_count_values($moins);
        $ecart = [];
        foreach ($de as $ligne) {
            if (($reste[$ligne] ?? 0) > 0) {
                $reste[$ligne]--;
            } else {
                $ecart[] = $ligne;
            }
        }
        sort($ecart);

        return $ecart;
    }

    private function seul(string $tache): Event
    {
        $trouves = array_values(array_filter($this->evenements(), fn (Event $e) => ScheduledRunRecorder::nomDe($e) === $tache));
        $this->assertCount(1, $trouves, $tache);

        return $trouves[0];
    }

    private function fuseau(Event $evenement): string
    {
        return $evenement->timezone instanceof DateTimeZone ? $evenement->timezone->getName() : (string) $evenement->timezone;
    }

    private function minuteDuJour(Event $evenement): int
    {
        [$minute, $heure] = explode(' ', $evenement->expression);

        return (int) $heure * 60 + (int) $minute;
    }

    private function periodeEnMinutes(string $expression): int
    {
        $cron = new CronExpression($expression);
        $depuis = Carbon::parse('2026-10-05 00:00:00');

        return (int) Carbon::instance($cron->getNextRunDate($depuis, 0))
            ->diffInMinutes(Carbon::instance($cron->getNextRunDate($depuis, 1)));
    }
}
