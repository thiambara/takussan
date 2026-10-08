<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiError;
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
            throw (new ApiError(503, 'maintenance.in_progress'))->with([
                'maintenance' => $this->maintenance->status(),
            ]);
        }

        return $next($request);
    }
}
