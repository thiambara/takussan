<?php

namespace App\Console\Commands;

use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\Whatsapp\RadarWhatsappTemplate as Template;
use Illuminate\Console\Command;
use InvalidArgumentException;
use RuntimeException;

/**
 * TCK-2395 (ADR-0077 §4, §5) — le corps du gabarit Meta à soumettre pour une langue et une version de clauses : le
 * fichier de clauses du dépôt, chaque marqueur remplacé par `{{1}}`, `{{2}}`… dans l'ordre. Le porteur le recopie tel
 * quel dans le gestionnaire de modèles de Meta : un seul caractère de différence et l'annonceur ne lirait pas le texte
 * enregistré. Lecture seule, aucun appel réseau.
 */
class RadarWhatsappTemplate extends Command
{
    protected $signature = 'radar:whatsapp-template {locale=fr : fr ou en} {--clauses= : la version des clauses, par défaut la version courante}';

    protected $description = 'Imprime le corps du gabarit Meta du message d\'accord du Radar, à soumettre tel quel.';

    public function handle(Template $template): int
    {
        $locale = (string) $this->argument('locale');
        $version = (string) ($this->option('clauses') ?: ConsentMessageComposer::CLAUSES_VERSION);

        try {
            $body = $template->body($locale, $version);
        } catch (InvalidArgumentException|RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $name = ((array) config('radar_whatsapp.templates', []))[$version] ?? '(aucun nom configuré)';
        $language = ((array) config('radar_whatsapp.template_languages', []))[$locale] ?? $locale;
        $this->line("# {$name} — langue {$language} — clauses {$version}");
        $this->line($body);

        return self::SUCCESS;
    }
}
