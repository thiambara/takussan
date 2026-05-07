<?php

namespace App\Services\Admin;

use App\Domain\Settings\EditableBusinessEnums;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class BusinessEnumService
{
    /**
     * @return array<int,array<string,mixed>>
     */
    public function all(bool $activeOnly = false): array
    {
        return collect(array_keys(EditableBusinessEnums::all()))
            ->map(fn (string $key) => $this->get($key, $activeOnly))
            ->values()
            ->all();
    }

    /**
     * @return array<string,mixed>
     */
    public function get(string $key, bool $activeOnly = false): array
    {
        $this->ensureEditable($key);
        $definition = EditableBusinessEnums::get($key);
        $values = collect($this->storedValues($key));

        if ($activeOnly) {
            $values = $values->where('is_active', true);
        }

        return [
            'key' => $key,
            'name' => $definition['name'],
            'description' => $definition['description'],
            'values' => $values
                ->map(fn (array $value) => [
                    ...$value,
                    'usage_count' => $this->usageCount($key, $value['value']),
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * @param  array{value:string,labels:array{fr:string,en?:?string,wo?:?string},is_active?:bool}  $payload
     * @return array<string,mixed>
     */
    public function addValue(string $key, array $payload, User $actor): array
    {
        $this->ensureEditable($key);
        $values = $this->storedValues($key);
        $value = Str::of($payload['value'])->lower()->snake()->value();

        if (collect($values)->contains(fn (array $row) => $row['value'] === $value)) {
            throw ValidationException::withMessages(['value' => 'enum_value_exists']);
        }

        $values[] = $this->normaliseValue([
            'value' => $value,
            'labels' => $payload['labels'],
            'is_active' => $payload['is_active'] ?? true,
            'is_custom' => true,
        ]);

        $this->persist($key, $values, $actor);
        $this->audit($actor, 'super_admin_enum_value_added', $key, $value, ['labels' => $payload['labels']]);

        return $this->get($key);
    }

    /**
     * @param  array{labels?:array{fr?:string,en?:?string,wo?:?string},is_active?:bool}  $payload
     * @return array<string,mixed>
     */
    public function updateValue(string $key, string $value, array $payload, User $actor): array
    {
        $this->ensureEditable($key);
        $values = collect($this->storedValues($key));
        $index = $values->search(fn (array $row) => $row['value'] === $value);

        if ($index === false) {
            abort(404, 'Enum value not found.');
        }

        $current = $values->get($index);
        $current['labels'] = array_replace($current['labels'], $payload['labels'] ?? []);
        $current['is_active'] = array_key_exists('is_active', $payload)
            ? (bool) $payload['is_active']
            : (bool) $current['is_active'];
        $values[$index] = $this->normaliseValue($current);

        $this->persist($key, $values->values()->all(), $actor);
        $this->audit($actor, 'super_admin_enum_value_updated', $key, $value, $payload);

        return $this->get($key);
    }

    /**
     * @return array<string,mixed>
     */
    public function deactivateValue(string $key, string $value, User $actor): array
    {
        $this->ensureEditable($key);
        $usage = $this->usageCount($key, $value);
        if ($usage > 0) {
            throw new ConflictHttpException('enum_value_in_use');
        }

        $updated = $this->updateValue($key, $value, ['is_active' => false], $actor);
        $this->audit($actor, 'super_admin_enum_value_deactivated', $key, $value, ['usage_count' => $usage]);

        return $updated;
    }

    private function ensureEditable(string $key): void
    {
        if (! EditableBusinessEnums::has($key)) {
            throw ValidationException::withMessages(['key' => 'enum_not_editable']);
        }
    }

    /**
     * @return array<int,array{value:string,labels:array{fr:string,en:string,wo:string},is_active:bool,is_custom:bool}>
     */
    private function storedValues(string $key): array
    {
        $stored = Setting::query()
            ->where('key', "enum.{$key}.values")
            ->where('scope', SettingScope::Global)
            ->whereNull('scope_id')
            ->first();

        if ($stored) {
            return collect($stored->value['values'] ?? [])
                ->map(fn (array $row) => $this->normaliseValue($row))
                ->values()
                ->all();
        }

        $source = EditableBusinessEnums::get($key)['source'];

        return collect($source::cases())
            ->map(fn ($case) => $this->normaliseValue([
                'value' => $case->value,
                'labels' => ['fr' => Str::headline(str_replace('_', ' ', $case->value))],
                'is_active' => true,
                'is_custom' => false,
            ]))
            ->values()
            ->all();
    }

    /**
     * @param  array<string,mixed>  $row
     * @return array{value:string,labels:array{fr:string,en:string,wo:string},is_active:bool,is_custom:bool}
     */
    private function normaliseValue(array $row): array
    {
        $labels = $row['labels'] ?? [];
        $fr = trim((string) ($labels['fr'] ?? ''));

        return [
            'value' => (string) $row['value'],
            'labels' => [
                'fr' => $fr,
                'en' => trim((string) ($labels['en'] ?? '')) ?: $fr,
                'wo' => trim((string) ($labels['wo'] ?? '')) ?: $fr,
            ],
            'is_active' => (bool) ($row['is_active'] ?? true),
            'is_custom' => (bool) ($row['is_custom'] ?? false),
        ];
    }

    /**
     * @param  array<int,array<string,mixed>>  $values
     */
    private function persist(string $key, array $values, User $actor): void
    {
        Setting::updateOrCreate(
            ['key' => "enum.{$key}.values", 'scope' => SettingScope::Global, 'scope_id' => null],
            ['value' => ['values' => $values], 'updated_by_id' => $actor->id],
        );
    }

    private function usageCount(string $key, string $value): int
    {
        $usage = EditableBusinessEnums::get($key)['usage'];
        /** @var class-string<Model> $model */
        $model = $usage['model'];

        return $model::query()->where($usage['column'], $value)->count();
    }

    /**
     * @param  array<string,mixed>  $properties
     */
    private function audit(User $actor, string $event, string $key, string $value, array $properties): void
    {
        activity('Admin')
            ->causedBy($actor)
            ->withProperties(['enum_key' => $key, 'value' => $value, ...$properties])
            ->event($event)
            ->log('Enum métier modifié');
    }
}
