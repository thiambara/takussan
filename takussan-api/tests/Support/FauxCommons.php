<?php

namespace Tests\Support;

use Illuminate\Http\UploadedFile;

/**
 * TCK-2844 (ADR-0109) — les réponses de l'API de Wikimedia Commons, simulées. La suite n'appelle
 * JAMAIS Commons : chaque test pose `Http::preventStrayRequests()` puis `Http::fake()` avec ces
 * corps, au format `formatversion=2` (`query.pages` est une LISTE, `index` y donne le rang de la
 * recherche, et l'ordre de la liste n'est pas celui du rang).
 */
trait FauxCommons
{
    /**
     * Une page de fichier telle que Commons la rend, `imageinfo[0]` compris.
     *
     * @param  array<string, mixed>  $surcharges  clés de `imageinfo[0]` (`width`, `url`…), plus
     *                                            `attribution` ("true"/"false"/null) et `index`
     * @return array<string, mixed>
     */
    protected function pageCommons(string $titre, array $surcharges = []): array
    {
        $nom = rawurlencode(str_replace(' ', '_', substr($titre, 5)));
        $attribution = array_key_exists('attribution', $surcharges) ? $surcharges['attribution'] : 'false';
        $index = $surcharges['index'] ?? 1;
        unset($surcharges['attribution'], $surcharges['index']);

        $meta = [
            'LicenseShortName' => ['value' => 'CC0'],
            'Artist' => ['value' => '<a href="//commons.wikimedia.org/wiki/User:Jean">Jean&nbsp;Dupont</a>'],
            'ImageDescription' => ['value' => 'Une rue'],
        ];
        if ($attribution !== null) {
            $meta['AttributionRequired'] = ['value' => $attribution, 'source' => 'commons-desc-page'];
        }

        return [
            'pageid' => crc32($titre),
            'ns' => 6,
            'title' => $titre,
            'index' => $index,
            'imageinfo' => [array_merge([
                'size' => 2_000_000,
                'width' => 2400,
                'height' => 1600,
                // Au format réel (relevé le 2026-11-15) : la vignette est sur `thumb.wikimedia.org`.
                'thumburl' => "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/{$nom}/400px-{$nom}",
                'thumbwidth' => 400,
                'thumbheight' => 267,
                'url' => "https://upload.wikimedia.org/wikipedia/commons/a/ab/{$nom}",
                'descriptionurl' => "https://commons.wikimedia.org/wiki/File:{$nom}",
                'extmetadata' => $meta,
            ], $surcharges)],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $pages
     * @return array<string, mixed>
     */
    protected function reponseCommons(array $pages): array
    {
        return ['batchcomplete' => true, 'query' => ['pages' => $pages]];
    }

    /** Les octets d'un vrai JPEG, ceux que `thumb.wikimedia.org` rendrait. */
    protected function octetsJpeg(int $largeur = 1600, int $hauteur = 1000): string
    {
        return (string) UploadedFile::fake()->image('commons.jpg', $largeur, $hauteur)->getContent();
    }

    /**
     * Un vrai JPEG qui porte un segment EXIF (APP1, IFD vide) suivi d'un marqueur lisible : un
     * fichier rangé tel quel le garde, un fichier réencodé par GD le perd.
     */
    protected function octetsJpegAvecExif(string $marqueur): string
    {
        $jpeg = $this->octetsJpeg(900, 600);
        $charge = "Exif\0\0"."II*\0"."\x08\0\0\0"."\0\0"."\0\0\0\0".$marqueur;
        $app1 = "\xFF\xE1".pack('n', strlen($charge) + 2).$charge;

        return substr($jpeg, 0, 2).$app1.substr($jpeg, 2);
    }
}
