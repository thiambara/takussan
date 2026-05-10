<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\UpsertWizardDraftRequest;
use App\Models\WizardDraft;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-250 — Generic resumable wizard draft endpoints.
 *
 * `key` is a logical identifier owned by each consumer wizard
 * (e.g. `host-individual-wizard`, `owner-onboarding-{invitation_id}`).
 * Records are strictly user-scoped via the unique `(user_id, key)` index.
 */
class WizardDraftController extends Controller
{
    /**
     * GET /api/me/wizard-drafts — lists all active drafts for the current user.
     *
     * Used by the dashboard banner that surfaces drafts to resume.
     */
    public function index(Request $request): JsonResponse
    {
        $drafts = WizardDraft::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('updated_at')
            ->get(['id', 'key', 'step', 'data', 'updated_at']);

        return $this->json(['data' => $drafts]);
    }

    /**
     * GET /api/me/wizard-drafts/{key} — fetches the user's draft for a given key.
     *
     * Returns 404 if no draft exists yet — consumers should treat that as
     * "fresh start" rather than as an error.
     */
    public function show(Request $request, string $key): JsonResponse
    {
        $draft = WizardDraft::query()
            ->where('user_id', $request->user()->id)
            ->where('key', $key)
            ->first();

        if (! $draft) {
            return $this->json(['message' => 'No draft.'], 404);
        }

        return $this->json(['data' => $draft]);
    }

    /**
     * PUT /api/me/wizard-drafts/{key} — upserts the user's draft.
     *
     * Idempotent — repeated calls with the same payload converge. The
     * `(user_id, key)` unique constraint guarantees a single row per
     * (user, wizard) pair, even under concurrent saves.
     */
    public function upsert(UpsertWizardDraftRequest $request, string $key): JsonResponse
    {
        $draft = WizardDraft::updateOrCreate(
            [
                'user_id' => $request->user()->id,
                'key' => $key,
            ],
            [
                'step' => (int) $request->input('step', 0),
                'data' => $request->input('data', []),
            ],
        );

        return $this->json(['data' => $draft], $draft->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * DELETE /api/me/wizard-drafts/{key} — clears the user's draft.
     *
     * Called at wizard completion or on explicit user abandon. 204 even
     * when the draft did not exist — DELETE is idempotent.
     */
    public function destroy(Request $request, string $key): JsonResponse
    {
        WizardDraft::query()
            ->where('user_id', $request->user()->id)
            ->where('key', $key)
            ->delete();

        return $this->json(null, 204);
    }
}
