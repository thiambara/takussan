<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Http\UploadedFile;

/**
 * TCK-2388 (ADR-0077 §3) — déposer la réponse d'un annonceur : de 1 à `radar.captures.max_files` captures d'écran,
 * images lues dans les octets, bornées comme celles de la saisie (`config('radar.captures')`, mêmes règles que
 * {@see StoreRadarListingRequest}). Les dimensions se jugent ensuite, dans `RadarCaptureReader`.
 */
class StoreRadarConsentReplyRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $captures = config('radar.captures');

        return [
            'captures' => ['required', 'array', 'min:1', 'max:'.$captures['max_files']],
            'captures.*' => ['required', 'file', 'mimetypes:'.implode(',', $captures['mimes']), 'max:'.$captures['max_kilobytes']],
        ];
    }

    /** @return list<UploadedFile> */
    public function captures(): array
    {
        return array_values($this->file('captures'));
    }
}
