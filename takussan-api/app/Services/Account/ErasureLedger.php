<?php

namespace App\Services\Account;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

/**
 * TCK-885 (ADR-0044, amendement du 2026-10-18, § B) — la liste des effacements de compte, tenue
 * HORS de la base.
 *
 * Restaurer une sauvegarde antérieure à un effacement rend le compte en clair, et efface en même
 * temps la trace (`account_deletion_requests`, `privacy_requests`) qui permettrait de le retrouver.
 * Chaque effacement exécuté écrit donc UN objet sur le disque privé des médias
 * (`config('media-library.disk_name')` : `local` en dev et en test, `r2-private` en préproduction
 * et en production), sous `effacements/AAAA-MM-JJ/<user_id>-<AAAAMMJJTHHMMSSZ>.json`.
 *
 * Pourquoi ce disque : le seau privé vit hors du serveur, il est copié chaque nuit dans
 * `vps-sauvegardes/takussan-preview-private/` par `rclone copy` (qui ne supprime jamais,
 * `deploy/server/sauvegarde-seau-prive.sh`), et `vps-sauvegardes` porte un verrou de rétention. Ni
 * jeton ni variable d'environnement de plus. Un objet PAR effacement : un objet S3 ne s'allonge pas.
 *
 * Le contenu : l'identifiant et l'instant, RIEN d'autre — ni courriel, ni nom, ni téléphone. C'est
 * tout ce qu'il faut pour ré-effacer un compte restauré (`account:list-erasures --execute`).
 *
 * ⚠ Jamais de chemin local (`path()`) : sur R2 il n'y en a pas. Lecture et écriture par le disque.
 */
class ErasureLedger
{
    public const PREFIX = 'effacements';

    /**
     * Écrit l'objet d'un effacement ; lève si le disque refuse (un disque `local` rend `false` au
     * lieu de lever : l'échec ne doit pas passer pour un succès). Rend la clé écrite.
     */
    public function record(int $userId, CarbonInterface $erasedAt): string
    {
        $instant = CarbonImmutable::instance($erasedAt)->utc();
        $cle = sprintf(
            '%s/%s/%d-%s.json',
            self::PREFIX,
            $instant->format('Y-m-d'),
            $userId,
            $instant->format('Ymd\THis\Z'),
        );

        $contenu = json_encode([
            'user_id' => $userId,
            'erased_at' => $instant->format('Y-m-d\TH:i:s\Z'),
        ], JSON_THROW_ON_ERROR);

        if ($this->disk()->put($cle, $contenu) !== true) {
            throw new RuntimeException("Le registre des effacements n'a pas pu écrire {$cle}.");
        }

        return $cle;
    }

    /**
     * Les effacements exécutés à partir de `$since` inclus (tous si `null`), du plus ancien au plus
     * récent, UN par compte — le plus ancien : un compte ré-effacé après une restauration a deux
     * objets, et c'est le premier qui date l'effacement.
     *
     * Un objet illisible ne bloque pas la lecture des autres : sa clé est rendue à part, pour que
     * l'appelant le dise au lieu de l'ignorer.
     *
     * @return array{effacements: list<array{user_id: int, erased_at: CarbonImmutable, cle: string}>, illisibles: list<string>}
     */
    public function since(?CarbonInterface $since): array
    {
        $depuis = $since !== null ? CarbonImmutable::instance($since)->utc() : null;
        $disque = $this->disk();

        $effacements = [];
        $illisibles = [];

        foreach ($disque->directories(self::PREFIX) as $repertoire) {
            // Le nom du répertoire est le jour (UTC) : ceux d'avant le jour de `$since` sont sautés
            // sans être lus.
            if ($depuis !== null && basename($repertoire) < $depuis->format('Y-m-d')) {
                continue;
            }

            foreach ($disque->files($repertoire) as $cle) {
                try {
                    $donnees = json_decode((string) $disque->get($cle), true, flags: JSON_THROW_ON_ERROR);
                    $userId = $donnees['user_id'] ?? null;
                    $instant = CarbonImmutable::parse($donnees['erased_at'] ?? '')->utc();
                    if (! is_int($userId) || ! isset($donnees['erased_at'])) {
                        throw new RuntimeException('forme inattendue');
                    }
                } catch (Throwable) {
                    $illisibles[] = $cle;

                    continue;
                }

                if ($depuis !== null && $instant->lessThan($depuis)) {
                    continue;
                }

                if (! isset($effacements[$userId]) || $instant->lessThan($effacements[$userId]['erased_at'])) {
                    $effacements[$userId] = ['user_id' => $userId, 'erased_at' => $instant, 'cle' => $cle];
                }
            }
        }

        $effacements = array_values($effacements);
        usort($effacements, fn (array $a, array $b): int => [$a['erased_at'], $a['user_id']] <=> [$b['erased_at'], $b['user_id']]);
        sort($illisibles);

        return ['effacements' => $effacements, 'illisibles' => $illisibles];
    }

    private function disk(): Filesystem
    {
        return Storage::disk(config('media-library.disk_name'));
    }
}
