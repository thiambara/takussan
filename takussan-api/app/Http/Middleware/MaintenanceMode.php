<?php

namespace App\Http\Middleware;

use App\Services\Admin\MaintenanceService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class MaintenanceMode
{
    public function __construct(private readonly MaintenanceService $maintenance) {}

    public function handle(Request $request, Closure $next): Response
    {
        if ($this->maintenance->shouldBlock($request->method(), $request->path())) {
            return response()->json([
                'message' => 'Maintenance in progress.',
                'maintenance' => $this->maintenance->status(),
            ], 503);
        }

        return $next($request);
    }
}
