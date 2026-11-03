<?php

use App\Services\Ai\EmbeddingsTable;
use Illuminate\Database\Migrations\Migration;

/**
 * TCK-2423 (ADR-0076 §11, amendement du 2026-10-31) — la table `embeddings`, facultative : sans extension `vector`
 * disponible ou permise, la migration réussit sans la créer ({@see EmbeddingsTable}).
 *
 * Hors transaction : un refus de `CREATE EXTENSION` n'a alors rien à abandonner, et `EmbeddingsTable` le contient de toute
 * façon par un point de sauvegarde, pour un appelant qui en tiendrait une.
 */
return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        app(EmbeddingsTable::class)->install();
    }

    public function down(): void
    {
        app(EmbeddingsTable::class)->uninstall();
    }
};
