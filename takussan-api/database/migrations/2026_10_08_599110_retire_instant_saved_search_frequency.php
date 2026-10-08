<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-599 — `instant` est retiré par décision du porteur le 2026-10-06 : il n'a jamais été
 * instantané (le job le traitait comme `daily`). Une ligne `instant` vaut désormais `daily`, ce
 * qu'elle valait déjà à l'envoi.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('saved_searches')->where('notification_frequency', 'instant')->update(['notification_frequency' => 'daily']);
    }

    /**
     * Sans effet, délibérément : quelles lignes étaient `instant` n'est plus su, et `daily` est
     * exactement ce que le job leur servait.
     */
    public function down(): void {}
};
