<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PayoutMethodKind;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * TCK-594 (ADR-0039 §6) — une destination de paiement : numéro Wave / Orange Money / Free Money, ou
 * RIB. Elle appartient à un utilisateur (bailleur, prestataire) et ne sert à verser que vérifiée.
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
        'is_default', 'verified_at', 'verified_by_id',
    ];

    protected $hidden = ['account_identifier', 'account_holder_name'];

    protected $casts = [
        'kind' => PayoutMethodKind::class,
        'account_identifier' => 'encrypted',
        'account_holder_name' => 'encrypted',
        'is_default' => 'boolean',
        'verified_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['user_id', 'kind', 'is_default'];

    protected static array $requestSortable = ['id', 'created_at'];

    protected static array $queryFields = [
        'id', 'user_id', 'kind', 'masked_identifier', 'is_default', 'verified_at', 'verified_by_id',
        'created_at', 'updated_at',
    ];

    /**
     * TCK-594 — la seule forme d'un identifiant que l'agence lit : les quatre derniers caractères.
     *
     * ⚠ Masqueur PROVISOIRE : TCK-601 le remplace par le sien. Toute forme masquée du dépôt passe par
     * ici, pour que le remplacement tienne en un fichier.
     */
    public static function mask(string $identifier): string
    {
        $compact = preg_replace('/\s+/', '', $identifier) ?? '';
        $tail = mb_substr($compact, -4);

        return '•••• '.$tail;
    }

    /** Le numéro sans espaces ni ponctuation, pour comparer deux saisies d'un même numéro. */
    public static function normalize(string $identifier): string
    {
        return preg_replace('/[^0-9A-Za-z+]/', '', $identifier) ?? '';
    }

    public function isVerified(): bool
    {
        return $this->verified_at !== null;
    }

    public function scopeVerified(Builder $query): Builder
    {
        return $query->whereNotNull('verified_at');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by_id');
    }
}
