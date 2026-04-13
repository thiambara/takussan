<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    /**
     * Handle an incoming request.
     *
     * @param Closure(Request): (Response) $next
     */
    public function handle(Request $request, Closure $next, string|array $permissions, bool $any = false): Response
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $permissions = is_array($permissions) ? $permissions : [$permissions];
        $condition = $any ? $user->hasAnyPermission($permissions) : $user->hasAllPermissions($permissions);

        if (!$condition) {
            $permissionMessage = implode($any ? ' or ' : ' and ', $permissions);
            return response()->json(['message' => 'Unauthorized. Missing required permission: ' . $permissionMessage], 403);
        }

        return $next($request);
    }
}
