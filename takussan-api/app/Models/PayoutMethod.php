<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PayoutMethodKind;
use App\Support\Masking;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * TCK-594 (ADR-0039 §6) — une destination de paiement : numéro Wave / Orange Money / Free Money, ou
 * RIB. Elle appartient à un utilisateur (bailleur, prestataire) et ne sert à verser que vérifiée PAR
 * L'AGENCE QUI PAIE ({@see PayoutMethodVerification}, VERIF-594 M-6).
 *
 * ⚠ **`account_identifier` et `account_holder_name` portent la donnée d'une personne physique.** Ils
 * suivent le mécanisme de TCK-601, sans variante : colonne `text`, cast `encrypted`, `$hidden`, hors
 * `$queryFields` et hors recherche, jamais dans `activity_log` (le modèle n'est pas `Auditable`).
 * Le masquage passe par {@see self::mask()} et nulle part ailleurs : c'est le point où TCK-601
 * branchera son masqueur.
 */
class PayoutMethod extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'kind', 'account_identifier', 'account_holder_name', 'masked_identifier',
        'is_default',
    ];

    protected $hidden = ['account_identifier', 'account_holder_name'];

    protected $casts = [
        'kind' => PayoutMethodKind::class,
        'account_identifier' => 'encrypted',
        'account_holder_name' => 'encrypted',
        'is_default' => 'boolean',
    ];

    protected static array $requestFilterable = ['user_id', 'kind', 'is_default'];

    protected static array $requestSortable = ['id', 'created_at'];

    protected static array $queryFields = [
        'id', 'user_id', 'kind', 'masked_identifier', 'is_default', 'created_at', 'updated_at',
    ];

    /**
     * TCK-594 — la seule forme d'un identifiant que l'agence lit : les quatre derniers caractères.
     * TCK-601 — par le masqueur commun, {@see Masking::tail()}. Un identifiant de quatre caractères
     * ou moins ne se montre plus en entier.
     */
    public static function mask(string $identifier): string
    {
        return Masking::tail($identifier);
    }

    /**
     * VERIF-594 M-4 — l'empreinte de CE que l'approbateur a approuvé : la nature et le numéro
     * normalisé. HMAC sous la clé de l'application, jamais un hachage nu : un numéro de téléphone se
     * retrouve par force brute depuis son SHA-256, et l'empreinte vit dans `payouts.metadata`.
     */
    public function fingerprint(): string
    {
        return hash_hmac('sha256', $this->kind?->value.'|'.self::normalize((string) $this->account_identifier), (string) config('app.key'));
    }

    /** Le numéro sans espaces ni ponctuation, pour comparer deux saisies d'un même numéro. */
    public static function normalize(string $identifier): string
    {
        return preg_replace('/[^0-9A-Za-z+]/', '', $identifier) ?? '';
    }

    /** La vérification de CETTE agence, s'il y en a une. */
    public function verificationFor(int $agencyId): ?PayoutMethodVerification
    {
        return $this->relationLoaded('verifications')
            ? $this->verifications->firstWhere('agency_id', $agencyId)
            : $this->verifications()->where('agency_id', $agencyId)->first();
    }

    public function isVerifiedFor(int $agencyId): bool
    {
        return $this->verificationFor($agencyId) !== null;
    }

    /** Les destinations vérifiées par CETTE agence — la seule qui puisse payer vers elles. */
    public function scopeVerifiedFor(Builder $query, int $agencyId): Builder
    {
        return $query->whereHas('verifications', fn (Builder $q) => $q->where('agency_id', $agencyId));
    }

    public function verifications(): HasMany
    {
        return $this->hasMany(PayoutMethodVerification::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
