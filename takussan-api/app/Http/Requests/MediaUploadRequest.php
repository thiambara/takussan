<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Spatie\MediaLibrary\HasMedia;

class MediaUploadRequest extends FormRequest
{
    public const COLLECTIONS = ['photos', 'documents', 'avatars', 'logo'];

    public const MAX_PHOTO_KB = 10 * 1024;   // 10MB

    public const MAX_DOCUMENT_KB = 25 * 1024; // 25MB

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $collection = $this->input('collection');

        // Size + mime rules differ by collection family.
        if ($collection === 'documents') {
            $fileRules = [
                'required',
                'file',
                'mimes:pdf,docx',
                'max:'.self::MAX_DOCUMENT_KB,
            ];
        } else {
            // photos, avatars, or unknown → image rules (validator will
            // reject unknown collections below regardless).
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
            'collection' => ['required', 'string', Rule::in(self::COLLECTIONS)],
            'model_type' => ['required', 'string'],
            'model_id' => ['required', 'integer'],
        ];
    }

    protected function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $type = $this->input('model_type');
            if (! is_string($type) || $type === '') {
                return;
            }

            if (! class_exists($type)) {
                $v->errors()->add('model_type', 'The model_type must be a known class.');

                return;
            }

            // Check the interface via reflection — never instantiate the
            // user-supplied class (constructor side effects = remote code path).
            if (! is_a($type, HasMedia::class, true)) {
                $v->errors()->add('model_type', 'The model_type must implement HasMedia.');
            }
        });
    }
}
