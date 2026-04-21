<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
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
     *   1. If the target has a policy with an `update` method registered,
     *      delegate to it (super_admin bypass still applies via Gate::before).
     *   2. Otherwise, fall back to user_id ownership or self-targeting.
     */
    protected function authorizeAttach(MediaUploadRequest $request, $target): void
    {
        $user = $request->user();

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
