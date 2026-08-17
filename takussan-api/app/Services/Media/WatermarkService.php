<?php

namespace App\Services\Media;

use Intervention\Image\Drivers\Gd\Driver as GdDriver;
use Intervention\Image\ImageManager;

class WatermarkService
{
    public function apply(string $sourcePath, AgencyWatermarkContext $context): void
    {
        $manager = new ImageManager(new GdDriver);

        $image = $manager->decodePath($sourcePath);
        $imageWidth = $image->width();
        $imageHeight = $image->height();

        $overlayWidth = max(200, (int) ($imageWidth * 0.30));
        $overlayHeight = max(60, (int) ($imageHeight * 0.12));

        $overlayCanvas = $manager->createImage($overlayWidth, $overlayHeight);
        $overlayCanvas->fill('rgba(0, 0, 0, 0)');

        $textY = 5;

        if ($context->logoPath !== null && file_exists($context->logoPath)) {
            $logo = $manager->decodePath($context->logoPath);
            $maxLogoWidth = (int) ($imageWidth * 0.20);
            $logo->scaleDown(width: $maxLogoWidth);
            $overlayCanvas->insert($logo, 0, 0, 'top-left', $context->opacity / 100);
            $textY = $logo->height() + 4;
        }

        if ($context->agencyName !== '') {
            $overlayCanvas->text(
                $context->agencyName,
                0,
                $textY,
                function ($font) {
                    $font->size(14);
                    $font->color('rgba(255, 255, 255, 0.90)');
                }
            );
        }

        if ($context->agencyUrl !== '') {
            $overlayCanvas->text(
                $context->agencyUrl,
                0,
                $textY + 18,
                function ($font) {
                    $font->size(11);
                    $font->color('rgba(255, 255, 255, 0.75)');
                }
            );
        }

        $image->insert(
            $overlayCanvas,
            10,
            10,
            $context->position->toInterventionPosition(),
            $context->opacity / 100,
        );

        $image->save($sourcePath);
    }
}
