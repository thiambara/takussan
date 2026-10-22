<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-1396 (P144.01, ADR-0072) — une écriture rejouée sous la même `Idempotency-Key` du même auteur
 * rend, telle quelle, la réponse 2xx de la première pendant 24 h ; la même clé pour une autre
 * requête (méthode, chemin, profil actif, entrée, fichiers) est refusée en 422.
 *
 * - En-tête facultatif : absent ou vide, la route se comporte comme avant.
 * - Seule une réponse 2xx se range (statut, corps, `Content-Type`) : un 422 de validation, un 403,
 *   un 409 ou un 5xx repassent, pour que la saisie corrigée parte sous la même clé (§ 4).
 * - Deux envois simultanés : le second trouve le verrou pris et reçoit 409, sans attendre (§ 5).
 * - Se pose route par route, APRÈS `auth:sanctum` et `throttle` (alias `idempotent`).
 *
 * ⚠ Un intervalle reste ouvert entre le COMMIT de la route et le `Cache::put` (ADR-0072,
 * Conséquences) : l'achat de boost (TCK-822) n'y passe pas, sa clé vit dans sa transaction.
 */
final class EnsureIdempotentWrite
{
    public const HEADER = 'Idempotency-Key';

    public const REPLAYED_HEADER = 'Idempotent-Replayed';

    public const IDEMPOTENCY_TTL_HOURS = 24;

    /** Au-dessus de la plus longue borne du serveur Next (90 s pour un `formData`, TCK-1215). */
    public const LOCK_SECONDS = 120;

    private const KEY_PATTERN = '/^[A-Za-z0-9._:-]{8,255}$/';

    public function handle(Request $request, Closure $next): Response
    {
        $key = trim((string) $request->header(self::HEADER, ''));
        if ($key === '') {
            return $next($request);
        }

        abort_code_unless(preg_match(self::KEY_PATTERN, $key) === 1, 422, 'idempotency.key_invalid');

        $suffix = $this->suffix($request, $key);
        $lock = Cache::lock('idempotency-lock:'.$suffix, self::LOCK_SECONDS);
        abort_code_unless($lock->get(), 409, 'idempotency.in_progress');

        try {
            $fingerprint = $this->fingerprint($request);
            $stored = Cache::get('idempotency:'.$suffix);

            if (is_array($stored)) {
                abort_code_unless(hash_equals((string) ($stored['fingerprint'] ?? ''), $fingerprint), 422, 'idempotency.key_reused');

                return $this->replay($stored);
            }

            $response = $next($request);

            $content = $response->getContent();
            if ($response->isSuccessful() && $content !== false) {
                Cache::put('idempotency:'.$suffix, [
                    'fingerprint' => $fingerprint,
                    'status' => $response->getStatusCode(),
                    'content' => $content,
                    'content_type' => $response->headers->get('Content-Type'),
                ], now()->addHours(self::IDEMPOTENCY_TTL_HOURS));
            }

            return $response;
        } finally {
            $lock->release();
        }
    }

    /** `<auteur>:<nom de route>:<sha256 de la clé>` — la clé n'est jamais rangée en clair (§ 2). */
    private function suffix(Request $request, string $key): string
    {
        $author = $request->user()?->getAuthIdentifier() ?? 'anonyme';
        $route = $request->route()?->getName() ?? $request->path();

        return $author.':'.$route.':'.hash('sha256', $key);
    }

    /** § 3 — méthode, chemin résolu, profil actif, entrée triée, `sha256` de chaque fichier. */
    private function fingerprint(Request $request): string
    {
        $profile = $request->activeProfile();
        $files = [];
        foreach (Arr::dot($request->allFiles()) as $field => $file) {
            if ($file instanceof UploadedFile) {
                $files[$field] = hash_file('sha256', $file->getRealPath()) ?: '';
            }
        }
        ksort($files);

        return hash('sha256', (string) json_encode([
            $request->method(),
            '/'.ltrim($request->path(), '/'),
            $profile === null ? null : $profile->getMorphClass().':'.$profile->getKey(),
            $this->sorted($request->input()),
            $files,
        ]));
    }

    private function sorted(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        ksort($value);

        return array_map(fn (mixed $v): mixed => $this->sorted($v), $value);
    }

    /** @param  array<string, mixed>  $stored */
    private function replay(array $stored): Response
    {
        $response = new Response((string) ($stored['content'] ?? ''), (int) ($stored['status'] ?? 200));
        if (is_string($stored['content_type'] ?? null)) {
            $response->headers->set('Content-Type', $stored['content_type']);
        }
        $response->headers->set(self::REPLAYED_HEADER, 'true');

        return $response;
    }
}
