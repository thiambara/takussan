<?php

namespace App\Services\Radar;

use Carbon\CarbonInterface;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-2391 (ADR-0077 §9) — les fichiers que la réserve de photos, les captures et les réponses d'un annonceur ont pu laisser sur le
 * disque PRIVÉ sans ligne `media` : un commit défait après l'écriture du fichier, ou un worker coupé (`$timeout`) entre les deux
 * (`PrepareRadarListingPhotos`, le dépôt manuel, `RadarCaptureReader::attach()`). Une purge qui part des lignes ne les verrait jamais.
 *
 * Il n'y a PAS de préfixe par annonce à balayer : `DefaultPathGenerator` range un média sous `{id du média}/`, et un fichier orphelin vit
 * sous un identifiant que la séquence a brûlé (aucune ligne, et plus jamais aucune : une séquence ne rend pas ses numéros). Le balayage
 * parcourt donc les dossiers de premier niveau à nom NUMÉRIQUE du disque privé et efface ceux dont l'identifiant n'a aucune ligne
 * `media` et dont le dernier fichier a plus d'`GRACE_MINUTES` : une transaction qui écrit la ligne et le fichier vit 60 à 85 s au plus,
 * et sa ligne n'est visible qu'au commit.
 *
 * Tout dossier de premier niveau à nom numérique du disque privé est présumé de la médiathèque : les autres écrivains de ce disque
 * (`erasure-ledger/`, `exports/`…) rangent sous un préfixe nommé.
 *
 * Ce qu'il ne voit pas : les copies de la publication sous les biens (disque PUBLIC, des milliers de dossiers numériques légitimes).
 */
final class RadarOrphanFiles
{
    /** Au-delà de ce délai, un dossier sans ligne ne peut plus appartenir à une transaction vivante. */
    public const GRACE_MINUTES = 60;

    /** @return int les dossiers effacés */
    public function sweep(CarbonInterface $now): int
    {
        $disk = Storage::disk((string) config('media-library.disk_name'));
        $limit = $now->copy()->subMinutes(self::GRACE_MINUTES)->getTimestamp();

        $numeric = array_values(array_filter(
            array_map(fn (string $dir): string => basename($dir), $disk->directories('')),
            fn (string $name): bool => ctype_digit($name),
        ));

        $swept = 0;
        foreach (array_chunk($numeric, 500) as $names) {
            $known = array_flip(array_map('strval', Media::query()->whereIn('id', array_map('intval', $names))->pluck('id')->all()));
            foreach ($names as $name) {
                if (isset($known[$name]) || $this->newest($disk, $name) > $limit) {
                    continue;
                }
                $disk->deleteDirectory($name);
                $swept++;
            }
        }

        return $swept;
    }

    /**
     * L'horodatage du fichier le plus récent du dossier ; celui du dossier lui-même s'il est vide : un `mkdir` dont le fichier n'est
     * pas encore écrit est aussi jeune que lui.
     */
    private function newest(Filesystem $disk, string $directory): int
    {
        $newest = 0;
        foreach ($disk->allFiles($directory) as $file) {
            $newest = max($newest, $disk->lastModified($file));
        }

        return $newest > 0 ? $newest : $this->ageOf($disk, $directory);
    }

    /** L'horodatage du dossier ; `PHP_INT_MAX` (donc jamais balayé) quand le disque ne le dit pas. */
    private function ageOf(Filesystem $disk, string $directory): int
    {
        // Un dossier vide n'existe pas sur un seau objet : rien à y balayer, rien à y retenir.
        try {
            return $disk->lastModified($directory);
        } catch (\Throwable) {
            return PHP_INT_MAX;
        }
    }
}
