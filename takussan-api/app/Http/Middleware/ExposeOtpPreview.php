<?php

namespace App\Http\Middleware;

use App\Services\Auth\OtpPreview;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-620 (ADR-0060) — ajoute `otp_preview` à la réponse JSON de la requête qui a émis un code
 * SMS, quand {@see OtpPreview} est ouvert. Un seul point de sortie : aucun contrôleur n'écrit
 * le code lui-même.
 */
class ExposeOtpPreview
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        // Résolu à l'appel, comme chez les émetteurs : `OtpPreview` est SCOPED.
        $code = app(OtpPreview::class)->pull();

        if ($code === null || ! $response instanceof JsonResponse) {
            return $response;
        }

        $payload = $response->getData(true);
        if (is_array($payload) && ! array_is_list($payload)) {
            $response->setData(['otp_preview' => $code] + $payload);
        }

        return $response;
    }
}
