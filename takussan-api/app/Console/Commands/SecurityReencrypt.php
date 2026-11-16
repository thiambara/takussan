<?php

namespace App\Console\Commands;

use App\Support\Security\ColonnesChiffrees;
use Illuminate\Console\Command;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;

/**
 * TCK-614 (ADR-0044 §1, ADR-0084 amendement du 2026-11-16) — après une rotation d'`APP_KEY`, réécrit sous la clé
 * courante chaque valeur chiffrée encore écrite sous une ancienne clé d'`APP_PREVIOUS_KEYS`. C'est ce qui permet,
 * ensuite, de RETIRER cette ancienne clé sans rendre une colonne illisible.
 *
 * - Les colonnes se dérivent des casts ({@see ColonnesChiffrees}) : aucune liste à tenir.
 * - Elle travaille sur la chaîne chiffrée, comme les casts `encrypted*` et `AsEncrypted*` (`decryptString` sous
 *   toutes les clés, `encryptString` sous la courante) : un aller-retour par le cast réécrirait un JSON reformaté.
 * - « Déjà courante » se juge en déchiffrant sous la SEULE clé courante : une seconde exécution n'écrit rien.
 * - Par lots de {@see self::LOT} lignes, un lot par transaction. Une valeur qui ne se déchiffre sous aucune clé annule
 *   son lot ENTIER, se nomme (modèle, id, colonne — jamais la valeur), et la commande sort en échec. Reprenable :
 *   relancée, elle ne réécrit que ce qui reste.
 * - Chaque écriture compare l'ancienne valeur (`WHERE colonne = ancienne`) : une ligne réécrite entre-temps par
 *   l'application l'est déjà sous la clé courante, elle est laissée. Écriture par `DB::table()` : ni observateur, ni
 *   journal d'audit (aucune valeur claire n'y passe), ni `updated_at`.
 * - Elle refuse de tourner si `APP_PREVIOUS_KEYS` est vide : rien n'est écrit sous une autre clé que la courante.
 *
 * Elle lit les clés du chiffreur, et figure à ce titre dans les permis d'`AppKeyHmacPointUniqueTest`.
 */
class SecurityReencrypt extends Command
{
    private const LOT = 200;

    protected $signature = 'security:reencrypt
        {--dry-run : compter sans rien écrire}
        {--model=* : ne traiter que ces modèles (nom court ou classe complète)}';

    protected $description = 'Ré-chiffre sous la clé courante les colonnes chiffrées encore écrites sous une ancienne APP_KEY.';

    public function handle(ColonnesChiffrees $decouverte): int
    {
        /** @var Encrypter $chiffreur */
        $chiffreur = app('encrypter');
        if ($chiffreur->getPreviousKeys() === []) {
            $this->error('APP_PREVIOUS_KEYS est vide : aucune valeur n\'est écrite sous une autre clé que la courante, rien à ré-chiffrer.');

            return self::FAILURE;
        }
        $courante = new Encrypter($chiffreur->getKey(), (string) config('app.cipher'));

        $modeles = $decouverte->parModele();
        $filtre = array_map(fn (string $m): string => ltrim($m, '\\'), (array) $this->option('model'));
        if ($filtre !== []) {
            $modeles = array_filter($modeles, fn (string $classe): bool => in_array($classe, $filtre, true) || in_array(class_basename($classe), $filtre, true), ARRAY_FILTER_USE_KEY);
            if ($modeles === []) {
                $this->error('Aucun modèle chiffré ne correspond à --model.');

                return self::FAILURE;
            }
        }

        $aBlanc = (bool) $this->option('dry-run');
        $echecs = 0;
        foreach ($modeles as $classe => $colonnes) {
            $bilan = $this->modele($classe, $colonnes, $chiffreur, $courante, $aBlanc);
            $echecs += $bilan['illisibles'];
            $this->line(sprintf(
                '%s : %d valeur(s) lue(s), %d déjà sous la clé courante, %d %s, %d illisible(s)',
                class_basename($classe), $bilan['lues'], $bilan['courantes'], $bilan['reecrites'],
                $aBlanc ? 'à ré-chiffrer' : 'ré-chiffrée(s)', $bilan['illisibles'],
            ));
        }

        if ($echecs > 0) {
            $this->error("{$echecs} valeur(s) ne se déchiffrent sous aucune clé : leurs lots n'ont pas été réécrits. Ne retirer aucune clé.");

            return self::FAILURE;
        }
        $this->info('security:reencrypt'.($aBlanc ? ' (à blanc)' : '').' — terminé.');

        return self::SUCCESS;
    }

    /**
     * @param  class-string<Model>  $classe
     * @param  list<string>  $colonnes
     * @return array{lues: int, courantes: int, reecrites: int, illisibles: int}
     */
    private function modele(string $classe, array $colonnes, Encrypter $chiffreur, Encrypter $courante, bool $aBlanc): array
    {
        /** @var Model $instance */
        $instance = new $classe;
        $cle = $instance->getKeyName();
        $bilan = ['lues' => 0, 'courantes' => 0, 'reecrites' => 0, 'illisibles' => 0];

        DB::connection($instance->getConnectionName())->table($instance->getTable())
            ->select([$cle, ...$colonnes])
            ->where(fn ($q) => array_map(fn (string $c) => $q->orWhereNotNull($c), $colonnes))
            ->chunkById(self::LOT, function ($lignes) use ($instance, $classe, $cle, $colonnes, $chiffreur, $courante, $aBlanc, &$bilan): void {
                $ecritures = [];
                $illisiblesDuLot = 0;
                foreach ($lignes as $ligne) {
                    foreach ($colonnes as $colonne) {
                        $valeur = $ligne->{$colonne};
                        if (! is_string($valeur) || $valeur === '') {
                            continue;
                        }
                        $bilan['lues']++;
                        if ($this->sousLaCourante($courante, $valeur)) {
                            $bilan['courantes']++;

                            continue;
                        }
                        try {
                            $clair = $chiffreur->decryptString($valeur);
                        } catch (DecryptException) {
                            $illisiblesDuLot++;
                            $this->error(sprintf('Illisible : %s #%s, colonne %s.', class_basename($classe), $ligne->{$cle}, $colonne));

                            continue;
                        }
                        $ecritures[] = [$ligne->{$cle}, $colonne, $valeur, $chiffreur->encryptString($clair)];
                    }
                }
                $bilan['illisibles'] += $illisiblesDuLot;
                if ($illisiblesDuLot > 0) {
                    return; // le lot entier reste tel quel
                }
                $bilan['reecrites'] += count($ecritures);
                if ($aBlanc || $ecritures === []) {
                    return;
                }
                $connexion = DB::connection($instance->getConnectionName());
                $connexion->transaction(function () use ($connexion, $instance, $cle, $ecritures): void {
                    foreach ($ecritures as [$id, $colonne, $ancienne, $neuve]) {
                        $connexion->table($instance->getTable())->where($cle, $id)->where($colonne, $ancienne)->update([$colonne => $neuve]);
                    }
                });
            }, $cle);

        return $bilan;
    }

    private function sousLaCourante(Encrypter $courante, string $valeur): bool
    {
        try {
            $courante->decryptString($valeur);

            return true;
        } catch (DecryptException) {
            return false;
        }
    }
}
