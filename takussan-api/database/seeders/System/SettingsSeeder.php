<?php

namespace Database\Seeders\System;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        $global = [
            'default_currency' => ['value' => 'XOF'],
            'default_locale' => ['value' => 'fr'],
            'default_timezone' => ['value' => 'Africa/Dakar'],
            'late_payment_grace_days' => ['value' => 5],
            'late_payment_penalty_rate' => ['value' => 0.05],
            'lease_renewal_notice_days' => ['value' => 60],
            'booking_expiry_days' => ['value' => 7],
        ];

        foreach ($global as $key => $data) {
            Setting::updateOrCreate(
                [
                    'key' => $key,
                    'scope' => SettingScope::Global->value,
                    'scope_id' => null,
                ],
                ['value' => $data['value']],
            );
        }

        foreach (Agency::all() as $agency) {
            Setting::updateOrCreate(
                [
                    'key' => 'branding',
                    'scope' => SettingScope::Agency->value,
                    'scope_id' => $agency->id,
                ],
                [
                    'value' => [
                        'primary_color' => '#1B4D3E',
                        'logo_url' => null,
                        'contact_email' => $agency->email,
                    ],
                ],
            );
        }
    }
}
