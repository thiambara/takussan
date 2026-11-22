<?php

namespace App\Models;

use App\Http\Filters\TypedExactFilter;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\PayoutMethodKind;
use App\Support\AppKeyHmac;
use App\Support\Masking;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

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
class PayoutMethod extends AbstractModel implements HasMedia
{
    // TCK-2863 — `InteractsWithMedia` : le RIB d'un compte bancaire, collection privée.
    use HasFactory, InteractsWithMedia, SoftDeletes;

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
        // TCK-2863 — l'envoi du RIB : la destination est « en revue » (informatif, ne vérifie rien).
        'bank_statement_submitted_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['user_id', 'kind', 'is_default'];

    /** TCK-1411 (P151.03) — les filtres exacts typés que leur nom ne dit pas (`TypedExactFilter`). */
    protected static array $requestFilterableTypes = ['is_default' => TypedExactFilter::BOOLEEN];

    protected static array $requestSortable = ['id', 'created_at'];

    protected static array $queryFields = [
        'id', 'user_id', 'kind', 'masked_identifier', 'is_default', 'created_at', 'updated_at',
        // TCK-2863
        'bank_statement_submitted_at',
    ];

    /** TCK-2863 — la collection du relevé d'identité bancaire. */
    public const BANK_STATEMENT_COLLECTION = 'bank_statement';

    /**
     * TCK-2863 — le RIB d'un compte bancaire : une pièce d'identité bancaire, PRIVÉE (ADR-0029 §3),
     * un seul fichier (le dernier envoyé remplace le précédent).
     */
    public function registerMediaCollections(): void
    {
        $this->addMediaCollection(self::BANK_STATEMENT_COLLECTION)->singleFile()->useDisk(config('media-library.disk_name'));
    }

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
     * normalisé. HMAC sous `APP_HMAC_KEY` (TCK-614, `AppKeyHmac`), jamais un hachage nu : un numéro de téléphone se
     * retrouve par force brute depuis son SHA-256, et l'empreinte vit dans `payouts.metadata`.
     */
    public function fingerprint(): string
    {
        return AppKeyHmac::of($this->kind?->value.'|'.self::normalize((string) $this->account_identifier));
    }

    /**
     * TCK-2430 (ADR-0084) — les empreintes de cette destination sous toutes les clés reconnues : une approbation donnée
     * avant une rotation d'`APP_KEY` couvre encore la même destination.
     *
     * @return list<string>
     */
    public function fingerprints(): array
    {
        return AppKeyHmac::all($this->kind?->value.'|'.self::normalize((string) $this->account_identifier));
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
