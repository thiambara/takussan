<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use ReflectionClass;
use Symfony\Component\Finder\Finder;

/**
 * P42.03 (TCK-882) — une restauration se juge aussi à ce qu'elle se LIT. Le critère d'ADR-0028 § 7
 * comparait des comptes de lignes : il passe sous une `APP_KEY` fausse, alors que chaque colonne
 * chiffrée (RIB, identifiants légaux, secrets 2FA, jetons…) est alors perdue.
 *
 * La commande relit, sur une connexion (la copie restaurée), un échantillon de chaque colonne dont
 * un modèle déclare un cast `encrypted*`, et le déchiffre avec la clé de l'application — clés
 * précédentes comprises, comme le cast. Elle n'imprime que des comptes, jamais une valeur.
 *
 *   0 : toutes les valeurs lues se déchiffrent ;
 *   1 : au moins une valeur ne se déchiffre pas (clé fausse, ou donnée abîmée) ;
 *   2 : aucune valeur chiffrée lue — rien n'a été vérifié (base vide, ou casts introuvables).
 *
 * `--cle-fausse` est l'ablation : la même lecture sous une clé tirée au hasard doit rendre 1.
 */
class BackupVerifyEncryption extends Command
{
    protected $signature = 'backup:verify-encryption
        {--connexion= : connexion à lire (défaut : la connexion par défaut)}
        {--echantillon=20 : valeurs lues par colonne}
        {--cle-fausse : ablation — déchiffrer avec une clé tirée au hasard}';

    protected $description = 'Déchiffre un échantillon de chaque colonne chiffrée d\'une base (restauration à blanc).';

    public function handle(): int
    {
        $connexion = $this->option('connexion') ?: config('database.default');
        $echantillon = max(1, (int) $this->option('echantillon'));
        $encrypter = $this->option('cle-fausse')
            ? new Encrypter(Encrypter::generateKey(config('app.cipher')), config('app.cipher'))
            : app('encrypter');

        $colonnes = $this->colonnesChiffrees();
        if ($colonnes === []) {
            $this->error('Aucun cast `encrypted` trouvé dans app/Models : la commande ne voit plus ce qu\'elle vérifie.');

            return 2;
        }

        $lues = 0;
        $illisibles = 0;
        $schema = Schema::connection($connexion);
        foreach ($colonnes as [$table, $colonne]) {
            if (! $schema->hasTable($table) || ! $schema->hasColumn($table, $colonne)) {
                $this->line("{$table}.{$colonne} : absente de la base, ignorée");

                continue;
            }
            $valeurs = DB::connection($connexion)->table($table)
                ->whereNotNull($colonne)->where($colonne, '!=', '')
                ->limit($echantillon)->pluck($colonne);
            $ko = 0;
            foreach ($valeurs as $valeur) {
                try {
                    $encrypter->decrypt($valeur, false);
                } catch (DecryptException) {
                    $ko++;
                }
            }
            $lues += $valeurs->count();
            $illisibles += $ko;
            $this->line(sprintf('%s.%s : %d lue(s), %d illisible(s)', $table, $colonne, $valeurs->count(), $ko));
        }

        if ($lues === 0) {
            $this->warn(sprintf('Aucune valeur chiffrée dans %d colonne(s) : rien n\'a été vérifié.', count($colonnes)));

            return 2;
        }
        if ($illisibles > 0) {
            $this->error("{$illisibles} valeur(s) sur {$lues} ne se déchiffrent pas avec cette clé.");

            return 1;
        }
        $this->info(sprintf('%d valeur(s) chiffrée(s) relue(s) dans %d colonne(s) : toutes se déchiffrent.', $lues, count($colonnes)));

        return 0;
    }

    /** @return list<array{0: string, 1: string}> (table, colonne), triés */
    private function colonnesChiffrees(): array
    {
        $paires = [];
        foreach (Finder::create()->files()->in(app_path('Models'))->name('*.php') as $fichier) {
            $classe = 'App\\Models\\'.str_replace(['/', '.php'], ['\\', ''], $fichier->getRelativePathname());
            if (! class_exists($classe) || ! is_subclass_of($classe, Model::class) || (new ReflectionClass($classe))->isAbstract()) {
                continue;
            }
            /** @var Model $modele */
            $modele = new $classe;
            foreach ($modele->getCasts() as $colonne => $cast) {
                if (is_string($cast) && str_starts_with($cast, 'encrypted')) {
                    $paires[$modele->getTable().'.'.$colonne] = [$modele->getTable(), $colonne];
                }
            }
        }
        ksort($paires);

        return array_values($paires);
    }
}
