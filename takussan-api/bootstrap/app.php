<?php

use App\Http\Middleware\EnsureSuperAdmin;
use App\Http\Middleware\ForceJsonResponseMiddleware;
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
        $middleware->api(prepend: [
            ForceJsonResponseMiddleware::class,
            SetLocaleMiddleware::class,
        ]);
        // TCK-141/142 — sole owner of the spatie team context for api
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
