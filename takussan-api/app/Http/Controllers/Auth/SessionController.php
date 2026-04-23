<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SessionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $currentId = $request->user()->currentAccessToken()?->id;

        $tokens = $request->user()->tokens()
            ->orderByDesc('last_used_at')
            ->get()
            ->map(fn ($token) => [
                'id' => $token->id,
                'name' => $token->name,
                'last_used_at' => $token->last_used_at?->toISOString(),
                'created_at' => $token->created_at?->toISOString(),
                'ip' => $token->ip ?? null,
                'user_agent' => $token->user_agent ?? null,
                'current' => $token->id === $currentId,
            ]);

        return $this->json(['data' => $tokens->values()]);
    }

    public function destroy(Request $request, int $tokenId): JsonResponse
    {
        $currentId = $request->user()->currentAccessToken()?->id;
        abort_if($tokenId === $currentId, 422, 'Cannot revoke the current session — use logout instead.');

        $deleted = $request->user()->tokens()->where('id', $tokenId)->delete();
        abort_unless($deleted > 0, 404, 'Session not found.');

        return $this->json(null, 204);
    }
}
