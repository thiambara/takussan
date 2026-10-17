<?php

namespace Tests\Feature\Http\Requests;

use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/**
 * TCK-749 (piste P06.08) — les 55 noms de champ traduits en `fr` (et recopiés en `wo`) n'avaient
 * aucune traduction en `en` : « The property id field is required. », « The guests field… ».
 */
class AttributsDeValidationTraduitsTest extends TestCase
{
    public function test_every_french_attribute_has_an_english_name(): void
    {
        $fr = trans('validation.attributes', [], 'fr');
        $en = trans('validation.attributes', [], 'en');

        $this->assertIsArray($en);
        $this->assertSame([], array_values(array_diff(array_keys($fr), array_keys($en))), 'attributs sans nom anglais');
        $this->assertSame([], array_values(array_diff(array_keys($en), array_keys($fr))), 'attributs anglais sans pendant français');
        foreach ($en as $champ => $nom) {
            $this->assertIsString($nom, $champ);
            $this->assertNotSame('', trim($nom), $champ);
        }
    }

    public function test_english_messages_use_the_translated_name(): void
    {
        app()->setLocale('en');

        $erreurs = Validator::make([], ['property_id' => 'required', 'guests' => 'required', 'id_number' => 'required'])
            ->errors();

        $this->assertSame('The property field is required.', $erreurs->first('property_id'));
        $this->assertSame('The number of guests field is required.', $erreurs->first('guests'));
        $this->assertSame('The ID number field is required.', $erreurs->first('id_number'));
    }
}
