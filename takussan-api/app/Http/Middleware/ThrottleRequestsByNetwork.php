<?php

namespace App\Http\Middleware;

use App\Support\VisitorFingerprint;
use Illuminate\Routing\Middleware\ThrottleRequests;

/**
 * TCK-851 (P37.01) — l'alias `throttle`. Pour un débit numérique (`throttle:5,10`), le framework
 * signe un appelant sans compte par `domaine|IP` : une IPv6 y valait son adresse complète, et
 * un abonné repartait avec un seau neuf à chaque adresse de son /64. La signature prend ici la
 * même clé que les limiteurs nommés, `VisitorFingerprint::network`. Les limiteurs nommés ne
 * passent pas par cette méthode : leur clé est celle de leur `Limit`.
 */
class ThrottleRequestsByNetwork extends ThrottleRequests
{
    protected function resolveRequestSignature($request)
    {
        if ($request->user() !== null || $request->route() === null) {
            return parent::resolveRequestSignature($request);
        }

        $signature = $request->route()->getDomain().'|'.VisitorFingerprint::network((string) $request->ip());

        return self::$shouldHashKeys ? sha1($signature) : $signature;
    }
}
