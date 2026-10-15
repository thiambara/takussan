<?php

namespace App\Services\Admin;

use App\Domain\Settings\EditablePlatformSettings;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class PlatformSettingService
{
    private const CACHE_KEY = 'platform_settings.editable';

    /**
     * @return array<string,array<int,array<string,mixed>>>
     */
    public function grouped(): array
    {
        return collect($this->all())
            ->groupBy('category')
            ->map(fn ($items) => $items->values()->all())
            ->all();
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    public function all(): array
    {
        $values = $this->cachedValues();

        return collect(EditablePlatformSettings::all())
            ->map(fn (array $definition, string $key) => $this->toPayload($key, $definition, $values[$key] ?? null))
            ->values()
            ->all();
    }

    /**
     * @return array<string,mixed>
     */
    public function publicSettings(): array
    {
        return collect($this->all())
            ->filter(fn (array $setting) => (bool) $setting['public'])
            ->reduce(function (array $settings, array $setting): array {
                Arr::set($settings, $setting['key'], $setting['value']);

                return $settings;
            }, []);
    }

    public function getValue(string $key): mixed
    {
        $definition = EditablePlatformSettings::get($key);

        return $this->cachedValues()[$key]['value'] ?? $definition['default'];
    }

    /**
     * @param  array<string,mixed>  $payload
     * @return array<string,array<int,array<string,mixed>>>
     */
    public function bulkUpdate(array $payload, User $actor): array
    {
        foreach ($payload as $key => $value) {
            $this->validateKey($key, $value);
        }

        foreach ($payload as $key => $value) {
            $this->persist($key, $this->normalise($key, $value), $actor);
        }

        $this->flushCache();

        return $this->grouped();
    }

    /**
     * @return array<string,array{value:mixed,updated_at:?string,updated_by:?array<string,mixed>}>
     */
    private function cachedValues(): array
    {
        return Cache::remember(self::CACHE_KEY, now()->addMinutes(10), function (): array {
            return Setting::query()
                ->with('updatedBy:id,first_name,last_name,email')
                ->whereIn('key', array_keys(EditablePlatformSettings::all()))
                ->where('scope', SettingScope::Global)
                ->whereNull('scope_id')
                ->get()
                ->mapWithKeys(fn (Setting $setting) => [
                    $setting->key => [
                        'value' => self::unwrap($setting->value),
                        'updated_at' => $setting->updated_at?->toISOString(),
                        'updated_by' => $setting->updatedBy ? [
                            'id' => $setting->updatedBy->id,
                            'name' => $setting->updatedBy->full_name,
                            'email' => $setting->updatedBy->email,
                        ] : null,
                    ],
                ])
                ->all();
        });
    }

    /**
     * @param  array<string,mixed>|null  $stored
     * @return array<string,mixed>
     */
    private function toPayload(string $key, array $definition, ?array $stored): array
    {
        return [
            'key' => $key,
            'category' => $definition['category'],
            'type' => $definition['type'],
            'value' => $stored['value'] ?? $definition['default'],
            'default_value' => $definition['default'],
            'options' => $definition['options'] ?? null,
            'nullable' => (bool) ($definition['nullable'] ?? false),
            'public' => (bool) $definition['public'],
            'requires_restart' => (bool) ($definition['requires_restart'] ?? false),
            'updated_at' => $stored['updated_at'] ?? null,
            'updated_by' => $stored['updated_by'] ?? null,
        ];
    }

    private function validateKey(string $key, mixed $value): void
    {
        if (! EditablePlatformSettings::has($key)) {
            throw ValidationException::withMessages([$key => 'setting_key_not_editable']);
        }

        $definition = EditablePlatformSettings::get($key);
        $validator = Validator::make(
            ['value' => $value],
            [
                'value' => $definition['rules'],
                'value.*' => $definition['item_rules'] ?? ['nullable'],
            ],
        );
        $validator->after(function ($validator) use ($key, $value): void {
            if ($key === 'currency.supported' && is_array($value) && ! in_array('XOF', array_map('strtoupper', $value), true)) {
                $validator->errors()->add('value', 'xof_required');
            }
        });

        if ($validator->fails()) {
            throw ValidationException::withMessages([$key => $validator->errors()->all()]);
        }
    }

    private function normalise(string $key, mixed $value): mixed
    {
        return match ($key) {
            'currency.default' => strtoupper((string) $value),
            'currency.supported' => collect($value)
                ->map(fn (string $currency) => strtoupper($currency))
                ->unique()
                ->values()
                ->all(),
            // TCK-651 — les types des réglages métier ; la validation a déjà tranché la forme.
            default => match (EditablePlatformSettings::get($key)['type']) {
                'integer' => (int) $value,
                'decimal' => $value === null || $value === '' ? null : (float) $value,
                'boolean' => filter_var($value, FILTER_VALIDATE_BOOL),
                'integer_list' => collect($value)->map(fn ($v) => (int) $v)->unique()->sort()->values()->all(),
                default => $value,
            },
        };
    }

    /**
     * TCK-651 — la route brute écrit `{"value": …}` (sa règle `value` exige un objet) ; le catalogue
     * écrit la valeur nue. Une ligne globale écrite autrefois par la route brute se lit donc ici
     * déballée — les lecteurs de `ScopedSetting` acceptent déjà les deux formes.
     */
    private static function unwrap(mixed $value): mixed
    {
        return is_array($value) && array_keys($value) === ['value'] ? $value['value'] : $value;
    }

    private function persist(string $key, mixed $value, User $actor): void
    {
        $current = Setting::query()
            ->where('key', $key)
            ->where('scope', SettingScope::Global)
            ->whereNull('scope_id')
            ->first();
        $oldValue = $current !== null ? self::unwrap($current->value) : EditablePlatformSettings::get($key)['default'];

        // `settings.value` est NOT NULL : une valeur vide (le plafond des pénalités « aucun
        // plafond ») s'écrit sous la forme enveloppée que `unwrap()` relit.
        $setting = Setting::updateOrCreate(
            ['key' => $key, 'scope' => SettingScope::Global, 'scope_id' => null],
            ['value' => $value ?? ['value' => null], 'updated_by_id' => $actor->id],
        );

        activity('Admin')
            ->causedBy($actor)
            ->performedOn($setting)
            ->withProperties(['key' => $key, 'old_value' => $oldValue, 'new_value' => $value])
            ->event('super_admin_setting_updated')
            ->log('Paramètre plateforme modifié');
    }

    private function flushCache(): void
    {
        self::forgetCache();
    }

    /**
     * TCK-651 — appelée aussi par `Setting` à chaque écriture d'une ligne globale : un seeder, une
     * console ou un test qui écrit la table sans passer par `bulkUpdate` ne laisse plus dix minutes
     * de valeur périmée aux lecteurs des réglages métier.
     */
    public static function forgetCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
