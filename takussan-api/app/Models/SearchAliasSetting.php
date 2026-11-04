<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PlatformAbility;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2476 (ADR-0088 §7, revue adverse du 2026-11-04) — le réglage des variantes d'écriture tenues par l'IA : UNE ligne
 * (`id = 1`), créée éteinte par sa migration. Celui qui l'allume en devient l'opérateur, au nom duquel l'usage
 * `search.variantes` est jugé. Le passage planifié ne part pas tant qu'elle est éteinte, ni sans opérateur (compte
 * supprimé, ou qui n'a plus le geste `platform.settings.manage`) : {@see self::blockedReason()} le dit, rien ne l'éteint
 * d'office. Même forme que {@see RadarDemandSetting}.
 */
class SearchAliasSetting extends AbstractModel
{
    public const ID = 1;

    public const BLOCKED_DISABLED = 'search.aliases.disabled';

    public const BLOCKED_OPERATOR_MISSING = 'search.aliases.operator_missing';

    protected $fillable = ['enabled', 'operator_id', 'enabled_at', 'last_run_at', 'last_run_outcome'];

    protected $casts = [
        'enabled' => 'boolean',
        'operator_id' => 'integer',
        'enabled_at' => 'datetime',
        'last_run_at' => 'datetime',
    ];

    /** La ligne unique ; recréée éteinte si elle a disparu (`insertOrIgnore` : jamais d'erreur SQL sur une course). */
    public static function current(): self
    {
        $setting = static::query()->find(self::ID);
        if ($setting !== null) {
            return $setting;
        }
        $now = now();
        DB::table('search_alias_settings')->insertOrIgnore(['id' => self::ID, 'enabled' => false, 'created_at' => $now, 'updated_at' => $now]);

        return static::query()->findOrFail(self::ID);
    }

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }

    /** Ce qui empêche un passage planifié, ou null : éteint, ou opérateur disparu (supprimé, ou privé du geste). */
    public function blockedReason(): ?string
    {
        if (! $this->enabled) {
            return self::BLOCKED_DISABLED;
        }
        $operator = $this->operator;

        return $operator === null || ! $operator->hasPlatformAbility(PlatformAbility::SettingsManage) ? self::BLOCKED_OPERATOR_MISSING : null;
    }
}
