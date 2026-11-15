<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2784 — `customers.last_contacted_at` passe à la microseconde : `timestamp(6) without time zone`.
 * Laravel 13 crée un `timestamp` à `Schema\Builder::$defaultTimePrecision = 0`, et PostgreSQL ARRONDIT
 * à la seconde la plus proche : deux contacts dans la même seconde perdaient leur ordre, et le canal
 * du second (`last_contact_channel`) n'était pas écrit. La valeur liée passe à la microseconde dans
 * `ContactGestureService::touchCustomer()` ; l'un sans l'autre ne corrige rien.
 *
 * L'élargissement conserve les valeurs existantes, toutes à la seconde, et l'index
 * `customers_agency_last_contacted_idx` (`agency_id`, `last_contacted_at`) est reconstruit par
 * PostgreSQL au changement de type, sous le même nom et la même définition.
 *
 * `down()` est AVEC PERTE : il rend la colonne à la seconde, et PostgreSQL ARRONDIT chaque valeur à
 * la seconde la plus proche (12:00:00.600 devient 12:00:01). L'ordre de deux contacts de la même
 * seconde, et leur rapport aux contacts de la seconde suivante, ne se retrouvent pas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->timestamp('last_contacted_at', 6)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->timestamp('last_contacted_at', 0)->nullable()->change();
        });
    }
};
