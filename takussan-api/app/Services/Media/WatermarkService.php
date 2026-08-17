<?php

namespace App\Services\Media;

use Intervention\Image\Alignment;
use Intervention\Image\Drivers\Gd\Driver as GdDriver;
use Intervention\Image\ImageManager;

class WatermarkService
{
    /**
     * Convertit l'opacité métier (entier 0-100) en facteur attendu par `insert()` (0,0-1,0).
     *
     * Une seule conversion, nommée, jamais recopiée dans un appel (TCK-319) : c'est le point
     * exact où intervention/image 4 a changé d'unité en même temps que de nom de méthode
     * (`place($img, $pos, $x, $y, 0-100)` → `insert($img, $x, $y, $pos, 0,0-1,0)`).
     *
     * Le paramètre s'appelle `$transparency` en aval, ce qui suggère l'inverse de ce qu'il fait :
     * vérifié dans le pilote GD du paquet installé, il MULTIPLIE l'opacité
     * (`(127 - alpha) * $transparency`), donc 1,0 = opaque et 0,0 = invisible. Ne pas « corriger »
     * cette méthode en `1 - x` sur la foi du nom.
     *
     * Passer l'entier brut ne produit pas un filigrane discrètement faux : le constructeur de
     * `InsertModifier` lève `InvalidArgumentException('Transparency must be in range 0 to 1')`.
     * La faute est donc bruyante pour toute opacité > 1 — mesuré. Elle resterait muette pour
     * `opacity = 1`, qui vaudrait 100 % au lieu de 1 %, et c'est ce que
     * `WatermarkServiceTest::test_opacity_scale_is_applied_in_value_not_only_in_difference`
     * garde en valeur plutôt qu'en différence.
     */
    private function opacityFactor(int $opacity): float
    {
        return $opacity / 100;
    }

    public function apply(string $sourcePath, AgencyWatermarkContext $context): void
    {
        $manager = new ImageManager(new GdDriver);
        $opacityFactor = $this->opacityFactor($context->opacity);

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
            $overlayCanvas->insert($logo, 0, 0, Alignment::TOP_LEFT, $opacityFactor);
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
            $opacityFactor,
        );

        $image->save($sourcePath);
    }
}
