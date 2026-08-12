<?php

use App\Http\Middleware\EnsureSuperAdmin;
use App\Http\Middleware\ForceJsonResponseMiddleware;
use App\Http\Middleware\MaintenanceMode;
use App\Http\Middleware\ResolveActiveProfile;
use App\Http\Middleware\RestrictIpMiddleware;
use App\Http\Middleware\SetLocaleMiddleware;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Trust the upstream proxy that fronts the API (Next.js server actions,
        // load balancer, reverse proxy). Without this, every request appears to
        // come from the proxy's IP and rate limiters keyed on `Request::ip()`
        // become a single shared bucket for all visitors. Configure via the
        // `TRUSTED_PROXIES` env var as a comma-separated list of IPs/CIDRs
        // (e.g. `10.0.0.0/8,::1`). Defaults to loopback only — production must
        // pin it to the actual proxy address(es) before XFF can be honoured.
        $middleware->trustProxies(at: array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1,::1')),
        ))));

        $middleware->api(prepend: [
            ForceJsonResponseMiddleware::class,
            SetLocaleMiddleware::class,
            MaintenanceMode::class,
        ]);
        // TCK-141/142 — résout le profil ACTIF de la requête (ADR-0004).
        // Ce commentaire parlait du « spatie team context » : le package est
        // désinstallé depuis TCK-278, il n'y a plus de contexte d'équipe à
        // posséder — seulement un profil actif, lu par `request()->activeProfile()`.
        // requests since `users.agency_id` was dropped. Resolves the active
        // profile via header / query / cookie / auto-single, then locks
        // `setPermissionsTeamId($profile?->agency_id)`. Runs at the end of
        // the api group so `$request->user()` is already authenticated.
        $middleware->api(append: [
            ResolveActiveProfile::class,
        ]);
        // TCK-102 — alias the SMS webhook IP allowlist middleware.
        // TCK-144 — alias the super-admin gate for the /api/admin/* namespace.
        $middleware->alias([
            'restrict.ip' => RestrictIpMiddleware::class,
            'super-admin' => EnsureSuperAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());

        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            if ($e instanceof HttpExceptionInterface) {
                return new JsonResponse(
                    ['message' => $e->getMessage() !== '' ? $e->getMessage() : 'Error'],
                    $e->getStatusCode(),
                    $e->getHeaders(),
                );
            }

            return null;
        });
    })->create();
