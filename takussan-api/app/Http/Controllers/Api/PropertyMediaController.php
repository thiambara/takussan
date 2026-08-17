<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ReorderPropertyMediaRequest;
use App\Http\Requests\Api\StorePropertyMediaRequest;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class PropertyMediaController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorize('viewMedia', $property);

        $media = $property->getMedia('photos')->map(fn (Media $m) => [
            'id' => $m->id,
            'thumbnail' => $m->getUrl('thumbnail'),
            'preview' => $m->getUrl('preview'),
            'original' => $m->getUrl(),
            'order' => $m->order_column,
        ]);

        return $this->json(['data' => $media->values()]);
    }

    public function store(StorePropertyMediaRequest $request, Property $property): JsonResponse
    {

        $added = [];
        foreach ($request->file('photos', []) as $photo) {
            $media = null;
            try {
                $media = $property->addMedia($photo)->toMediaCollection('photos');
            } catch (\Throwable $e) {
                $media?->delete();

                throw ValidationException::withMessages([
                    'photos' => ['Cette image ne peut pas être traitée. Vérifiez le fichier puis réessayez.'],
                ]);
            }

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
        $this->authorize('update', $property);
        $property->getMedia('photos')->firstWhere('id', $mediaId)?->delete();

        return $this->json(['message' => 'deleted'], 204);
    }

    public function reorder(ReorderPropertyMediaRequest $request, Property $property): JsonResponse
    {

        $data = $request->validated();

        $mediaCollection = $property->getMedia('photos');
        foreach ($data['order'] as $position => $mediaId) {
            $mediaCollection->firstWhere('id', $mediaId)?->update(['order_column' => $position + 1]);
        }

        return $this->json(['message' => 'reordered']);
    }
}
