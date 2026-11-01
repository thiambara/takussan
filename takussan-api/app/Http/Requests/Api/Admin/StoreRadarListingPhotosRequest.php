<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Http\UploadedFile;

/**
 * TCK-2389 (décision 3a) — déposer de 1 à 10 photos dans la réserve d'une annonce : images JPEG, PNG ou WebP lues dans les
 * octets, bornées en taille par `radar.photos.max_bytes`. Les dimensions et la place restante se jugent ensuite, dans
 * `RadarPhotoReserve`.
 */
class StoreRadarListingPhotosRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'photos' => ['required', 'array', 'min:1', 'max:10'],
            'photos.*' => [
                'required', 'file', 'mimetypes:image/jpeg,image/png,image/webp',
                'max:'.intdiv((int) config('radar.photos.max_bytes'), 1024),
            ],
        ];
    }

    /** @return list<UploadedFile> */
    public function photos(): array
    {
        return array_values($this->file('photos'));
    }
}
