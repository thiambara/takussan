<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Enums\ScheduledTaskRunStatus;
use App\Models\ScheduledTaskRun;
use App\Services\Admin\ScheduledRunRecorder;
use Illuminate\Console\Events\ScheduledBackgroundTaskFinished;
use Illuminate\Console\Events\ScheduledTaskFailed;
use Illuminate\Console\Events\ScheduledTaskFinished;
use Illuminate\Console\Events\ScheduledTaskSkipped;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * TCK-383 — le statut RÉEL d'une exécution du scheduler.
 *
 * ⚠ Ces tests font tourner de VRAIES tâches planifiées, via `schedule:run`. Asserter sur deux lignes
 * insérées à la main cocherait aussi l'implémentation d'avant, qui écrivait `'finished'` en dur : ce
 * que le ticket demande de prouver, c'est le CHEMIN entre une tâche qui échoue et la ligne écrite,
 * et ce chemin passe par le framework.
 */
class SchedulerRunStatusTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Un planificateur qui ne contient QUE les tâches du test.
     *
     * Le noyau console est amorcé d'abord, exprès : c'est lui qui charge `routes/console.php`, donc
     * les ~22 tâches réelles de l'application. Sans cet amorçage, elles atterriraient dans
     * l'instance de remplacement et `schedule:run` exécuterait pour de bon celles qui sont dues à la
     * minute où le test tourne.
     */
    private function planificateurIsole(): Schedule
    {
        $this->app->make(Kernel::class)->bootstrap();

        $schedule = new Schedule;
        $this->app->instance(Schedule::class, $schedule);

        return $schedule;
    }

    /** AC1 — une tâche qui sort en code non nul ne s'enregistre pas comme une tâche réussie. */
    public function test_a_failing_scheduled_task_is_not_recorded_like_a_successful_one(): void
    {
        $schedule = $this->planificateurIsole();
        $schedule->call(fn () => false)->name('tache-en-echec')->everyMinute();
        $schedule->call(function (): void {
            usleep(20_000);
        })->name('tache-reussie')->everyMinute();
        $schedule->call(fn () => true)->name('tache-ecartee')->everyMinute()->skip(fn () => true);

        $this->artisan('schedule:run');

        // Le compte prouve deux choses d'un coup : qu'aucune tâche réelle n'a fui dans le
        // planificateur isolé, et qu'une exécution en échec — qui dispatche `ScheduledTaskFinished`
        // PUIS `ScheduledTaskFailed` — n'écrit qu'UNE ligne.
        $this->assertSame(3, ScheduledTaskRun::query()->count());

        $echec = ScheduledTaskRun::query()->where('task', 'tache-en-echec')->sole();
        $succes = ScheduledTaskRun::query()->where('task', 'tache-reussie')->sole();
        $ecartee = ScheduledTaskRun::query()->where('task', 'tache-ecartee')->sole();

        $this->assertSame(ScheduledTaskRunStatus::Failed, $echec->status);
        $this->assertSame(ScheduledTaskRunStatus::Finished, $succes->status);
        $this->assertSame(ScheduledTaskRunStatus::Skipped, $ecartee->status);
        $this->assertNotEquals($succes->status, $echec->status);
    }

    /** AC1 (second chemin) — une tâche qui LÈVE ne dispatche pas `ScheduledTaskFinished` du tout. */
    public function test_a_throwing_scheduled_task_is_recorded_as_failed(): void
    {
        $schedule = $this->planificateurIsole();
        $schedule->call(function (): void {
            throw new \RuntimeException('boum');
        })->name('tache-qui-leve')->everyMinute();

        $this->artisan('schedule:run');

        $ligne = ScheduledTaskRun::query()->where('task', 'tache-qui-leve')->sole();
        $this->assertSame(ScheduledTaskRunStatus::Failed, $ligne->status);
    }

    /** AC3 — la durée est celle que le framework a mesurée, plus `null`. */
    public function test_a_real_execution_records_its_duration(): void
    {
        $schedule = $this->planificateurIsole();
        $schedule->call(function (): void {
            usleep(60_000);
        })->name('tache-mesuree')->everyMinute();

        $this->artisan('schedule:run');

        $ligne = ScheduledTaskRun::query()->where('task', 'tache-mesuree')->sole();
        $this->assertNotNull($ligne->duration_ms);
        $this->assertGreaterThan(0, $ligne->duration_ms);

        $this->actingAsRole('super_admin');
        $this->getJson('/api/admin/scheduler')
            ->assertOk()
            ->assertJsonPath('data.0.task', 'tache-mesuree')
            ->assertJsonPath('data.0.last_status', 'finished');

        $moyenne = $this->getJson('/api/admin/scheduler')->json('data.0.average_duration_ms');
        $this->assertNotNull($moyenne);
        $this->assertGreaterThan(0, $moyenne);
    }

    /**
     * AC2 — l'endpoint rend le statut de la DERNIÈRE exécution, pas un agrégat.
     *
     * Une seule ligne par tâche ne distinguerait pas les deux. Et l'ordre alphabétique est
     * volontairement à contre-sens de la chronologie : `max(status)` rendrait `failed` sur la ligne
     * ancienne si le tri était lexical — non, `failed` < `finished`, donc `max` rendrait `finished`
     * ici. Le cas inverse est couvert par le test suivant.
     */
    public function test_scheduler_endpoint_returns_the_status_of_the_latest_run(): void
    {
        $this->actingAsRole('super_admin');

        ScheduledTaskRun::query()->create([
            'task' => 'daily-cleanup',
            'last_run_at' => now()->subDay(),
            'duration_ms' => 100,
            'status' => ScheduledTaskRunStatus::Failed,
        ]);
        ScheduledTaskRun::query()->create([
            'task' => 'daily-cleanup',
            'last_run_at' => now(),
            'duration_ms' => 200,
            'status' => ScheduledTaskRunStatus::Finished,
        ]);

        $this->getJson('/api/admin/scheduler')
            ->assertOk()
            ->assertJsonPath('data.0.task', 'daily-cleanup')
            ->assertJsonPath('data.0.last_status', 'finished')
            ->assertJsonPath('data.0.average_duration_ms', 150);
    }

    /**
     * Une tâche DÉTACHÉE n'a pas encore de code de sortie — et « pas encore » n'est pas « a réussi ».
     *
     * C'est le seul cas que l'écouteur d'échec ne rattrape pas : le framework ne lève rien sur une
     * tâche `runInBackground()`, donc `ScheduledTaskFailed` ne passe jamais. Sans la branche
     * `exitCode === null`, une tâche dont personne n'a vu la fin s'afficherait `finished`.
     *
     * ⚠ **Ce test dispatche l'événement À LA MAIN, et c'est un aveu, pas une commodité.** Aucune des
     * 22 tâches planifiées n'utilise `runInBackground()` (mesuré) : il n'existe aujourd'hui AUCUN
     * chemin réel vers cette branche. Ce qui est éprouvé ici est la branche, pas son déclenchement —
     * et le test suivant garde la condition qui rend cet aveu périmé.
     */
    public function test_a_task_with_no_exit_code_yet_is_not_recorded_as_finished(): void
    {
        $schedule = $this->planificateurIsole();
        $tache = $schedule->command('inspire')->name('tache-detachee');
        $this->assertNull($tache->exitCode);

        Event::dispatch(new ScheduledTaskFinished($tache, 0.5));

        $ligne = ScheduledTaskRun::query()->where('task', 'tache-detachee')->sole();
        $this->assertSame(ScheduledTaskRunStatus::Running, $ligne->status);
        $this->assertSame(500, $ligne->duration_ms);
    }

    /**
     * Le statut `running` est une IMPASSE : rien ne le résout, et ce test le dit.
     *
     * `schedule:finish` dispatche `ScheduledBackgroundTaskFinished` — un événement DIFFÉRENT de
     * `ScheduledTaskFinished` —, et ce dépôt n'a aucun écouteur pour lui. Une ligne posée à
     * `running` y resterait pour toujours, et l'écran afficherait une tâche perpétuellement « en
     * cours ».
     *
     * Aujourd'hui la condition n'est atteinte par personne : `runInBackground` = 0 sur 22 tâches.
     * Ce test rougit le jour où quelqu'un ajoute la première — au moment exact où il faut lire le
     * docblock de `ScheduledTaskRunStatus::Running` plutôt que dix commits plus tard.
     *
     * Il éprouve l'EFFET et non l'existence d'un écouteur : la ligne `running` doit cesser de l'être.
     * Sa première version se contentait de `assertNotEmpty(Event::getListeners(…))`, qu'un écouteur au
     * corps vide satisfaisait.
     *
     * *Un commentaire qui décrit une dette ne la garde pas ; un test qui rougit sur sa condition,
     * oui.*
     */
    public function test_a_background_task_would_leave_its_run_stuck_in_running(): void
    {
        $this->app->make(Kernel::class)->bootstrap();
        $reel = $this->app->make(Schedule::class);

        $enArrierePlan = collect($reel->events())
            ->filter(fn ($tache) => $tache->runInBackground)
            ->map(fn ($tache) => ScheduledRunRecorder::nomDe($tache))
            ->values()
            ->all();

        if ($enArrierePlan === []) {
            // L'état mesuré : aucune tâche détachée, donc la branche `running` est inatteignable.
            $this->assertSame([], $enArrierePlan);

            return;
        }

        /*
         * ⚠ On éprouve l'EFFET, pas l'existence.
         *
         * `assertNotEmpty(Event::getListeners(…))` était la première forme de cette assertion, et
         * elle promettait plus qu'elle n'éprouvait : un écouteur au corps VIDE la satisfaisait
         * (mesuré). Un test qui accepte une coquille est de la même famille qu'un commentaire qui
         * décrit un mécanisme absent — il fabrique une confiance que rien ne porte.
         *
         * La propriété qui compte est donc jouée : une ligne `running` posée, l'événement de fin
         * dispatché, et la ligne ne doit plus être `running`.
         */
        $tache = collect($reel->events())->first(fn ($t) => $t->runInBackground);
        $tache->exitCode = 0;

        $ligne = ScheduledTaskRun::query()->create([
            'task' => ScheduledRunRecorder::nomDe($tache),
            'last_run_at' => now(),
            'duration_ms' => null,
            'status' => ScheduledTaskRunStatus::Running,
        ]);

        Event::dispatch(new ScheduledBackgroundTaskFinished($tache));

        $this->assertNotSame(
            ScheduledTaskRunStatus::Running,
            $ligne->fresh()->status,
            sprintf(
                'Ces tâches tournent en arrière-plan : %s. Leur exécution est enregistrée `running` '
                .'et RIEN ne la résout — `schedule:finish` dispatche `ScheduledBackgroundTaskFinished`, '
                ."qui n'a aucun écouteur ici. Poser cet écouteur : il doit retrouver la dernière ligne "
                .'`running` de la tâche et la fermer sur `exitCode`. La déduplication par '
                .'`spl_object_id` du recorder ne peut PAS servir — autre processus, objet `Event` '
                .'reconstruit par son mutex, donc la recherche se fait par requête.',
                implode(', ', $enArrierePlan),
            ),
        );
    }

    /**
     * Un écouteur enregistré DEUX fois écrit deux lignes pour une exécution.
     *
     * `app/Listeners` est découvert automatiquement (`Application::configure()` appelle
     * `withEvents()`), et un `Event::listen()` explicite s'y ajoute au lieu de s'y substituer. Mesuré
     * le 2026-08-27 sur `dev` : **2 / 0 / 0** écouteurs pour `ScheduledTaskFinished` / `Failed` /
     * `Skipped` — seul le premier était écouté, et il l'était DEUX fois —, d'où deux lignes de
     * `scheduled_task_runs` pour une seule tâche planifiée.
     *
     * ⚠⚠ **C'est le SEUL test du dépôt qui attrape le doublon, et ce n'est pas une supposition :
     * mesuré par ablation.** Remettre le `Event::listen()` explicite ne fait rougir que celui-ci —
     * l'assertion de compte de `test_a_failing_scheduled_task…` reste VERTE, parce que la
     * déduplication par `spl_object_id` de `ScheduledRunRecorder` absorbe le double enregistrement
     * et n'écrit qu'une ligne quand même.
     *
     * Autrement dit : le recorder rend le doublon INVISIBLE dans les données, ce qui est
     * exactement ce qui l'a laissé vivre trois mois ailleurs dans le dépôt. Le supprimer, c'est
     * rouvrir le motif sans aucun rouge.
     */
    public function test_each_scheduler_event_is_listened_to_exactly_once(): void
    {
        foreach ([ScheduledTaskFinished::class, ScheduledTaskFailed::class, ScheduledTaskSkipped::class] as $evenement) {
            $this->assertCount(1, Event::getListeners($evenement), $evenement);
        }
    }

    /** AC2, l'autre sens : le dernier statut est le PLUS PETIT alphabétiquement. */
    public function test_the_latest_status_wins_even_when_it_sorts_first_alphabetically(): void
    {
        $this->actingAsRole('super_admin');

        ScheduledTaskRun::query()->create([
            'task' => 'daily-cleanup',
            'last_run_at' => now()->subDay(),
            'duration_ms' => 100,
            'status' => ScheduledTaskRunStatus::Skipped,
        ]);
        ScheduledTaskRun::query()->create([
            'task' => 'daily-cleanup',
            'last_run_at' => now(),
            'duration_ms' => 200,
            'status' => ScheduledTaskRunStatus::Failed,
        ]);

        $this->getJson('/api/admin/scheduler')
            ->assertOk()
            ->assertJsonPath('data.0.last_status', 'failed');
    }
}
