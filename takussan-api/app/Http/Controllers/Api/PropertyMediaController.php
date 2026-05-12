<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
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
        ], [
            'photos.required' => 'Sélectionnez au moins une photo.',
            'photos.*.image' => 'Le fichier doit être une image lisible.',
            'photos.*.mimes' => 'Formats acceptés : JPG, PNG ou WebP.',
            'photos.*.max' => 'Chaque photo doit peser 10 Mo maximum.',
        ]);

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
        $this->authorizeManage($request, $property);
        $property->getMedia('photos')->firstWhere('id', $mediaId)?->delete();

        return $this->json(['message' => 'deleted'], 204);
    }

    public function reorder(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validate([
            'order' => ['required', 'array'],
            'order.*' => ['integer'],
        ]);

        $mediaCollection = $property->getMedia('photos');
        foreach ($data['order'] as $position => $mediaId) {
            $mediaCollection->firstWhere('id', $mediaId)?->update(['order_column' => $position + 1]);
        }

        return $this->json(['message' => 'reordered']);
    }

    protected function authorizeManage(Request $request, Property $property): void
    {
        $user = $request->user();
        $ok = $user->id === $property->user_id
            || ($user->agency_id && $user->agency_id === $property->agency_id)
            || $user->hasRole('super_admin');
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
