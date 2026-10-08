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
     * @var array<string, string>
     */
    public const PATHS = [
        'lease' => '/app/leases/{id}',
        'payments' => '/app/payments',
        'booking' => '/app/bookings/{id}',
        'visit' => '/app/visits/{id}',
        'maintenance' => '/app/maintenance/{id}',
        'property' => '/app/properties/{id}',
        'conversation' => '/app/messages?conversation={id}',
        // TCK-590 — la boîte « Demandes », ouverte sur la demande.
        'lead' => '/app/leads?lead={id}',
        'agency_kyc' => '/admin/agency/kyc',
        'kyc_review' => '/super-admin/kyc',
        'finances' => '/admin/finances',
        'team' => '/admin/team',
        'agency_settings' => '/admin/agency',
        // TCK-601 — une alerte de gouvernance ouvre le journal d'audit de l'agence.
        'audit' => '/admin/audit',
        // TCK-597 — la boîte des avis reçus, et la modération des avis de l'agence.
        'reviews' => '/app/reviews',
        'review_moderation' => '/admin/reviews',
    ];

    private function __construct(
        public readonly string $kind,
        public readonly ?int $id,
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

    public function path(): string
    {
        return str_replace('{id}', (string) $this->id, self::PATHS[$this->kind]);
    }

    /** @return array{kind: string, id: ?int, path: string} */
    public function toArray(): array
    {
        return ['kind' => $this->kind, 'id' => $this->id, 'path' => $this->path()];
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

        return new self($kind, $id);
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
