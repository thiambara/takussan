<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RadarSourceSite;
use App\Services\Radar\Observatory\RadarObservatory;
use App\Support\Http\ParametreUnique;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * TCK-2393 — l'observatoire du marché : `filter[since]` (date), `filter[until]` (date, TCK-2431 : ne borne que
 * `nature_history`), `filter[contract]`, `filter[property_type]`,
 * `filter[source_site]`, `filter[neighborhood_id]`, et `fields[radar_observatory]` (les sections, séparées par des virgules ;
 * toutes par défaut). Une valeur reçue en liste vaut absente (ADR-0075) ; une valeur unique invalide est refusée en 422.
 */
class RadarObservatoryRequest extends BaseFormRequest
{
    private const FILTERS = ['since', 'contract', 'property_type', 'source_site', 'neighborhood_id', 'until'];

    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $filter = is_array($this->input('filter')) ? $this->input('filter') : [];
        $clean = [];
        foreach (self::FILTERS as $key) {
            $clean[$key] = ParametreUnique::valeur($filter[$key] ?? null);
        }
        $this->merge(['filter' => $clean, 'fields' => ['radar_observatory' => ParametreUnique::chaine($this, 'fields.radar_observatory')]]);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter.since' => ['nullable', 'date'],
            'filter.contract' => ['nullable', Rule::in(['rent', 'sale'])],
            'filter.property_type' => ['nullable', Rule::enum(PropertyType::class)],
            'filter.source_site' => ['nullable', Rule::enum(RadarSourceSite::class)],
            'filter.neighborhood_id' => ['nullable', 'integer', 'min:1'],
            'fields.radar_observatory' => ['nullable', 'string'],
            // TCK-2431 — une période à l'envers est refusée ; `until` seul est une borne haute.
            'filter.until' => ['nullable', 'date', ...($this->input('filter.since') === null ? [] : ['after_or_equal:filter.since'])],
        ];
    }

    /** @return list<string> les sections demandées, connues seulement ; toutes sans `fields[radar_observatory]` */
    public function sections(): array
    {
        $asked = $this->validated('fields.radar_observatory');
        if ($asked === null) {
            return RadarObservatory::SECTIONS;
        }

        return array_values(array_intersect(RadarObservatory::SECTIONS, array_map('trim', explode(',', (string) $asked))));
    }

    /** @return array{since: CarbonInterface|null, contract: string|null, property_type: string|null, source_site: string|null, neighborhood_id: int|null, until: CarbonInterface|null} */
    public function filters(): array
    {
        $since = $this->validated('filter.since');
        $neighborhood = $this->validated('filter.neighborhood_id');
        $until = $this->validated('filter.until');

        return [
            'since' => $since === null ? null : Carbon::parse((string) $since)->startOfDay(),
            'contract' => $this->validated('filter.contract'),
            'property_type' => $this->validated('filter.property_type'),
            'source_site' => $this->validated('filter.source_site'),
            'neighborhood_id' => $neighborhood === null ? null : (int) $neighborhood,
            'until' => $until === null ? null : Carbon::parse((string) $until)->startOfDay(),
        ];
    }
}
