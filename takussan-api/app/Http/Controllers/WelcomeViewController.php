<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreWelcomeViewRequest;
use App\Models\WelcomeView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-251 — Tracks one-shot welcome modales.
 *
 * Frontend modales call `POST /api/me/welcome-seen` once the user has
 * dismissed (skip) or completed (last slide) the flow. They consult
 * `GET /api/me/welcome-seen` on mount to decide whether to render at
 * all. `key` is owned by each consumer modale — see `WelcomeView` and
 * the `useWelcomeOnce` hook on the frontend.
 */
class WelcomeViewController extends Controller
{
    /**
     * GET /api/me/welcome-seen — returns the keys the current user has
     * already acknowledged.
     */
    public function index(Request $request): JsonResponse
    {
        $keys = WelcomeView::query()
            ->where('user_id', $request->user()->id)
            ->orderBy('key')
            ->pluck('key')
            ->all();

        return $this->json(['data' => $keys]);
    }

    /**
     * POST /api/me/welcome-seen — marks a key as seen for the current
     * user. Idempotent: replaying with the same key is a no-op thanks
     * to the unique `(user_id, key)` index.
     */
    public function store(StoreWelcomeViewRequest $request): JsonResponse
    {
        $view = WelcomeView::firstOrCreate(
            [
                'user_id' => $request->user()->id,
                'key' => $request->string('key')->toString(),
            ],
            [
                'seen_at' => now(),
            ],
        );

        return $this->json(['data' => $view], $view->wasRecentlyCreated ? 201 : 200);
    }
}
