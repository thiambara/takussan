<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation for POST /api/documents/{document}/versions.
 *
 * Reuses the same file constraints as the original Document upload
 * (formats + max 10 MB), with an optional comment (max 500 chars).
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
            'file' => ['required', 'file', 'max:10240'],
            'comment' => ['nullable', 'string', 'max:500'],
        ];
    }
}
