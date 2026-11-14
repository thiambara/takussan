<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Concerns\HasAgencyRole;
use App\Models\Enums\IdType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Owners\OwnerDirectory;
use App\Sorts\OwnerNameSort;
use App\Sorts\OwnerRemainingToPaySort;
use App\Support\Http\ParametreUnique;
use Database\Factories\Profiles\OwnerProfileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\AllowedSort;

class OwnerProfile extends AbstractModel
{
    /** @use HasFactory<OwnerProfileFactory> */
    use Auditable, HasAgencyRole, HasFactory, SoftDeletes;

    /** TCK-601 — liste blanche du journal — jamais les colonnes `SENSITIVE`. */
    public const AUDIT_ONLY = ['status', 'agency_role_id'];

    protected $fillable = [
        'user_id', 'agency_id', 'agency_role_id', 'status',
        'rib', 'tax_id',
        'id_document_type', 'id_document_number',
        'monthly_income', 'employer',
        'guarantor_user_id', 'metadata',
        // TCK-592 — ADR-0037 : au-delà, l'approbation d'un devis par l'équipe attend le bailleur.
        'works_approval_threshold',
    ];

    /**
     * TCK-601 (ADR-0044 §1) — les identifiants sensibles du bailleur : chiffrés en base (cast
     * `encrypted`, colonnes `text`), absents de toute sérialisation par défaut (`$hidden`), hors des
     * sparse fieldsets et de la recherche. Ils ne sortent qu'à travers
     * `OwnerProfileResource` (masqués), `GET /api/owners/{id}/sensitive` (admin, consultation
     * journalisée) et l'export du droit d'accès (`DataExportBuilder`, `makeVisible`).
     *
     * TCK-956 (ADR-0070 § 1) — le revenu mensuel aussi. Son cast est `encrypted` simple, pas
     * `decimal:2` : il se relit comme une chaîne, et une classe de cast maison le sortirait de
     * `backup:verify-encryption`.
     */
    public const SENSITIVE = ['rib', 'tax_id', 'id_document_number', 'monthly_income'];

    protected $hidden = self::SENSITIVE;

    protected $casts = [
        'status' => OwnerProfileStatus::class,
        'rib' => 'encrypted',
        'tax_id' => 'encrypted',
        'id_document_number' => 'encrypted',
        'id_document_type' => IdType::class,
        'monthly_income' => 'encrypted',
        'works_approval_threshold' => 'decimal:2',
        'metadata' => 'array',
    ];

    /**
     * spatie/laravel-query-builder hooks. Listing surfaces (`/app/owners`,
     * select propriétaire dans le form de création de bien) consomment ces
     * filtres + sparse fieldsets côté front — voir CLAUDE.md "API —
     * conventions frontend".
     */
    protected static array $requestFilterable = ['status', 'agency_id', 'user_id', 'agency_role_id'];

    protected static array $requestSortable = ['id', 'created_at', 'status'];

    protected static array $requestLoadable = ['user', 'agency', 'invitations', 'agencyRole'];

    // TCK-601 — une colonne chiffrée n'est plus cherchable : l'IV aléatoire interdit jusqu'à
    // l'égalité stricte (ADR-0044 §1, pas d'empreinte HMAC).
    // TCK-2640 — `filter[search]` ne passe plus par le repli SQL de `HasQueryBuilder` (l'employeur
    // seul) : il cherche aussi le nom, le téléphone et l'e-mail, sans accents
    // ({@see self::customQueryFilters()}, {@see OwnerDirectory::search()}). L'employeur y reste.
    protected static array $requestSearchFields = [];

    protected static array $queryFields = [
        'id', 'user_id', 'agency_id', 'agency_role_id', 'status',
        // TCK-956 — sans `monthly_income` : `fields[owner_profiles]=…,monthly_income` rend 400.
        'id_document_type',
        'employer', 'guarantor_user_id',
        'metadata', 'created_at', 'updated_at',
        // TCK-2640 — le plafond de travaux se lit par `fields[owner_profiles]=…` (ADR-0037).
        'works_approval_threshold',
    ];

    /**
     * TCK-2640 — la recherche du carnet (nom, téléphone, e-mail, sans casse ni accents) et
     * `filter[has_remaining]=1|0` (un reste à verser positif ou non — TCK-2760 : le solde cumulé
     * au jour, {@see OwnerDirectory::remainingToPay()}).
     *
     * @return array<int, AllowedFilter>
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('search', function (Builder $query, mixed $value): void {
                // P216.05 (ADR-0075) — `filter[search][]=…` vaut une recherche absente.
                $term = trim(ParametreUnique::valeur($value) ?? '');
                if ($term !== '') {
                    app(OwnerDirectory::class)->search($query, $term);
                }
            })->delimiter(''),
            AllowedFilter::callback('has_remaining', function (Builder $query, mixed $value): void {
                // `filter_var(null, …)` rend `false` : une liste (valeur absente) se lit AVANT.
                $raw = ParametreUnique::valeur($value);
                $wanted = $raw === null ? null : filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($wanted === null) {
                    return;
                }
                // Vérification adverse de TCK-2640 — hors lecteur du relevé, le reste vaut `null`
                // pour chaque ligne : `=1` ne rend rien, `=0` ne retire rien.
                if (! OwnerDirectory::readsMoney(request()->user())) {
                    if ($wanted) {
                        $query->whereRaw('1 = 0');
                    }

                    return;
                }
                $remaining = app(OwnerDirectory::class)->remainingToPayIn($query);
                $query->whereIn('owner_profiles.id', array_keys(array_filter(
                    $remaining,
                    fn (?float $amount) => $wanted ? $amount !== null && $amount > 0 : $amount === null || $amount <= 0,
                )));
            }),
        ];
    }

    /**
     * TCK-2640 — `sort=name` (le nom affiché) et `sort=-remaining_to_pay` (le reste à verser —
     * TCK-2760 : le solde cumulé au jour).
     *
     * @return array<int, AllowedSort>
     */
    protected static function customQuerySorts(): array
    {
        return [
            AllowedSort::custom('name', new OwnerNameSort),
            AllowedSort::custom('remaining_to_pay', new OwnerRemainingToPaySort),
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function guarantor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'guarantor_user_id');
    }

    /**
     * TCK-2753 (r2 de la contre-vérification, ADR-0108 § 5) — le dossier d'un profil sans écriture
     * (parti ou suspendu, {@see OwnerProfileStatus::sansEcriture()}) ne se modifie plus : ni pièce
     * d'identité, ni soumission du dossier, ni NINEA. 403 `owner.profile_read_only`, pour tous, le
     * super-admin compris : le dossier d'un bailleur parti est figé.
     */
    public function exigerEcrivable(): void
    {
        abort_code_if(in_array($this->status, OwnerProfileStatus::sansEcriture(), true), 403, 'owner.profile_read_only');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', OwnerProfileStatus::Active->value);
    }

    public function scopeWithinAgency(Builder $query, int $agencyId): Builder
    {
        return $query->where('agency_id', $agencyId);
    }

    /**
     * TCK-256 — invitations émises pour ce profil draft. Utile pour
     * exposer le statut d'invitation (envoyée/expirée) côté UI sans
     * deuxième round-trip.
     */
    public function invitations(): MorphMany
    {
        return $this->morphMany(Invitation::class, 'invitable');
    }

    /**
     * TCK-256 — convenience : email cible du draft, lu depuis le metadata
     * tant qu'aucun User n'est attaché. À l'acceptation, l'invitation
     * crée le User et `user->email` devient l'unique source de vérité.
     */
    public function getDraftEmailAttribute(): ?string
    {
        if ($this->user !== null) {
            return $this->user->email;
        }

        return data_get($this->metadata, 'email');
    }

    /**
     * TCK-256 — convenience : nom complet à afficher pour un draft
     * (avant qu'un User ne soit créé) ou pour un profil actif.
     */
    public function getDisplayNameAttribute(): string
    {
        // P234.07 (TCK-2280) — un compte lié sans nom (créé par téléphone, noms `''`) laisse place
        // au nom saisi par l'agence à l'invitation, comme au front depuis TCK-2136.
        $account = $this->user !== null
            ? trim(($this->user->first_name ?? '').' '.($this->user->last_name ?? ''))
            : '';
        if ($account !== '') {
            return $account;
        }

        $first = (string) data_get($this->metadata, 'first_name', '');
        $last = (string) data_get($this->metadata, 'last_name', '');

        return trim($first.' '.$last);
    }

    /**
     * TCK-1323 (P117.05) — la raison sociale d'un bailleur société, exigée à l'invitation
     * (`metadata.company_name`) ; `null` pour un particulier, même saisie.
     */
    public function companyName(): ?string
    {
        if (data_get($this->metadata, 'owner_type') !== 'company') {
            return null;
        }
        $name = trim((string) data_get($this->metadata, 'company_name', ''));

        return $name !== '' ? $name : null;
    }

    /**
     * P234.06 (TCK-2315) — la raison sociale que les pièces d'une agence impriment pour un bailleur
     * (contrat, relevé, état des lieux) : celle de SON profil dans CETTE agence, jamais d'une autre.
     * Un profil retiré de l'agence nomme encore la société d'un bail passé ; le profil en vigueur
     * l'emporte.
     */
    public static function companyNameOf(?int $userId, ?int $agencyId): ?string
    {
        if ($userId === null || $agencyId === null) {
            return null;
        }

        return self::query()->withTrashed()
            ->where('user_id', $userId)
            ->where('agency_id', $agencyId)
            ->orderByRaw('deleted_at IS NOT NULL')
            ->orderByDesc('id')
            ->first(['id', 'metadata'])
            ?->companyName();
    }
}
