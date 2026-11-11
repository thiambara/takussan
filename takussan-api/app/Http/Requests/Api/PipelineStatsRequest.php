<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Customer;

/**
 * TCK-2591 — `GET /api/customers/pipeline-stats` : `scope=mine|agency` et les filtres de la liste
 * des clients (`filter[referent|tags|search|follow_up|…]`, jugés par `Customer::buildQuery`).
 *
 * - `scope=agency` : 403 sans `CustomerPolicy::viewAgencyPipeline` (`crm.view_all` dans l'agence
 *   active), AVANT toute validation.
 * - `scope=mine` : `filter[referent]=me` de TCK-2588 ; un autre `filter[referent]` le contredirait,
 *   il est donc refusé (422).
 * - Sans `scope` : la portée d'avant, la lecture de la fiche (`Customer::visibleTo`). C'est le
 *   front qui choisit « Moi » ou « Agence » selon le rôle (maquette) ; l'API applique.
 */
class PipelineStatsRequest extends BaseFormRequest
{
    public const MINE = 'mine';

    public const AGENCY = 'agency';

    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        return $this->query('scope') !== self::AGENCY
            || $user->can('viewAgencyPipeline', Customer::class);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'scope' => ['nullable', 'string', 'in:'.self::MINE.','.self::AGENCY],
            'filter' => ['nullable', 'array'],
            'filter.referent' => ['prohibited_if:scope,'.self::MINE],
        ];
    }

    public function scope(): ?string
    {
        $scope = $this->validated('scope');

        return is_string($scope) ? $scope : null;
    }
}
