<?php

namespace Tests\Unit\Rules;

use App\Rules\PixelsAuPlus;
use Illuminate\Support\Facades\Validator;
use Tests\Support\ImageEnTete;
use Tests\TestCase;

/**
 * TCK-677 (P10.02) — la borne se juge sur le NOMBRE de pixels, lu dans l'en-tête sans décoder.
 * Les fichiers de ce test ne portent que leur en-tête : un décodage les ferait échouer, une
 * lecture des seules dimensions non.
 */
class PixelsAuPlusTest extends TestCase
{
    private function passe(mixed $valeur): bool
    {
        return Validator::make(['photo' => $valeur], ['photo' => [new PixelsAuPlus]])->passes();
    }

    public function test_la_borne_vaut_vingt_megapixels(): void
    {
        $this->assertSame(20_000_000, PixelsAuPlus::MAXIMUM);
    }

    public function test_vingt_megapixels_tout_juste_passent(): void
    {
        $this->assertTrue($this->passe(ImageEnTete::png(5000, 4000)));
        $this->assertTrue($this->passe(ImageEnTete::jpeg(4000, 5000)));
    }

    public function test_un_pixel_de_trop_est_refuse(): void
    {
        $this->assertFalse($this->passe(ImageEnTete::png(5000, 4001)));
        $this->assertFalse($this->passe(ImageEnTete::jpeg(4001, 5000)));
    }

    public function test_une_bombe_de_decompression_est_refusee(): void
    {
        $this->assertFalse($this->passe(ImageEnTete::png(20_000, 20_000)));
    }

    public function test_le_message_est_celui_des_dimensions(): void
    {
        $validateur = Validator::make(['photo' => ImageEnTete::png(9000, 9000)], ['photo' => [new PixelsAuPlus]]);

        $this->assertSame(
            [__('validation.dimensions', ['attribute' => 'photo'])],
            $validateur->errors()->get('photo'),
        );
    }

    public function test_ce_qui_n_est_pas_une_image_lisible_est_laisse_aux_autres_regles(): void
    {
        $this->assertTrue($this->passe('pas un fichier'));
        $this->assertTrue($this->passe(null));
    }
}
