<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2391 — révoquer un annonceur : le motif de l'opérateur, écrit au journal (ADR-0077 §8). Un texte d'opérateur, qu'il lui
 * appartient de garder sans numéro. Gardée par `super-admin` + `platform-can:platform.radar.publish` sur la route : retirer ses
 * biens du public est le pendant de les y avoir mis.
 */
class RevokeRadarAdvertiserRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['reason' => ['required', 'string', 'min:3', 'max:500']];
    }

    public function reason(): string
    {
        return (string) $this->validated('reason');
    }
}
