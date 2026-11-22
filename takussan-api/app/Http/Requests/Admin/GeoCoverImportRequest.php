<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2844 (ADR-0109 §2) — importer une proposition de Commons PAR SON TITRE, jamais par une URL :
 * le serveur relit le fichier sur Commons et n'appelle aucune adresse fournie par le client.
 */
class GeoCoverImportRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'source' => ['required', 'string', 'in:wikimedia'],
            // Un titre de l'espace de noms Fichier : ni barre oblique de schéma, ni `|` (qui
            // demanderait plusieurs titres à Commons d'un coup).
            'title' => ['required', 'string', 'max:255', 'starts_with:File:', 'not_regex:/[|#<>\[\]{}]|:\/\//'],
        ];
    }
}
