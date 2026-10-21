<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * P98.08 (TCK-1172) — la route des webhooks Lemon Squeezy de la plateforme refuse tout quand
 * `lemon-squeezy.signing_secret` est vide. Le contrôleur du paquet n'ajoute son middleware de
 * signature que si ce secret est rempli : sans lui, un corps non signé atteignait le gestionnaire, et
 * le `signing_secret` saisi dans la console ne change rien à cette route (il n'est poussé dans la
 * configuration que par les appels sortants du pilote). 403, comme une signature fausse : la ligne du
 * journal reste `rejected`. `HealthcheckService` signale le cas (`lemon_squeezy_webhook`).
 */
class RequireLemonSqueezySigningSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_if((string) config('lemon-squeezy.signing_secret', '') === '', 403, 'Invalid signature.');

        return $next($request);
    }
}
