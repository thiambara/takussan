<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-862 (P02.04) — `customers.user_id` porte un index.
 *
 * `HasProfiles::hasActiveTenantLease()` joint `customers ⋈ leases` sur `customers.user_id` à chaque
 * `/api/auth/me`. PostgreSQL n'indexe pas une clé étrangère (piège n° 8 de `CLAUDE.md`) : la
 * jointure relisait toute la table `customers` (mesuré, `Seq Scan on customers`, même sous
 * `enable_seqscan = off`). Ajout d'index seul, sans réécriture de données.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->index('user_id', 'customers_user_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->dropIndex('customers_user_id_index');
        });
    }
};
