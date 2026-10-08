<?php

namespace App\Http\Requests\Public;

use App\Models\Enums\ContactLeadChannel;
use Illuminate\Validation\Rule;

/**
 * TCK-590 — un clic WhatsApp / Appeler sur la fiche : le canal et la source, rien d'autre. Aucune
 * identité n'est demandée ni acceptée — c'est un compte, pas une demande à traiter.
 */
class ContactClickPublicRequest extends PublicPropertySlugRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $this->property();

        return [
            'channel' => ['required', Rule::in([ContactLeadChannel::Whatsapp->value, ContactLeadChannel::Call->value])],
            'source' => ContactLeadPublicRequest::ATTRIBUTION,
            'medium' => ContactLeadPublicRequest::ATTRIBUTION,
        ];
    }
}
