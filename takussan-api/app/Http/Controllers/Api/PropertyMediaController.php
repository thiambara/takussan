<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class PropertyMediaController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorizeView($request, $property);

        $media = $property->getMedia('photos')->map(fn (Media $m) => [
            'id' => $m->id,
            'thumbnail' => $m->getUrl('thumbnail'),
            'preview' => $m->getUrl('preview'),
            'original' => $m->getUrl(),
            'order' => $m->order_column,
        ]);

        return $this->json(['data' => $media->values()]);
    }

    public function store(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $request->validate([
            'photos' => ['required', 'array'],
            'photos.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ]);

        $added = [];
        foreach ($request->file('photos', []) as $photo) {
            $media = $property->addMedia($photo)->toMediaCollection('photos');
            $added[] = [
                'id' => $media->id,
                'thumbnail' => $media->getUrl('thumbnail'),
                'preview' => $media->getUrl('preview'),
                'original' => $media->getUrl(),
            ];
        }

        return $this->json(['data' => $added], 201);
    }

    public function destroy(Request $request, Property $property, int $mediaId): JsonResponse
    {
        $this->authorizeManage($request, $property);
        $property->getMedia('photos')->firstWhere('id', $mediaId)?->delete();

        return $this->json(['message' => 'deleted'], 204);
    }

    protected function authorizeManage(Request $request, Property $property): void
    {
        $user = $request->user();
        $ok = $user->id === $property->user_id
            || ($user->agency_id && $user->agency_id === $property->agency_id)
            || $user->hasRole(['admin', 'super_admin']);
        abort_unless($ok, 403);
    }

    protected function authorizeView(Request $request, Property $property): void
    {
        if ($property->visibility === PropertyVisibility::Public
            && $property->published_at !== null) {
            return;
        }
        $this->authorizeManage($request, $property);
    }
}
