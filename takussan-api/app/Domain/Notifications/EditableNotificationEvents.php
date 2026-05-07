<?php

namespace App\Domain\Notifications;

class EditableNotificationEvents
{
    public const CHANNELS = ['email', 'sms', 'push'];

    public static function all(): array
    {
        return [
            'booking_confirmed' => [
                'name' => 'Réservation confirmée',
                'domain' => 'Réservation',
                'placeholders' => ['booking.code', 'booking.start_date', 'booking.end_date', 'user.first_name', 'property.title'],
                'sample_data' => [
                    'booking' => ['code' => 'BK-2026-001', 'start_date' => '2026-05-12', 'end_date' => '2026-05-15'],
                    'user' => ['first_name' => 'Awa'],
                    'property' => ['title' => 'Villa Almadies'],
                ],
            ],
            'payment_received' => [
                'name' => 'Paiement reçu',
                'domain' => 'Paiement',
                'placeholders' => ['payment.amount', 'payment.currency', 'user.first_name'],
                'sample_data' => ['payment' => ['amount' => '250000', 'currency' => 'XOF'], 'user' => ['first_name' => 'Awa']],
            ],
            'maintenance_created' => [
                'name' => 'Maintenance créée',
                'domain' => 'Maintenance',
                'placeholders' => ['maintenance.reference', 'property.title', 'user.first_name'],
                'sample_data' => ['maintenance' => ['reference' => 'MT-42'], 'property' => ['title' => 'Appartement Plateau'], 'user' => ['first_name' => 'Awa']],
            ],
        ];
    }

    public static function has(string $event): bool
    {
        return array_key_exists($event, self::all());
    }

    public static function get(string $event): array
    {
        return self::all()[$event];
    }
}
