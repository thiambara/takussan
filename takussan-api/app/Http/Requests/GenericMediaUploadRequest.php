<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates a generic, non-coupled media upload: the file is attached to the
 * authenticated user (acting as owner). Unlike MediaUploadRequest, this does
 * NOT require a target model — any authenticated caller may upload a file.
 */
class GenericMediaUploadRequest extends FormRequest
{
    public const COLLECTIONS = ['photos', 'documents', 'avatars'];

    public const MAX_PHOTO_KB = 10 * 1024;   // 10MB

    public const MAX_DOCUMENT_KB = 25 * 1024; // 25MB

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $collection = $this->input('collection', 'photos');

        if ($collection === 'documents') {
            $fileRules = [
                'required',
                'file',
                'mimes:pdf,docx',
                'max:'.self::MAX_DOCUMENT_KB,
            ];
        } else {
            $fileRules = [
                'required',
                'file',
                'image',
                'mimes:jpg,jpeg,png,webp',
                'max:'.self::MAX_PHOTO_KB,
            ];
        }

        return [
            'file' => $fileRules,
            'collection' => ['nullable', 'string', Rule::in(self::COLLECTIONS)],
        ];
    }
}
