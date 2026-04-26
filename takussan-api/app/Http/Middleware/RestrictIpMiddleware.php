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
 * is allowed only in non-production environments — production fails
 * closed (403) so a missing env var cannot silently expose the webhook.
 *
 * Request IP comes from `Request::ip()` which honours TrustProxies; an
 * empty trusted-proxy list lets clients spoof `X-Forwarded-For`, so the
 * deployment must register the load balancer's CIDR before this filter
 * is meaningful.
 */
class RestrictIpMiddleware
{
    public function handle(Request $request, Closure $next, string $provider): Response
    {
        $allowed = (array) config("sms.webhook_allowed_ips.{$provider}", []);
        $allowed = array_values(array_filter(array_map('trim', $allowed)));
        if (empty($allowed)) {
            if (app()->environment('production')) {
                abort(403, 'Webhook IP allowlist not configured');
            }

            return $next($request);
        }
        $ip = (string) $request->ip();
        if (! in_array($ip, $allowed, true)) {
            abort(403, 'Source IP not allowed');
        }

        return $next($request);
    }
}
