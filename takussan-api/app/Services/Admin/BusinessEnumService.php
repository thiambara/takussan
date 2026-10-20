<?php

namespace App\Services\Admin;

use App\Domain\Settings\EditableBusinessEnums;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

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
     * @param  bool  $withUsage  false pour la lecture publique (`/api/enums/{key}`, anonyme) : le
     *                           compte porte sur toute la table, brouillons et biens privés compris
     *                           (P28.02, TCK-844). La console super-admin le garde.
     * @return array<string,mixed>
     */
    public function get(string $key, bool $activeOnly = false, bool $withUsage = true): array
    {
        $this->ensureEditable($key);
        $definition = EditableBusinessEnums::get($key);
        $values = collect($this->storedValues($key));

        if ($activeOnly) {
            $values = $values->where('is_active', true);
        }

        if ($withUsage) {
            // Single grouped COUNT for the whole enum instead of one query per
            // value (the previous N×values fan-out across large tables).
            $usageCounts = $this->usageCounts($key, $values->pluck('value')->all());
            $values = $values->map(fn (array $value) => [
                ...$value,
                'usage_count' => $usageCounts[$value['value']] ?? 0,
            ]);
        }

        return [
            'key' => $key,
            'name' => $definition['name'],
            'description' => $definition['description'],
            'values' => $values->values()->all(),
        ];
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
     * Usage counts for many enum values in a single grouped query.
     *
     * @param  array<int,string>  $values
     * @return array<string,int> value => usage count
     */
    private function usageCounts(string $key, array $values): array
    {
        if ($values === []) {
            return [];
        }

        $usage = EditableBusinessEnums::get($key)['usage'];
        /** @var class-string<Model> $model */
        $model = $usage['model'];
        $column = $usage['column'];

        return $model::query()
            ->whereIn($column, $values)
            ->selectRaw("{$column} as enum_value, COUNT(*) as total")
            ->groupBy($column)
            ->pluck('total', 'enum_value')
            ->map(fn ($total) => (int) $total)
            ->toArray();
    }
}
