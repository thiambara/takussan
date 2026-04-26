<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-102 — Drop inbound webhook calls whose source IP is not in the
 * provider's allowlist (`config('sms.webhook_allowed_ips.{provider}')`).
 *
 * The middleware is registered as `restrict.ip:provider`. An empty list
 * disables filtering — useful in `local` and `testing` environments.
 * Request IP is derived from `Request::ip()` which already honours the
 * trusted-proxy chain.
 */
class RestrictIpMiddleware
{
    public function handle(Request $request, Closure $next, string $provider): Response
    {
        $allowed = (array) config("sms.webhook_allowed_ips.{$provider}", []);
        $allowed = array_values(array_filter(array_map('trim', $allowed)));
        if (empty($allowed)) {
            return $next($request);
        }
        $ip = (string) $request->ip();
        if (! in_array($ip, $allowed, true)) {
            abort(403, 'Source IP not allowed');
        }

        return $next($request);
    }
}
