<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\RadarSourceSite;
use App\Services\Radar\RadarListingIntake;
use App\Services\Radar\UrlFetcher;
use Illuminate\Validation\Rule;

/**
 * TCK-2386 (ADR-0077 §2) — une saisie du Radar : EXACTEMENT une des trois entrées — `urls` (une
 * liste), `text` (un texte collé) ou `captures` (des images). `source_site` ne se donne qu'avec le
 * texte ou les captures : celui d'une URL se lit dans son hôte. Bornes : `config/radar.php`.
 *
 * Airbnb (et ses domaines) est refusé ici, avant toute fiche : 422 `radar.url.airbnb`.
 */
class StoreRadarListingRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route, comme la console IA. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $intake = config('radar.intake');
        $captures = config('radar.captures');

        return [
            'urls' => ['required_without_all:text,captures', 'prohibits:text,captures', 'array', 'min:1', 'max:'.$intake['max_urls']],
            'urls.*' => ['required', 'string', 'max:'.$intake['max_url_length'], 'url:http,https'],
            'text' => ['required_without_all:urls,captures', 'prohibits:urls,captures', 'string', 'min:'.$intake['text_min_chars'], 'max:'.$intake['text_max_chars']],
            'captures' => ['required_without_all:urls,text', 'prohibits:urls,text', 'array', 'min:1', 'max:'.$captures['max_files']],
            'captures.*' => ['required', 'file', 'mimetypes:'.implode(',', $captures['mimes']), 'max:'.$captures['max_kilobytes']],
            'source_site' => ['nullable', 'prohibits:urls', Rule::enum(RadarSourceSite::class)],
        ];
    }

    protected function passedValidation(): void
    {
        foreach ($this->validated('urls') ?? [] as $url) {
            $host = RadarListingIntake::hostOf($url);
            abort_code_if($host !== null && UrlFetcher::isAirbnb($host), 422, 'radar.url.airbnb');
        }
    }
}
