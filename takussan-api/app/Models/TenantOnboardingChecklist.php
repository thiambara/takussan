<?php

namespace App\Models;

use App\Console\Commands\RemindTenantOnboarding;
use App\Listeners\Lease\CreateTenantOnboardingChecklist;
use App\Models\Bases\AbstractModel;
use App\Services\Tenant\TenantOnboardingService;
use Database\Factories\TenantOnboardingChecklistFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-266 — Suit la complétion de l'onboarding "Espace résident".
 *
 * Crée à `Lease.activated` (cf. {@see CreateTenantOnboardingChecklist}),
 * fermée quand `inventory_completed_at` ET `first_payment_at` sont posés
 * (les deux autres items — welcome_seen, documents_acknowledged — sont
 * informatifs). Le service {@see TenantOnboardingService}
 * est l'unique entrée de mutation : aucun setter direct depuis les
 * controllers.
 *
 * `reminders_sent` stocke le journal d'idempotence du cron horaire
 * `tenant-onboarding:remind` ({@see RemindTenantOnboarding}) :
 * un push `{type: 'inventory_d7', sent_at: ISO}` par envoi.
 */
class TenantOnboardingChecklist extends AbstractModel
{
    /** @use HasFactory<TenantOnboardingChecklistFactory> */
    use HasFactory;

    public const ITEM_WELCOME_SEEN = 'welcome_seen';

    public const ITEM_INVENTORY_COMPLETED = 'inventory_completed';

    public const ITEM_FIRST_PAYMENT = 'first_payment';

    public const ITEM_DOCUMENTS_ACKNOWLEDGED = 'documents_acknowledged';

    /** @var list<string> */
    public const ITEMS = [
        self::ITEM_WELCOME_SEEN,
        self::ITEM_INVENTORY_COMPLETED,
        self::ITEM_FIRST_PAYMENT,
        self::ITEM_DOCUMENTS_ACKNOWLEDGED,
    ];

    /** @var list<string> */
    public const REQUIRED_FOR_COMPLETION = [
        self::ITEM_INVENTORY_COMPLETED,
        self::ITEM_FIRST_PAYMENT,
    ];

    public const REMINDER_INVENTORY_D7 = 'inventory_d7';

    protected $fillable = [
        'lease_id',
        'user_id',
        'welcome_seen_at',
        'inventory_completed_at',
        'first_payment_at',
        'documents_acknowledged_at',
        'reminders_sent',
        'completed_at',
    ];

    protected $casts = [
        'welcome_seen_at' => 'datetime',
        'inventory_completed_at' => 'datetime',
        'first_payment_at' => 'datetime',
        'documents_acknowledged_at' => 'datetime',
        'completed_at' => 'datetime',
        'reminders_sent' => 'array',
    ];

    protected $attributes = [
        'reminders_sent' => '[]',
    ];

    protected static array $requestFilterable = ['lease_id', 'user_id'];

    protected static array $requestSortable = ['id', 'created_at', 'completed_at'];

    protected static array $requestLoadable = ['lease', 'user'];

    protected static array $queryFields = [
        'id', 'lease_id', 'user_id',
        'welcome_seen_at', 'inventory_completed_at',
        'first_payment_at', 'documents_acknowledged_at',
        'reminders_sent', 'completed_at',
        'created_at', 'updated_at',
    ];

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Checklists encore ouvertes (au moins un item requis manquant).
     * Utilisé par la queue agence et le sweeper J+7.
     */
    public function scopeIncomplete(Builder $query): Builder
    {
        return $query->whereNull('completed_at');
    }

    /**
     * Mapping item → colonne timestamp. Centralisé ici pour éviter qu'un
     * appelant calcule "manuellement" `{$item}_at` et passe à côté d'un
     * éventuel renommage.
     */
    public static function columnForItem(string $item): string
    {
        return match ($item) {
            self::ITEM_WELCOME_SEEN => 'welcome_seen_at',
            self::ITEM_INVENTORY_COMPLETED => 'inventory_completed_at',
            self::ITEM_FIRST_PAYMENT => 'first_payment_at',
            self::ITEM_DOCUMENTS_ACKNOWLEDGED => 'documents_acknowledged_at',
            default => throw new \InvalidArgumentException("Unknown checklist item: {$item}"),
        };
    }

    /**
     * Vérifie si tous les items requis sont posés sur l'instance courante.
     */
    public function hasAllRequiredItems(): bool
    {
        foreach (self::REQUIRED_FOR_COMPLETION as $item) {
            if ($this->getAttribute(self::columnForItem($item)) === null) {
                return false;
            }
        }

        return true;
    }
}
