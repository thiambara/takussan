<?php

namespace Tests\Feature\Jobs;

use App\Jobs\SendRawNotificationEmailJob;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-770 (P14.06) — le `catch (\Throwable)` attrapait chaque tentative : le job finissait réussi
 * au premier échec, et `$tries`/`backoff` ne servaient à rien, contrairement à son commentaire.
 */
class SendRawNotificationEmailJobTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Exceptions::fake();
        Mail::shouldReceive('raw')->andThrow(new RuntimeException('smtp down'));
    }

    public function test_un_echec_avant_la_derniere_tentative_releve_pour_etre_retente(): void
    {
        $job = $this->job(attempts: 1);

        $this->expectException(RuntimeException::class);
        $job->handle();
    }

    public function test_un_echec_a_la_derniere_tentative_est_rapporte_sans_lever(): void
    {
        $job = $this->job(attempts: 3);

        $job->handle();

        Exceptions::assertReported(RuntimeException::class);
    }

    /** File `sync` (tests, environnement sans worker) : une seule tentative, qui ne casse pas l'appelant. */
    public function test_sur_la_file_sync_l_echec_n_atteint_pas_l_appelant(): void
    {
        config(['queue.default' => 'sync']);

        SendRawNotificationEmailJob::dispatch('a@example.test', 'Sujet', 'Corps');

        Exceptions::assertReported(RuntimeException::class);
    }

    private function job(int $attempts): SendRawNotificationEmailJob
    {
        $job = (new SendRawNotificationEmailJob('a@example.test', 'Sujet', 'Corps'))->withFakeQueueInteractions();
        $job->job->attempts = $attempts;

        return $job;
    }
}
