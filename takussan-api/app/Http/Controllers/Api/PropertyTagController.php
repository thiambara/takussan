<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PropertyTagController extends Controller
{
    public function sync(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validate([
            'tag_ids' => ['present', 'array'],
            'tag_ids.*' => [
                'integer',
                Rule::exists('tags', 'id')->where(fn ($q) => $q->where('type', TagType::Amenity->value)),
            ],
        ], [
            'tag_ids.*.exists' => __('validation.exists', ['attribute' => 'tag_ids']),
        ]);

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
            || $user->hasRole('super_admin');
        abort_unless($ok, 403);
    }
}
