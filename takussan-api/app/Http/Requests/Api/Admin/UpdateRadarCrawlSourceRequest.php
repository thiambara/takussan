<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\RadarSourceSite;
use App\Services\Radar\Crawl\RadarCrawlSources;
use App\Services\Radar\Crawl\RadarStartUrls;

/**
 * TCK-2392 — régler un site collecté : l'allumer ou l'éteindre, sa fréquence (bornée par `radar.crawl.min/max_frequency_minutes`),
 * ses pages au plus (bornées par `radar.crawl.max_pages_limit`). Gardée par `super-admin` + `platform-can:platform.radar.publish`
 * sur la route : allumer la collecte engage le budget d'IA et la lecture d'un site tiers, c'est un geste du porteur.
 *
 * TCK-2438 — `start_urls` : les pages de liste d'où partent ses passages. Une liste vide ou nulle rend l'URL de la
 * configuration. Chaque URL passe les garde-fous de `RadarStartUrls`, sinon 422 avec un code et l'URL en cause dans
 * `params.field` (`start_urls.N`) : `radar.crawl.start_urls_too_many`, `radar.crawl.start_url_too_long`,
 * `radar.crawl.start_url_invalid`, `radar.crawl.start_url_host` (avec `params.hosts`), `radar.crawl.start_url_duplicate`.
 * Rien n'est enregistré.
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
            'start_urls' => ['sometimes', 'nullable', 'array'],
            'start_urls.*' => ['nullable', 'string'],
        ];
    }

    protected function passedValidation(): void
    {
        if (! $this->has('start_urls')) {
            return;
        }
        $site = RadarSourceSite::tryFrom((string) $this->route('site'));
        $sources = app(RadarCrawlSources::class);
        if ($site === null || ! $sources->has($site->value)) {
            // Le contrôleur répond 404 `radar.crawl.unknown_site`.
            return;
        }

        $urls = RadarStartUrls::normalize($this->validated('start_urls')) ?? [];
        abort_code_if(count($urls) > RadarStartUrls::maxCount(), 422, 'radar.crawl.start_urls_too_many', ['max' => RadarStartUrls::maxCount()]);

        $adapter = $sources->adapter($site);
        $checker = app(RadarStartUrls::class);
        foreach ($urls as $i => $url) {
            $field = "start_urls.{$i}";
            match ($checker->refusal($adapter, $url)) {
                null => null,
                RadarStartUrls::REFUSED_TOO_LONG => abort_code(422, 'radar.crawl.start_url_too_long', ['field' => $field, 'max' => RadarStartUrls::maxLength()]),
                RadarStartUrls::REFUSED_HOST => abort_code(422, 'radar.crawl.start_url_host', ['field' => $field, 'hosts' => $adapter->startHosts()]),
                default => abort_code(422, 'radar.crawl.start_url_invalid', ['field' => $field]),
            };
            abort_code_if(array_search($url, $urls, true) !== $i, 422, 'radar.crawl.start_url_duplicate', ['field' => $field]);
        }
    }

    /** @return array{enabled?: bool, frequency_minutes?: int, max_pages?: int, start_urls?: list<string>|null} */
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
        if ($this->has('start_urls')) {
            $changes['start_urls'] = RadarStartUrls::normalize($this->validated('start_urls'));
        }

        return $changes;
    }
}
