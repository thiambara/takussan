<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2392 — régler un site collecté : l'allumer ou l'éteindre, sa fréquence (bornée par `radar.crawl.min/max_frequency_minutes`),
 * ses pages au plus (bornées par `radar.crawl.max_pages_limit`). Gardée par `super-admin` + `platform-can:platform.radar.publish`
 * sur la route : allumer la collecte engage le budget d'IA et la lecture d'un site tiers, c'est un geste du porteur.
 */
class UpdateRadarCrawlSourceRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'enabled' => ['sometimes', 'boolean'],
            'frequency_minutes' => [
                'sometimes', 'integer',
                'min:'.(int) config('radar.crawl.min_frequency_minutes', 60),
                'max:'.(int) config('radar.crawl.max_frequency_minutes', 10080),
            ],
            'max_pages' => ['sometimes', 'integer', 'min:1', 'max:'.(int) config('radar.crawl.max_pages_limit', 20)],
        ];
    }

    /** @return array{enabled?: bool, frequency_minutes?: int, max_pages?: int} */
    public function changes(): array
    {
        $changes = [];
        if ($this->has('enabled')) {
            $changes['enabled'] = $this->boolean('enabled');
        }
        foreach (['frequency_minutes', 'max_pages'] as $field) {
            if ($this->validated($field) !== null) {
                $changes[$field] = (int) $this->validated($field);
            }
        }

        return $changes;
    }
}
