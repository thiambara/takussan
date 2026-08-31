<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Services\Profiles\ActiveProfileResolver;

class SelectActiveProfileRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'profile_id' => ['required', 'string', 'regex:'.self::compositeIdPattern()],
        ];
    }

    /**
     * Le motif est DÉRIVÉ de `ActiveProfileResolver::TYPE_MAP`, jamais recopié.
     *
     * ⚠ Il l'était : la regex listait `owner|agent|broker|service_provider` et
     * omettait `agency_admin` — l'alias que l'onboarding hôte épingle lui-même
     * comme profil actif. Conséquence mesurée : un hôte pouvait quitter son
     * espace administrateur pour son espace propriétaire, et jamais y revenir —
     * 422 « The profile id field format is invalid » sur son propre profil, que
     * `/api/me/profiles` venait pourtant de lui proposer.
     *
     * C'est la deuxième occurrence du MÊME motif : `PROFILE_TYPES` côté front
     * avait dérivé de la même carte (TCK-329), et la garde posée alors ne
     * couvrait que le front. Une liste d'alias écrite à la main est juste le
     * jour où on l'écrit — celle-ci n'est plus écrite.
     */
    public static function compositeIdPattern(): string
    {
        $alias = array_map(
            static fn (string $a): string => preg_quote($a, '/'),
            array_keys(ActiveProfileResolver::TYPE_MAP),
        );

        return '/^('.implode('|', $alias).'):\d+$/';
    }
}
