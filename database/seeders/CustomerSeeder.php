<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Créer un administrateur comme utilisateur par défaut pour added_by_id
        $admin = User::first() ?? User::factory()->create();
        
        // Créer 20 clients avec le statut actif
        Customer::factory()->count(15)->active()->create([
            'added_by_id' => $admin->id,
        ]);
        
        // Créer 5 clients avec le statut inactif
        Customer::factory()->count(5)->inactive()->create([
            'added_by_id' => $admin->id,
        ]);
        
        // Créer quelques clients avec des données spécifiques
        $specificCustomers = [
            [
                'first_name' => 'John',
                'last_name' => 'Doe',
                'email' => 'john.doe@example.com',
                'phone' => '+221 77 123 45 67',
                'status' => 'active',
                'birth_date' => '1985-06-15',
                'added_by_id' => $admin->id,
                'extra' => json_encode([
                    'address' => 'Dakar, Sénégal',
                    'notes' => 'Client VIP',
                ]),
            ],
            [
                'first_name' => 'Jane',
                'last_name' => 'Smith',
                'email' => 'jane.smith@example.com',
                'phone' => '+221 77 234 56 78',
                'status' => 'active',
                'birth_date' => '1990-03-22',
                'added_by_id' => $admin->id,
                'extra' => json_encode([
                    'address' => 'Thiès, Sénégal',
                    'notes' => 'Client régulier',
                ]),
            ],
        ];
        
        foreach ($specificCustomers as $customerData) {
            Customer::create($customerData);
        }
    }
}
