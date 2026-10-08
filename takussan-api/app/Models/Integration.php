<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\PaymentProvider;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Integration extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes {
        Auditable::buildChanges as private buildWhitelistedChanges;
    }

    /**
     * TCK-601 — liste blanche du journal. Les identifiants n'y entrent JAMAIS : un changement s'y lit
     * `credentials_changed: true`, sans valeur ({@see self::buildChanges()}). Ni `last_used_at`, ni la
     * santé : un appel ou une sonde n'est pas un acte de gouvernance.
     */
    public const AUDIT_ONLY = ['provider', 'is_active'];

    protected $fillable = [
        'provider', 'agency_id', 'credentials', 'is_active',
        'last_used_at', 'last_health_check_at', 'health_status', 'metadata',
    ];

    // TCK-293 (ADR-0046) — le jeton de l'URL de webhook, sous ses deux formes, ne sort par aucune
    // sérialisation ; il n'est ni `fillable` ni dans `$queryFields`.
    protected $hidden = ['credentials', 'webhook_token', 'webhook_token_hash'];

    protected $casts = [
        'credentials' => 'encrypted:array',
        'webhook_token' => 'encrypted',
        'is_active' => 'boolean',
        'last_used_at' => 'datetime',
        'last_health_check_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['agency_id', 'provider', 'is_active', 'health_status'];

    protected static array $requestSortable = ['id', 'created_at', 'provider'];

    // `metadata` is allowed so the admin UI can list provider notes via
    // sparse fieldsets (TCK-068). `credentials` remains hidden at all layers.
    protected static array $queryFields = ['id', 'agency_id', 'provider', 'is_active', 'last_used_at', 'last_health_check_at', 'health_status', 'metadata', 'created_at', 'updated_at'];

    /**
     * Le drapeau `credentials_changed` remplace la valeur : posé à la création avec des identifiants,
     * et à toute modification qui les touche — même seule, sinon le changement de secret passerait
     * pour « rien ».
     *
     * @return array<string, mixed>
     */
    protected function buildChanges(string $processingEvent): array
    {
        $changes = $this->buildWhitelistedChanges($processingEvent);

        $touched = match ($processingEvent) {
            'created' => ($this->getAttributes()['credentials'] ?? null) !== null,
            'updated' => $this->wasChanged('credentials'),
            default => false,
        };
        if ($touched) {
            $changes['attributes'] = ($changes['attributes'] ?? []) + ['credentials_changed' => true];
        }

        return $changes;
    }

    protected static function booted(): void
    {
        // TCK-293 (ADR-0046 §2, §7) — une intégration de paiement naît avec son jeton, et en reçoit un
        // neuf si son fournisseur ou son agence change, par quelque chemin que ce soit : l'ancien
        // jeton ne doit rien ouvrir chez le nouveau titulaire.
        static::creating(function (Integration $integration): void {
            if ($integration->isPaymentIntegration() && $integration->webhook_token_hash === null) {
                $integration->fillWebhookToken();
            }
        });

        static::updating(function (Integration $integration): void {
            if ($integration->isDirty(['provider', 'agency_id'])) {
                $integration->isPaymentIntegration()
                    ? $integration->fillWebhookToken()
                    : $integration->forceFill(['webhook_token' => null, 'webhook_token_hash' => null]);
            }
        });
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    /** TCK-293 — une intégration de paiement : celles que `PaymentGatewayService` sait piloter. */
    public function isPaymentIntegration(): bool
    {
        return PaymentProvider::tryFrom((string) $this->provider) !== null;
    }

    /** TCK-293 (ADR-0046 §2) — la seule façon de passer du jeton à son empreinte. */
    public static function hashWebhookToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * TCK-293 (ADR-0046 §7) — tire un jeton neuf et l'enregistre ; l'ancien cesse de résoudre dans
     * la même écriture. Rend le jeton en clair.
     */
    public function rotateWebhookToken(): string
    {
        $token = $this->fillWebhookToken();
        $this->save();

        return $token;
    }

    /**
     * TCK-293 (ADR-0046 §4) — l'URL publique de webhook de cette intégration, sur `APP_URL` et non
     * sur l'hôte de la requête courante (qui peut être l'adresse interne vue par le serveur Next).
     * `null` hors paiement ou sans jeton.
     */
    public function webhookUrl(): ?string
    {
        $token = $this->webhook_token;
        if (! $this->isPaymentIntegration() || ! is_string($token) || $token === '') {
            return null;
        }

        return rtrim((string) config('app.url'), '/').'/api/webhooks/payments/'.$this->provider.'/'.$token;
    }

    private function fillWebhookToken(): string
    {
        // 48 caractères alphanumériques tirés par un CSPRNG : ≈ 285 bits.
        $token = Str::random(48);
        $this->forceFill([
            'webhook_token' => $token,
            'webhook_token_hash' => self::hashWebhookToken($token),
        ]);

        return $token;
    }
}
