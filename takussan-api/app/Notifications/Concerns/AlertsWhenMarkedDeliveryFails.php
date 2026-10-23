<?php

namespace App\Notifications\Concerns;

use App\Support\Logging\SafeExceptionContext;
use Illuminate\Database\Eloquent\Model;
use Throwable;

/**
 * TCK-1794 (P142.02) — pour une notification dont l'appelant pose une marque « envoyé » dès la
 * mise en file (`tenant_welcomed_at`, le marqueur de rappel d'une tâche, `reminders_sent` d'une
 * checklist, les compteurs de relance d'une facture). La marque ne se relit pas : si le worker
 * abandonne l'envoi d'un canal, rien ne le renvoie, et la trace dit qu'il est parti.
 *
 * L'échec final garde le journal de {@see RetriesWithBackoff}, et écrit en plus l'activité alertable
 * `ops_critical_job_failed` (comme les jobs et écouteurs d'argent et de bail, TCK-772, TCK-1392),
 * rattachée à l'objet de l'envoi : l'exploitation est prévenue dès le premier abandon, et sait
 * lequel. Jamais le message de l'exception (ADR-0044 § 2). La marque n'est pas touchée : retirer
 * la marque pour que le passage suivant renvoie est une autre voie, non retenue ici.
 */
trait AlertsWhenMarkedDeliveryFails
{
    use RetriesWithBackoff {
        failed as journaliserEchec;
    }

    /** L'objet dont la marque dit l'envoi parti : le bail, la tâche, la facture. */
    abstract protected function sujetDeLEnvoi(): ?Model;

    public function failed(?Throwable $e): void
    {
        $this->journaliserEchec($e);

        $context = $e !== null ? SafeExceptionContext::of($e) : [];
        $activite = activity('Ops')->event('ops_critical_job_failed');

        $sujet = $this->sujetDeLEnvoi();
        if ($sujet !== null) {
            $activite->performedOn($sujet);
        }

        $activite
            ->withProperties([
                'job' => class_basename(static::class),
                'channel' => $this->queuedChannel,
                'exception' => $context['exception'] ?? null,
                'at' => $context['at'] ?? null,
            ])
            ->log('ops_critical_job_failed');
    }
}
