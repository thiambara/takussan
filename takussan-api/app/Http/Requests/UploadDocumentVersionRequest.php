<?php

namespace App\Http\Requests;

use App\Support\Uploads\AcceptedUploads;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation for POST /api/documents/{document}/versions.
 *
 * Reuses the same file constraints as the original Document upload
 * (formats + max 10 MB), with an optional comment (max 500 chars).
 * TCK-601 — true since both read {@see AcceptedUploads::document()}; the
 * formats were announced here and checked nowhere.
 */
class UploadDocumentVersionRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Authorization is handled by the controller (same policy as Document::update).
        return true;
    }

    public function rules(): array
    {
        return [
            'file' => ['required', 'file', ...AcceptedUploads::document(10240)],
            'comment' => ['nullable', 'string', 'max:500'],
        ];
    }
}
