<?php

namespace Database\Seeders\System;

use App\Models\Tag;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class TagSeeder extends Seeder
{
    public function run(): void
    {
        $features = [
            'feature' => ['Piscine', 'Climatisation', 'Ascenseur', 'Parking', 'Balcon', 'Terrasse', 'Jardin', 'Cuisine équipée', 'Gardien', 'Vue sur mer'],
            'amenity' => ['WiFi', 'TV', 'Machine à laver', 'Sèche-linge', 'Micro-ondes', 'Lave-vaisselle', 'Sécurité 24/7'],
            'crm' => ['VIP', 'Prospect chaud', 'Étranger', 'Famille', 'Étudiant'],
        ];

        foreach ($features as $type => $names) {
            foreach ($names as $name) {
                Tag::firstOrCreate(
                    ['slug' => Str::slug($name)],
                    ['name' => $name, 'type' => $type],
                );
            }
        }
    }
}
