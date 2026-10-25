<?php

namespace App\Domain\Notifications;

use App\Models\AppNotification;
use App\Models\BankStatement;
use App\Models\Booking;
use App\Models\KycDossier;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\RoleDelegation;

/**
 * TCK-588 (ADR-0032) — l'objet qu'ouvre une notification : un `kind` pris dans une liste
 * FERMÉE et un chemin de console. La cloche en fait un lien ; sans cible, la ligne se lit
 * mais n'a pas l'air d'un lien.
 *
 * Les lignes écrites avant les codes — et les 29 classes `Notification` qui ne portent pas de
 * cible — en reçoivent une {@see derive()}e des clés connues de `data` et de `referenceable_*`.
 */
final class NotificationTarget
{
    /**
     * Les genres de cible, et le chemin de console de chacun. `{id}` est remplacé par
     * l'identifiant ; un chemin sans `{id}` est une liste.
     *
     * TCK-649 (ADR-0064) — l'administration d'agence vit sous `/app/agency` ; `/admin` n'existe plus.
     * Le chemin se calcule à la LECTURE : changer une ligne ici fait suivre les notifications déjà
     * stockées. `scripts/check-notification-target-paths.mjs` vérifie que chacun mène à une page.
     *
     * @var array<string, string>
     */
    public const PATHS = [
        'lease' => '/app/leases/{id}',
        'payments' => '/app/payments',
        // TCK-1467 (P161.01) — l'onglet des reversements, où leur émetteur non admin les a programmés :
        // `finances` est fermée à qui n'est pas admin de l'agence.
        'payouts' => '/app/payments?tab=payouts',
        // TCK-1469 (P161.02) — la file « À approuver », où le geste se fait (TCK-594, ADR-0039 § 4),
        // pour tout détenteur de `payouts.approve`, admins compris.
        'payout_approvals' => '/app/payments?tab=approvals',
        // TCK-2270 (P224.01) — l'onglet des factures d'intervention, où se trouve la facture gardée.
        'service_provider_bills' => '/app/payments?tab=bills',
        'booking' => '/app/bookings/{id}',
        'visit' => '/app/visits/{id}',
        'maintenance' => '/app/maintenance/{id}',
        'property' => '/app/properties/{id}',
        'conversation' => '/app/messages?conversation={id}',
        // TCK-590 — la boîte « Demandes », ouverte sur la demande.
        'lead' => '/app/leads?lead={id}',
        'agency_kyc' => '/app/agency/kyc',
        'kyc_review' => '/super-admin/kyc',
        'finances' => '/app/agency/finances',
        'team' => '/app/agency/team',
        // TCK-1471 (P161.03) — les délégations de rôle vivent sous les rôles (`RoleDelegationsSection`,
        // TCK-369) : c'est là que le délégant retrouve celle dont l'avis parle.
        'role_delegations' => '/app/agency/roles',
        'agency_settings' => '/app/agency',
        // TCK-601 — une alerte de gouvernance ouvre le journal d'audit de l'agence.
        'audit' => '/app/agency/audit',
        // TCK-597 — la boîte des avis reçus, et la modération des avis de l'agence. Elle visait
        // `/admin/reviews`, page qui n'a jamais existé (relevé par TCK-649). Même défaut
        // pour la boîte : `/app/reviews` n'existe pas, elle vit sous le profil.
        'reviews' => '/app/profile/reviews',
        'review_moderation' => '/app/agency/moderation',
        // TCK-782 — un bien soumis à modération ouvre la file des biens de l'agence.
        'property_moderation' => '/app/agency/moderation/properties',
        // TCK-599 — une alerte de recherche ouvre les recherches sauvegardées, une alerte de favori
        // la liste des favoris.
        'saved_searches' => '/app/saved-searches',
        'favorites' => '/app/favorites',
        // TCK-633 lot F — une notification de crédits ouvre la page Crédits de l'espace.
        'credits' => '/app/credits',
    ];

    /**
     * TCK-1761 (P161.04) — `agencyId` : l'agence pour laquelle l'avis est émis, posée par
     * {@see forAgency()} sur les seuls avis de la section d'agence, dont la page lit l'agence du
     * profil actif. La cloche bascule sur le profil de cette agence avant de suivre le lien.
     */
    private function __construct(
        public readonly string $kind,
        public readonly ?int $id,
        public readonly ?int $agencyId = null,
    ) {}

    public static function of(string $kind, ?int $id = null): self
    {
        if (! array_key_exists($kind, self::PATHS)) {
            throw new \InvalidArgumentException("Genre de cible inconnu : {$kind}");
        }
        if (str_contains(self::PATHS[$kind], '{id}') && $id === null) {
            throw new \InvalidArgumentException("La cible {$kind} exige un identifiant.");
        }

        return new self($kind, $id);
    }

    /** La même cible, rattachée à l'agence pour laquelle l'avis est émis (TCK-1761). */
    public function forAgency(int|string|null $agencyId): self
    {
        return new self($this->kind, $this->id, is_numeric($agencyId) ? (int) $agencyId : null);
    }

    public function path(): string
    {
        return str_replace('{id}', (string) $this->id, self::PATHS[$this->kind]);
    }

    /**
     * Une cible sans agence garde sa forme d'avant : la clé `agency_id` n'apparaît qu'avec une agence.
     *
     * @return array{kind: string, id: ?int, path: string, agency_id?: int}
     */
    public function toArray(): array
    {
        $out = ['kind' => $this->kind, 'id' => $this->id, 'path' => $this->path()];
        if ($this->agencyId !== null) {
            $out['agency_id'] = $this->agencyId;
        }

        return $out;
    }

    /** @param  array<string, mixed>|null  $stored */
    public static function fromArray(?array $stored): ?self
    {
        $kind = $stored['kind'] ?? null;
        if (! is_string($kind) || ! array_key_exists($kind, self::PATHS)) {
            return null;
        }
        $id = isset($stored['id']) && is_numeric($stored['id']) ? (int) $stored['id'] : null;
        if (str_contains(self::PATHS[$kind], '{id}') && $id === null) {
            return null;
        }
        $agencyId = isset($stored['agency_id']) && is_numeric($stored['agency_id']) ? (int) $stored['agency_id'] : null;

        return new self($kind, $id, $agencyId);
    }

    /**
     * La cible d'une ligne : celle qu'elle porte, sinon celle qu'on déduit de ses clés connues.
     * Null quand rien ne la désigne — une notification sans objet n'est pas un lien.
     */
    public static function forRow(AppNotification $row): ?self
    {
        return self::fromArray(is_array($row->target) ? $row->target : null) ?? self::derive($row);
    }

    /** Déduction pour les lignes anciennes et les classes `Notification` sans cible. */
    public static function derive(AppNotification $row): ?self
    {
        $data = is_array($row->data) ? $row->data : [];
        $int = static fn (string $key): ?int => isset($data[$key]) && is_numeric($data[$key]) ? (int) $data[$key] : null;

        // L'ordre compte : une échéance porte aussi son bail, une réservation son bien.
        foreach ([
            'booking_id' => 'booking',
            'lease_id' => 'lease',
            'maintenance_request_id' => 'maintenance',
            'conversation_id' => 'conversation',
            'visit_id' => 'visit',
            'property_visit_id' => 'visit',
            'property_id' => 'property',
        ] as $key => $kind) {
            if (($id = $int($key)) !== null) {
                return new self($kind, $id);
            }
        }
        if ($int('lease_payment_id') !== null) {
            $leaseId = LeasePayment::query()->whereKey($int('lease_payment_id'))->value('lease_id');

            return $leaseId !== null ? new self('lease', (int) $leaseId) : new self('payments', null);
        }

        return self::fromReferenceable($row->referenceable_type, $row->referenceable_id);
    }

    private static function fromReferenceable(?string $type, ?int $id): ?self
    {
        if ($type === null || $id === null) {
            return null;
        }

        return match ($type) {
            'booking', Booking::class => new self('booking', $id),
            'lease', Lease::class => new self('lease', $id),
            'lease_payment', LeasePayment::class => ($leaseId = LeasePayment::query()->whereKey($id)->value('lease_id')) !== null
                ? new self('lease', (int) $leaseId)
                : new self('payments', null),
            'maintenance', MaintenanceRequest::class => new self('maintenance', $id),
            'property_visit', PropertyVisit::class => new self('visit', $id),
            'property', Property::class => new self('property', $id),
            'kyc_dossier', KycDossier::class => new self('agency_kyc', null),
            BankStatement::class => new self('finances', null),
            RoleDelegation::class => new self('team', null),
            default => null,
        };
    }
}
