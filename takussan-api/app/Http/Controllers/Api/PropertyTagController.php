<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\SyncPropertyTagRequest;
use App\Models\Property;
use App\Models\Tag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PropertyTagController extends Controller
{
    public function sync(SyncPropertyTagRequest $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validated();

        $property->tags()->sync($data['tag_ids']);

        return $this->json(['data' => $property->tags()->get()]);
    }

    public function destroy(Request $request, Property $property, Tag $tag): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $property->tags()->detach($tag->id);

        return $this->json(null, 204);
    }

    protected function authorizeManage(Request $request, Property $property): void
    {
        $user = $request->user();
        $ok = $user->id === $property->user_id
            || ($user->agency_id && $user->agency_id === $property->agency_id)
            || $user->isSuperAdmin();
        abort_unless($ok, 403);
    }
}
