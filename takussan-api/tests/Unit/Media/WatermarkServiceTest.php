<?php

namespace Tests\Unit\Media;

use App\Models\Enums\WatermarkPosition;
use App\Services\Media\AgencyWatermarkContext;
use App\Services\Media\WatermarkService;
use Tests\Support\TestProcessToken;
use Tests\TestCase;

class WatermarkServiceTest extends TestCase
{
    private WatermarkService $service;

    private string $fixtureDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new WatermarkService;
        // `sys_get_temp_dir()` est partagé par machine, et `uniqid()` ne porte ni pid ni aléa :
        // deux exécutions simultanées de la suite tiraient le même nom (mesuré : 4 collisions sur
        // 40 entre processus concurrents) et se détruisaient mutuellement — `mkdir(): File exists`
        // quand les deux `setUp` se croisaient, `DecoderException` quand le `tearDown` de l'une
        // effaçait le fixture de l'autre en pleine lecture. Le jeton de processus lève l'ambiguïté
        // entre exécutions, `uniqid()` la lève entre les tests d'une même exécution.
        $this->fixtureDir = sys_get_temp_dir().'/watermark_tests_'.TestProcessToken::value().'_'.uniqid();
        mkdir($this->fixtureDir, 0755, true);
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        $this->rmdirRecursive($this->fixtureDir);
    }

    private function rmdirRecursive(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir.DIRECTORY_SEPARATOR.$item;
            is_dir($path) ? $this->rmdirRecursive($path) : unlink($path);
        }
        rmdir($dir);
    }

    private function createJpeg(string $path, int $width = 800, int $height = 600): void
    {
        $img = imagecreatetruecolor($width, $height);
        $bg = imagecolorallocate($img, 100, 150, 200);
        imagefill($img, 0, 0, $bg);
        imagejpeg($img, $path, 90);
        imagedestroy($img);
    }

    private function makeContext(WatermarkPosition $position = WatermarkPosition::BottomRight, int $opacity = 60): AgencyWatermarkContext
    {
        return new AgencyWatermarkContext(
            agencyName: 'Agence Takussan',
            agencyUrl: 'www.takussan.com',
            logoPath: null,
            position: $position,
            opacity: $opacity,
        );
    }

    public function test_applies_watermark_at_bottom_right(): void
    {
        $path = $this->fixtureDir.'/br.jpg';
        $this->createJpeg($path);
        $hashBefore = md5_file($path);

        $this->service->apply($path, $this->makeContext(WatermarkPosition::BottomRight));

        $this->assertFileExists($path);
        $this->assertNotEquals($hashBefore, md5_file($path));
    }

    public function test_applies_watermark_at_bottom_left(): void
    {
        $path = $this->fixtureDir.'/bl.jpg';
        $this->createJpeg($path);
        $hashBefore = md5_file($path);

        $this->service->apply($path, $this->makeContext(WatermarkPosition::BottomLeft));

        $this->assertNotEquals($hashBefore, md5_file($path));
    }

    public function test_applies_watermark_at_bottom_center(): void
    {
        $path = $this->fixtureDir.'/bc.jpg';
        $this->createJpeg($path);
        $hashBefore = md5_file($path);

        $this->service->apply($path, $this->makeContext(WatermarkPosition::BottomCenter));

        $this->assertNotEquals($hashBefore, md5_file($path));
    }

    public function test_opacity_60_vs_30_produces_different_pixels(): void
    {
        $path60 = $this->fixtureDir.'/op60.jpg';
        $path30 = $this->fixtureDir.'/op30.jpg';
        $this->createJpeg($path60);
        $this->createJpeg($path30);

        $this->service->apply($path60, $this->makeContext(opacity: 60));
        $this->service->apply($path30, $this->makeContext(opacity: 30));

        $this->assertNotEquals(md5_file($path60), md5_file($path30));
    }

    /**
     * Écart moyen absolu par canal entre deux JPEG, échantillonné un pixel sur deux.
     *
     * Mesuré le 2026-08-17 : un simple RÉ-ENCODAGE GD de la même image rend un écart de
     * **0,0000** — le plancher de bruit est donc nul, et tout écart non nul mesuré ici est
     * du filigrane, pas de la compression.
     */
    private function meanPixelDelta(string $a, string $b): float
    {
        $ia = imagecreatefromjpeg($a);
        $ib = imagecreatefromjpeg($b);
        $width = imagesx($ia);
        $height = imagesy($ia);
        $sum = 0;
        $samples = 0;

        for ($y = 0; $y < $height; $y += 2) {
            for ($x = 0; $x < $width; $x += 2) {
                $ca = imagecolorat($ia, $x, $y);
                $cb = imagecolorat($ib, $x, $y);
                $sum += abs((($ca >> 16) & 0xFF) - (($cb >> 16) & 0xFF))
                    + abs((($ca >> 8) & 0xFF) - (($cb >> 8) & 0xFF))
                    + abs(($ca & 0xFF) - ($cb & 0xFF));
                $samples += 3;
            }
        }

        imagedestroy($ia);
        imagedestroy($ib);

        return $sum / $samples;
    }

    /** Applique le filigrane à l'opacité donnée et rend l'écart au pixel avec l'original. */
    private function deltaAtOpacity(int $opacity): float
    {
        $reference = $this->fixtureDir."/ref_{$opacity}.jpg";
        $rendered = $this->fixtureDir."/render_{$opacity}.jpg";
        $this->createJpeg($reference);
        $this->createJpeg($rendered);

        $this->service->apply($rendered, $this->makeContext(opacity: $opacity));

        return $this->meanPixelDelta($reference, $rendered);
    }

    /**
     * L'opacité est vérifiée EN VALEUR, pas seulement en différence (TCK-319, AC2).
     *
     * `test_opacity_60_vs_30_produces_different_pixels` ci-dessus compare deux rendus L'UN À
     * L'AUTRE : il passe avec une échelle juste comme avec une échelle fausse, du moment que
     * les deux rendus diffèrent. Or `intervention/image` 4 remplace
     * `place($img, $pos, $x, $y, $opacity 0-100)` par `insert($img, $x, $y, $pos, 0.0-1.0)` :
     * passer 60 tel quel à un paramètre qui attend 0,6 **ne lève aucune erreur** et produit un
     * filigrane silencieusement faux sur toutes les photos.
     *
     * Trois familles d'assertions, chacune attrapant une faute que les autres laissent passer :
     *
     *   · **opacité 0 ⇒ rien de visible.** Tombe si l'unité est INVERSÉE (un paramètre nommé
     *     « transparency » plutôt qu'« opacity » : 0 signifierait alors totalement opaque).
     *   · **opacité 100 ⇒ un écart franc.** Tombe si l'échelle est divisée deux fois (60 → 0,006),
     *     cas où l'ordre relatif resterait pourtant correct.
     *   · **croissance STRICTE de 0 à 100.** Tombe si l'échelle SATURE — c'est ce qui arrive quand
     *     0-100 arrive dans un paramètre 0,0-1,0 borné à 1,0 : toutes les opacités rendent alors
     *     le même pixel.
     *
     * Seuils MESURÉS le 2026-08-17 sous intervention/image 3.11.8, et non devinés :
     * 0 → 0,0000 · 15 → 0,0137 · 30 → 0,0434 · 60 → 0,0583 · 100 → 0,0827.
     */
    public function test_opacity_scale_is_applied_in_value_not_only_in_difference(): void
    {
        $delta = [];
        foreach ([0, 15, 30, 60, 100] as $opacity) {
            $delta[$opacity] = $this->deltaAtOpacity($opacity);
        }

        $mesures = json_encode($delta);

        $this->assertLessThan(
            0.005,
            $delta[0],
            "À l'opacité 0 le filigrane doit être invisible. Un écart non nul signale une unité ".
            "inversée (transparence prise pour opacité). Mesures : {$mesures}"
        );

        $this->assertGreaterThan(
            0.05,
            $delta[100],
            "À l'opacité 100 le filigrane doit marquer franchement (0,0827 mesuré sous v3). Un ".
            "écart trop faible signale une échelle divisée deux fois. Mesures : {$mesures}"
        );

        $previous = -1.0;
        foreach ([0, 15, 30, 60, 100] as $opacity) {
            $this->assertGreaterThan(
                $previous,
                $delta[$opacity],
                "L'écart doit croître STRICTEMENT avec l'opacité ; il stagne ou décroît à ".
                "{$opacity}. Une échelle qui sature (0-100 passé dans un paramètre 0,0-1,0 borné) ".
                "rend le même pixel partout. Mesures : {$mesures}"
            );
            $previous = $delta[$opacity];
        }
    }

    public function test_idempotent_when_called_twice_with_same_context(): void
    {
        $path = $this->fixtureDir.'/idempotent.jpg';
        $this->createJpeg($path);

        $ctx = $this->makeContext();
        $this->service->apply($path, $ctx);
        $sizeAfterFirst = filesize($path);

        $this->service->apply($path, $ctx);

        $this->assertFileExists($path);
        $img = @imagecreatefromjpeg($path);
        $this->assertNotFalse($img, 'File must remain a valid JPEG after two apply() calls');
        $this->assertGreaterThan(0, $sizeAfterFirst, 'File must not be empty after first apply');
        imagedestroy($img);
    }

    public function test_strips_gps_exif(): void
    {
        $path = $this->fixtureDir.'/gps.jpg';
        $this->createJpeg($path);

        $this->service->apply($path, $this->makeContext());

        if (function_exists('exif_read_data')) {
            $exif = @exif_read_data($path);
            $this->assertFalse(
                isset($exif['GPSLatitude']) || isset($exif['GPSLongitude']),
                'GPS EXIF data should be stripped after watermarking'
            );
        } else {
            $this->markTestSkipped('exif_read_data not available');
        }
    }

    public function test_preserves_orientation_exif(): void
    {
        $path = $this->fixtureDir.'/orient.jpg';
        $this->createJpeg($path, 600, 800);

        $this->service->apply($path, $this->makeContext());

        $this->assertFileExists($path);

        $img = imagecreatefromjpeg($path);
        $this->assertGreaterThan(0, imagesx($img));
        imagedestroy($img);
    }
}
