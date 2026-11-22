<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use App\Services\Search\DemandeDePublication;
use Closure;

/**
 * TCK-2603 — `GET /api/public/publish/demand?city=` : la ville, facultative, doit être une ville du référentiel (sans
 * casse ni accent, nom actuel ou ancien, {@see DemandeDePublication::ville()}) ; toute autre saisie rend 422. Sans ville,
 * la réponse nomme la plus recherchée.
 */
class PublicPublishDemandRequest extends BaseFormRequest
{
    /** Lecture publique d'un agrégat : le contrôleur n'autorisait rien avant de valider. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'city' => [
                'nullable',
                'string',
                'max:120',
                function (string $attribut, mixed $valeur, Closure $echec): void {
                    if (is_string($valeur) && app(DemandeDePublication::class)->ville($valeur) === null) {
                        $echec(__('validation.exists', ['attribute' => $attribut]));
                    }
                },
            ],
        ];
    }

    /** @return array{id: int, name: string}|null la ville demandée, résolue dans le référentiel */
    public function ville(): ?array
    {
        $saisie = $this->validated('city');

        return is_string($saisie) ? app(DemandeDePublication::class)->ville($saisie) : null;
    }
}
