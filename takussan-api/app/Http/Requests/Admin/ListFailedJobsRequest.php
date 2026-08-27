<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-365 — bornes de `GET /api/admin/jobs/failed`.
 *
 * L'autorisation est portée par le middleware `super-admin` sur le groupe de routes ; cette classe
 * ne garde qu'une chose, que rien ne gardait : `per_page` était pris tel quel. Mesuré avant
 * correctif — `?per_page=100000` rendait la table entière en une réponse, `?per_page=0` rendait 200
 * sur une pagination sans page. Le front n'envoie jamais que 20, mais la console des jobs échoués
 * est désormais au menu : *une borne qui dépend de l'appelant n'est pas une borne.*
 */
class ListFailedJobsRequest extends BaseFormRequest
{
    /** En dessous, la pagination ne pagine plus ; au-dessus, elle ne borne plus. */
    public const PER_PAGE_MIN = 1;

    public const PER_PAGE_MAX = 100;

    public const PER_PAGE_DEFAULT = 20;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'per_page' => ['sometimes', 'integer', 'min:'.self::PER_PAGE_MIN, 'max:'.self::PER_PAGE_MAX],
        ];
    }

    /**
     * ⚠ Ce n'est PAS `perPage()` : `scripts/check-pagination-envelope.mjs` réserve ce nom-là au
     * point canonique de l'enveloppe (`PaginationMeta`), et le lit par forme, pas par type.
     */
    public function taillePage(): int
    {
        return (int) ($this->validated()['per_page'] ?? self::PER_PAGE_DEFAULT);
    }
}
