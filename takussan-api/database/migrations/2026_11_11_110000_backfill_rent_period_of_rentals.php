<?php

use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2703 — un bien en location porte sa période. `Property::saving` pose `monthly` sur une location
 * qui n'en a pas, mais les seeders écrivaient sous `withoutEvents()` : 381 biens `rent` sur 451 de la
 * base de démo étaient à `rent_period` NULL (2026-11-11), hors de l'occupation
 * (`PortfolioMetrics::eligibleSql`) et des filtres « au mois » de la carte et de la recherche.
 *
 * NULL n'avait aucun sens distinct de `monthly` : toutes les lectures qui le distinguent le lisent
 * comme un mois (`RepartitionDesPrix`, `RadarTargetMatcher`, le front `rent_period ?? 'monthly'`).
 *
 * Une requête, idempotente : seules les locations sans période, supprimées comprises (elles se
 * restaurent). `updated_at` n'est pas touché : c'est une réparation, pas une édition.
 *
 * ⚠ Écrit HORS du modèle : l'index Meilisearch garde `rent_period: null` pour ces biens tant qu'il
 * n'est pas reconstruit (`php artisan scout:import "App\Models\Property"` après la migration).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('properties')
            ->where('contract_type', ContractType::Rent->value)
            ->whereNull('rent_period')
            ->update(['rent_period' => RentPeriod::Monthly->value]);
    }

    /**
     * ⚠ Le rattrapage n'est PAS défait : après lui, rien ne distingue un `monthly` rattrapé d'un
     * `monthly` saisi, et remettre NULL rendrait faux ce que le modèle garantit. Le retour ne fait
     * rien, et ne lève pas (le job `migrations-pgsql` rejoue les `down()` au-dessus de la borne
     * TCK-278).
     */
    public function down(): void
    {
        //
    }
};
