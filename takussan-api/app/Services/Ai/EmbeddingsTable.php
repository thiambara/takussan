<?php

namespace App\Services\Ai;

use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2423 (ADR-0076 §11, amendement du 2026-10-31) — la table `embeddings` et l'extension `vector`, facultatives : leur
 * absence ne fait jamais rougir une migration, et le pilote d'embeddings se déclare alors indisponible.
 *
 * Trois cas, lus avant d'essayer : l'extension est déjà là ; elle est absente de `pg_available_extensions` (rien à
 * tenter) ; elle est disponible, et sa création peut être refusée au rôle de la base (`vector` n'est pas de confiance en
 * préproduction). Le `CREATE EXTENSION` tourne dans sa propre transaction, un point de sauvegarde si l'appelant en tient
 * une : une erreur SQL abandonne la transaction PostgreSQL entière, et un `catch` seul ne la rendrait pas utilisable.
 *
 * `up()` et `ai:install-embeddings` passent par {@see self::install()} : le second sert quand un superutilisateur a posé
 * l'extension après la migration, qui ne se rejoue pas.
 */
class EmbeddingsTable
{
    public const INSTALLED = 'installed';

    public const UNAVAILABLE = 'extension_unavailable';

    public const REFUSED = 'extension_refused';

    /** Droit insuffisant (42501), fichier de l'extension absent (58P01), objet dépendant au retrait (2BP01). */
    private const TOLERATED = ['42501', '58P01', '2BP01'];

    public function exists(): bool
    {
        return Schema::hasTable('embeddings');
    }

    /** @return self::INSTALLED|self::UNAVAILABLE|self::REFUSED */
    public function install(): string
    {
        if (! $this->extensionInstalled()) {
            if (! $this->extensionAvailable()) {
                Log::warning('ai.embeddings.extension_unavailable');

                return self::UNAVAILABLE;
            }
            if (! $this->attempt('CREATE EXTENSION IF NOT EXISTS vector')) {
                Log::warning('ai.embeddings.extension_refused');

                return self::REFUSED;
            }
        }

        if (! $this->exists()) {
            Schema::create('embeddings', function (Blueprint $table) {
                $table->id();
                $table->morphs('embeddable');
                $table->string('provider');
                $table->string('model');
                $table->unsignedInteger('dimension');
                // Sans dimension fixe : plusieurs modèles cohabitent le temps d'un changement. Comparaison exacte, sans index
                // approché (ADR-0076, amendement du 2026-10-31).
                $table->vector('vector');
                $table->char('content_hash', 64);
                $table->timestamps();
                $table->unique(['embeddable_type', 'embeddable_id', 'provider', 'model', 'dimension'], 'embeddings_object_model_unique');
                $table->index(['content_hash', 'provider', 'model', 'dimension'], 'embeddings_hash_model_idx');
            });
        }

        return self::INSTALLED;
    }

    /**
     * La table d'abord, puis l'extension si ce rôle en est le propriétaire : posée par un superutilisateur, elle n'est pas à
     * lui, et un autre objet peut en dépendre. Dans les deux cas, elle reste sans faire rougir le retour arrière.
     */
    public function uninstall(): void
    {
        Schema::dropIfExists('embeddings');

        if ($this->extensionInstalled() && $this->ownsExtension()) {
            $this->attempt('DROP EXTENSION IF EXISTS vector');
        }
    }

    private function extensionInstalled(): bool
    {
        return DB::table('pg_extension')->where('extname', 'vector')->exists();
    }

    protected function extensionAvailable(): bool
    {
        return DB::table('pg_available_extensions')->where('name', 'vector')->exists();
    }

    private function ownsExtension(): bool
    {
        return DB::table('pg_extension')->where('extname', 'vector')
            ->whereRaw('(pg_get_userbyid(extowner) = current_user OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user))')
            ->exists();
    }

    private function attempt(string $statement): bool
    {
        try {
            DB::transaction(fn () => DB::statement($statement));

            return true;
        } catch (QueryException $e) {
            if (in_array($e->getCode(), self::TOLERATED, true)) {
                return false;
            }

            throw $e;
        }
    }
}
