<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2960 (ADR-0128 § 2) — une SALLE par bail et par réservation : index unique partiel sur le sujet du
 * fil, restreint aux fils de type `lease` et `booking` dont le sujet est un bail ou une réservation.
 *
 * Pourquoi pas « tout fil qui porte un sujet » : la reprise de TCK-2957 a donné le sujet
 * `maintenance_request` à des DIRECTES aussi, et un groupe et une directe d'une même intervention
 * violeraient l'index. Un groupe peut aussi porter un sujet `booking` (TCK-2957) : il n'est pas une salle.
 *
 * La création passe par `insertOrIgnore` (`ON CONFLICT DO NOTHING`, qui couvre un index partiel sans
 * cible nommée), puis une relecture : jamais de `try/catch` sur la violation (piège PostgreSQL n° 1).
 * Un fil supprimé en douceur sort de l'index.
 *
 * Nommé explicitement (piège n° 3), en SQL : le constructeur de schéma n'écrit pas de `WHERE`.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX conversations_salle_unique
                ON conversations (subject_type, subject_id)
             WHERE type IN ('lease', 'booking')
               AND subject_type IN ('lease', 'booking')
               AND deleted_at IS NULL
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS conversations_salle_unique');
    }
};
