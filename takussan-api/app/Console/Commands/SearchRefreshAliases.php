<?php

namespace App\Console\Commands;

use App\Jobs\Search\RefreshSearchAliases;
use App\Models\SearchAliasSetting;
use Illuminate\Console\Command;

/**
 * TCK-2476 (ADR-0088 §7) — met en file `ai` un passage des variantes d'écriture de la recherche, au nom de l'opérateur du
 * réglage {@see SearchAliasSetting} (celui qui l'a allumé). **Réglage éteint : rien n'est mis en file** (revue adverse du
 * 2026-11-04 — plus aucun `super_admin` choisi d'office). `--operator` reste pour un lancement manuel, au nom de
 * l'utilisateur désigné, réglage éteint ou non. Les mêmes saisies que le dernier passage ne rappellent pas le modèle.
 */
class SearchRefreshAliases extends Command
{
    protected $signature = 'search:refresh-aliases {--operator= : l\'identifiant du super_admin au nom duquel l\'IA est jugée}';

    protected $description = 'Met en file un passage des variantes d\'écriture de la recherche, tenues par l\'IA.';

    public function handle(): int
    {
        $operator = $this->option('operator');
        if ($operator !== null && ! ctype_digit((string) $operator)) {
            $this->error('--operator attend l\'identifiant d\'un utilisateur.');

            return self::INVALID;
        }

        if ($operator === null && ! SearchAliasSetting::current()->enabled) {
            $this->line('search:refresh-aliases — réglage éteint, rien n\'est mis en file.');

            return self::SUCCESS;
        }

        RefreshSearchAliases::dispatch($operator === null ? null : (int) $operator);
        $this->line('search:refresh-aliases — passage mis en file.');

        return self::SUCCESS;
    }
}
