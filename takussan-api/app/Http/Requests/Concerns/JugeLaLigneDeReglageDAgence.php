<?php

namespace App\Http\Requests\Concerns;

use App\Domain\Settings\EditablePlatformSettings;
use App\Support\ScopedSetting;
use Illuminate\Support\Facades\Validator as ValidatorFactory;
use Illuminate\Validation\Validator;

/**
 * TCK-1999 (P181.01) — LA règle d'une ligne d'agence de `settings`, écrite une fois pour le `POST`
 * (`StoreSettingRequest`, TCK-964) et le `PUT` (`UpdateSettingRequest`, qui ne la jouait pas) : la clé
 * est un réglage métier à repli par agence (catégorie `rentals`, ADR-0065), et la valeur, déballée
 * comme `ScopedSetting` la lira, passe les `rules` et l'`item_rules` de la clé.
 *
 * TCK-1999 (P181.04) — la ligne s'écrit sous la forme canonique `{"value": …}` : la valeur jugée, et
 * rien d'autre. Le tableau reçu s'écrivait en entier, clés inconnues comprises.
 */
trait JugeLaLigneDeReglageDAgence
{
    protected function jugerLaLigneDAgence(Validator $validator, string $key, mixed $value): void
    {
        if (! EditablePlatformSettings::has($key) || EditablePlatformSettings::get($key)['category'] !== 'rentals') {
            $validator->errors()->add('key', 'setting_key_not_editable');

            return;
        }

        $definition = EditablePlatformSettings::get($key);
        $jugee = ValidatorFactory::make(
            ['value' => ScopedSetting::unwrap($key, $value)],
            ['value' => $definition['rules'], 'value.*' => $definition['item_rules'] ?? ['nullable']],
        );
        foreach ($jugee->errors()->all() as $message) {
            $validator->errors()->add('value', $message);
        }
    }

    /** @return array{value: mixed} */
    public static function formeCanonique(string $key, mixed $value): array
    {
        return ['value' => ScopedSetting::unwrap($key, $value)];
    }
}
