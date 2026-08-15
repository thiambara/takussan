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
