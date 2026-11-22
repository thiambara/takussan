<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PlatformAbility;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2470 (ADR-0087 §6, ADR-0080 §2) — le réglage des cibles de la demande : UNE ligne (`id = 1`), créée éteinte par sa
 * migration. Celui qui l'allume en devient l'opérateur, au nom duquel l'usage `radar.cibles` est jugé — comme une source de
 * la collecte. Rien ne part tant qu'elle est éteinte, ni sans opérateur (compte supprimé, ou qui n'a plus le geste
 * `platform.radar.operate`) : {@see self::blockedReason()} le dit, rien ne l'éteint d'office.
 */
class RadarDemandSetting extends AbstractModel
{
    public const ID = 1;

    public const BLOCKED_DISABLED = 'radar.demand.disabled';

    public const BLOCKED_OPERATOR_MISSING = 'radar.demand.operator_missing';

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
        DB::table('radar_demand_settings')->insertOrIgnore(['id' => self::ID, 'enabled' => false, 'created_at' => $now, 'updated_at' => $now]);

        return static::query()->findOrFail(self::ID);
    }

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }

    /** Ce qui empêche un passage, ou null : éteint, ou opérateur disparu (supprimé, ou privé du geste). */
    public function blockedReason(): ?string
    {
        if (! $this->enabled) {
            return self::BLOCKED_DISABLED;
        }
        $operator = $this->operator;

        return $operator === null || ! $operator->hasPlatformAbility(PlatformAbility::RadarOperate) ? self::BLOCKED_OPERATOR_MISSING : null;
    }
}
