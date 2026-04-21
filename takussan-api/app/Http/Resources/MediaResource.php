<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * @mixin Media
 */
class MediaResource extends BaseResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Media $media */
        $media = $this->resource;

        return [
            'id' => $media->id,
            'collection_name' => $media->collection_name,
            'file_name' => $media->file_name,
            'mime_type' => $media->mime_type,
            'size' => (int) $media->size,
            'url' => $media->getUrl(),
            'conversions' => [
                'thumbnail' => $this->conversionUrl($media, 'thumbnail'),
                'preview' => $this->conversionUrl($media, 'preview'),
                'full' => $this->conversionUrl($media, 'full'),
            ],
            'model_type' => $media->model_type,
            'model_id' => $media->model_id,
            'created_at' => $this->iso($media->created_at),
        ];
    }

    protected function conversionUrl(Media $media, string $name): ?string
    {
        if (! $media->hasGeneratedConversion($name)) {
            return null;
        }

        $url = $media->getUrl($name);

        return $url !== '' ? $url : null;
    }
}
