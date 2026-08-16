<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\GenericMediaUploadRequest;
use App\Http\Requests\MediaUploadRequest;
use App\Http\Resources\MediaResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpFoundation\Response;

class MediaController extends Controller
{
    public function store(MediaUploadRequest $request): JsonResponse
    {
        $data = $request->validated();

        /** @var class-string<Model&HasMedia> $type */
        $type = $data['model_type'];
        $target = $type::query()->findOrFail($data['model_id']);

        if (! $target instanceof HasMedia) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Target model does not support media.');
        }

        // Authorize: we piggyback on the target's own `update` policy when one
        // exists (that's the spec's "only actors allowed to mutate the target
        // may upload its media"). If the target has no policy we fall back to
        // an owner-only check.
        $this->authorizeAttach($request, $target);

        $upload = $request->file('file');
        $original = $upload->getClientOriginalName();
        $extension = $upload->getClientOriginalExtension();
        $base = pathinfo($original, PATHINFO_FILENAME);
        $slug = Str::slug($base) ?: 'file';
        $fileName = $slug.($extension !== '' ? '.'.strtolower($extension) : '');

        $media = $target
            ->addMedia($upload->getRealPath())
            ->usingFileName($fileName)
            ->usingName($slug)
            ->toMediaCollection($data['collection']);

        // refresh() to pick up generated_conversions written by the sync
        // conversion job — fresh() would discard our reference and could
        // (theoretically) return null.
        $media->refresh();

        return $this->json([
            'data' => (new MediaResource($media))->toArray($request),
        ], Response::HTTP_CREATED);
    }

    /**
     * Generic, non-coupled upload: any authenticated user may upload a file.
     * The resulting Media row is attached to the caller (owner) so cleanup
     * and authorization remain well-defined even without a target model.
     */
    public function upload(GenericMediaUploadRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = $request->user();

        $collection = $data['collection'] ?? 'photos';

        $upload = $request->file('file');
        $original = $upload->getClientOriginalName();
        $extension = $upload->getClientOriginalExtension();
        $base = pathinfo($original, PATHINFO_FILENAME);
        $slug = Str::slug($base) ?: 'file';
        $fileName = $slug.($extension !== '' ? '.'.strtolower($extension) : '');

        $media = $user
            ->addMedia($upload->getRealPath())
            ->usingFileName($fileName)
            ->usingName($slug)
            ->toMediaCollection($collection);

        return $this->json([
            'data' => (new MediaResource($media->fresh()))->toArray($request),
        ], Response::HTTP_CREATED);
    }

    public function destroy(Media $media): JsonResponse
    {
        Gate::authorize('delete', $media);

        $media->delete();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * Authorize the current user to attach media to the given target.
     *
     * Strategy:
     *   0. Super admins pass, explicitly and first (see below).
     *   1. If the target has a policy with an `update` method registered,
     *      delegate to it.
     *   2. Otherwise, fall back to user_id ownership or self-targeting.
     *
     * ⚠ TCK-290 — this docblock used to claim the super_admin bypass applied
     * to the method as a whole. It did not, and step 0 is what makes the claim
     * true instead of deleting it. Only branch 1 consults the Gate, so only
     * branch 1 reached the `Gate::before` bypass; the fallback never touches
     * the Gate, so for any `model_type` without a policy whose instance is
     * neither the calling `User` nor carries a `user_id`, it denied EVERYONE —
     * super admins included. That is exactly what made the agency-logo upload
     * impossible before `AgencyPolicy` existed, and **the overwhelming majority
     * of models have no policy at all** (`ls app/Policies` against the model
     * classes under `app/Models` — the ratio is roughly one in five, and no
     * number is written here because it moves with every model added). Fixing
     * it by adding one policy fixed one model and left all the others broken
     * the same way, waiting for the next person to trip on it. The bypass
     * belongs where every branch sees it.
     *
     * It changes nothing for the models that DO have a policy — those already
     * granted super admins through `Gate::before` — so the whole of its effect
     * is the fallback branch it was always meant to cover.
     */
    protected function authorizeAttach(MediaUploadRequest $request, $target): void
    {
        $user = $request->user();

        // Step 0 — the global `Gate::before` bypass, written out here because
        // the fallback below never asks the Gate anything.
        if ($user->isSuperAdmin()) {
            return;
        }

        // Try policy-based authorization first.
        $policy = Gate::getPolicyFor($target);
        if ($policy !== null && method_exists($policy, 'update')) {
            if ($user->can('update', $target)) {
                return;
            }
            abort(Response::HTTP_FORBIDDEN);
        }

        // Fallback: owner-only.
        if ($target instanceof User && $target->id === $user->id) {
            return;
        }

        if (isset($target->user_id) && (int) $target->user_id === (int) $user->id) {
            return;
        }

        abort(Response::HTTP_FORBIDDEN);
    }
}
