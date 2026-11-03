<?php

namespace App\Jobs\Concerns;

/**
 * TCK-2402 (ADR-0078, amendement) — un job qui appelle le modèle hors d'une requête HTTP
 * (`AiGateway`, un `SocleAgent`) passe par la file `ai`, servie par le seul `worker-ia`.
 *
 * Sans elle, il tournerait sur `default`, que `worker` lit derrière `notifications-urgent` : l'ordre
 * ne joue qu'entre deux jobs, donc une extraction de 85 s retient une notification urgente, et un
 * envoi de 20 URL met 20 extractions devant les notifications ordinaires.
 *
 * La connexion ne change pas : `ai` vit sur `database` (délai de reprise 90 s), donc le `$timeout`
 * du job reste sous 85 s — `scripts/check-queues.mjs` le vérifie, comme il exige ce trait de tout
 * job de `app/Jobs` qui appelle `AiGateway`. Un appel plus long irait sur `RunsOnLongQueue`.
 *
 * À appeler dans le constructeur, comme {@see RunsOnLongQueue} : `dispatch()` lit `$queue` sur
 * l'instance. La suite (`QUEUE_CONNECTION=sync`) exécute ces jobs sur place, la file est sans effet.
 */
trait RunsOnAiQueue
{
    protected function onAiQueue(): void
    {
        $this->onQueue('ai');
    }
}
