<?php

namespace App\Console\Commands;

use App\Jobs\Search\RefreshSearchAliases;
use App\Services\Search\Aliases\SearchAliasCurator;
use Illuminate\Console\Command;

/**
 * TCK-2476 (ADR-0088 §7) — met en file `ai` un passage des variantes d'écriture de la recherche. Au nom du `super_admin`
 * désigné par `--operator`, sinon du plus ancien actif ({@see SearchAliasCurator::defaultOperator()}) ; sans lui, rien
 * n'est lu ni appelé. Les mêmes saisies que le dernier passage ne rappellent pas le modèle.
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

        RefreshSearchAliases::dispatch($operator === null ? null : (int) $operator);
        $this->line('search:refresh-aliases — passage mis en file.');

        return self::SUCCESS;
    }
}
