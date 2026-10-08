<?php

namespace App\Http\Middleware;

use App\Services\Webhooks\WebhookJournal;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * TCK-602 (ADR-0051 §4) — `webhook.journal:{canal}[,{fournisseur}]`.
 *
 * Écrit la ligne du journal AVANT tout traitement, puis la ferme toujours. Il se place juste après
 * `throttle` (le débit protège la table) et avant `restrict.ip` et la signature : un webhook refusé
 * par l'IP, le jeton ou la signature laisse sa ligne `rejected`.
 *
 * Le fournisseur est le second paramètre, sinon le paramètre de route `{provider}` (paiements).
 */
class JournalizeIncomingWebhook
{
    public function __construct(private readonly WebhookJournal $journal) {}

    public function handle(Request $request, Closure $next, string $channel, ?string $provider = null): Response
    {
        $provider ??= (string) $request->route('provider');
        $this->journal->open($request, $channel, $provider !== '' ? mb_substr($provider, 0, 60) : 'unknown');

        try {
            $response = $next($request);
        } catch (Throwable $e) {
            $this->journal->close(null, $e);

            throw $e;
        }

        $this->journal->close($response);

        return $response;
    }
}
