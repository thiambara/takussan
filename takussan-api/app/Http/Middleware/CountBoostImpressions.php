<?php

namespace App\Http\Middleware;

use App\Services\Boost\BoostStatsRecorder;
use App\Support\VisitorFingerprint;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-708 (P01.04, décision du porteur) — les impressions sponsorisées d'une requête publique ne se
 * comptent qu'une fois la réponse connue : une par visiteur et par bien sur 30 min, aucune sur un
 * 304.
 *
 * ⚠ À placer À L'EXTÉRIEUR de `cache.headers:etag` : `SetCacheHeaders` joue le contrôleur (donc la
 * recherche et ses impressions) AVANT de comparer l'ETag. Seul un middleware qui l'enveloppe voit
 * le 304.
 */
final class CountBoostImpressions
{
    public function __construct(private readonly BoostStatsRecorder $recorder) {}

    public function handle(Request $request, Closure $next): Response
    {
        $this->recorder->deferImpressions();

        try {
            $response = $next($request);
        } catch (\Throwable $e) {
            $this->recorder->discardImpressions();

            throw $e;
        }

        if ($response->getStatusCode() === Response::HTTP_NOT_MODIFIED || $response->getStatusCode() >= 400) {
            $this->recorder->discardImpressions();
        } else {
            $this->recorder->commitImpressions(VisitorFingerprint::of($request));
        }

        return $response;
    }
}
