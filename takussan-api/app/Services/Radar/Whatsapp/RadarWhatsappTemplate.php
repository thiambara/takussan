<?php

namespace App\Services\Radar\Whatsapp;

use App\Models\RadarOutreach;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use App\Services\Radar\ConsentMessageComposer;

/**
 * TCK-2395 (ADR-0077 §4, §5) — le gabarit Meta d'un message d'accord. **Les clauses restent un texte versionné du
 * dépôt** : le corps soumis à Meta est le fichier de clauses lui-même, chaque marqueur (`{salutation}`, `{resume}`,
 * `{lien_reclamation}`, `{lien_conditions}`) remplacé par `{{1}}`, `{{2}}`… dans l'ordre où il apparaît ({@see self::body()},
 * imprimé par `radar:whatsapp-template`). Les paramètres envoyés sont les parties variables du texte ENREGISTRÉ.
 *
 * **Ce que l'annonceur reçoit est le texte enregistré, ou rien** : {@see self::for()} recompose le corps avec ses
 * paramètres et refuse (409 `radar.whatsapp.message_mismatch`) s'il ne redonne pas exactement `message` — un message
 * préparé quand l'origine du front était une autre, par exemple.
 */
final class RadarWhatsappTemplate
{
    public function __construct(private readonly ConsentMessageComposer $composer) {}

    /** Le corps à soumettre à Meta pour cette langue et cette version de clauses. */
    public function body(string $locale, string $version = ConsentMessageComposer::CLAUSES_VERSION): string
    {
        $rank = 0;

        return (string) preg_replace_callback(
            ConsentMessageComposer::PLACEHOLDER,
            function () use (&$rank): string {
                $rank++;

                return '{{'.$rank.'}}';
            },
            $this->composer->template($locale, $version),
        );
    }

    /** Le corps dont chaque `{{n}}` est remplacé par le n-ième paramètre : ce que Meta affiche. */
    public static function render(string $body, array $params): string
    {
        return (string) preg_replace_callback('/\{\{(\d+)\}\}/', fn (array $m): string => (string) ($params[(int) $m[1] - 1] ?? $m[0]), $body);
    }

    /** Le gabarit de ce message : son nom approuvé, sa langue Meta, et ses paramètres dans l'ordre du corps. */
    public function for(RadarOutreach $outreach): WhatsappTemplateRef
    {
        $name = ((array) config('radar_whatsapp.templates', []))[$outreach->clauses_version] ?? null;
        $language = ((array) config('radar_whatsapp.template_languages', []))[$outreach->locale] ?? null;
        abort_code_if(! is_string($name) || $name === '' || ! is_string($language) || $language === '', 422, 'radar.whatsapp.template_missing');

        $template = $this->composer->template($outreach->locale, $outreach->clauses_version);
        preg_match_all(ConsentMessageComposer::PLACEHOLDER, $template, $found);
        $params = array_map(fn (string $placeholder): string => match ($placeholder) {
            'salutation' => ConsentMessageComposer::part($outreach->salutation, ConsentMessageComposer::SALUTATION_MAX),
            'resume' => ConsentMessageComposer::part($outreach->summary, ConsentMessageComposer::SUMMARY_MAX),
            'lien_conditions' => $this->composer->conditionsUrl($outreach->locale),
            'lien_reclamation' => $this->composer->claimUrlFor($outreach),
        }, $found[1]);

        abort_code_if(self::render($this->body($outreach->locale, $outreach->clauses_version), $params) !== $outreach->message, 409, 'radar.whatsapp.message_mismatch');

        return new WhatsappTemplateRef($name, $language, $params);
    }
}
