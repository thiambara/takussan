<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * TCK-142 — Static guard. The polymorphic profile cutover dropped `users.type`
 * and `users.agency_id` along with the `UserType` enum. New code that
 * reintroduces any of those identifiers should fail the build instead of
 * silently re-creating the dual-source-of-truth class of bug TCK-138 is
 * meant to eliminate.
 *
 * Scope is `app/` and `database/seeders/` — migrations and tests are
 * intentionally exempt because migrations may legitimately reference dropped
 * columns historically and tests may reference profile-class names that
 * happen to match the prefix.
 */
class NoLegacyUserTypeTest extends TestCase
{
    /** @return list<string> */
    private function scanForPattern(string $regex): array
    {
        $hits = [];
        $roots = [
            base_path('app'),
            base_path('database/seeders'),
        ];

        foreach ($roots as $root) {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
            );
            foreach ($iterator as $file) {
                if ($file->getExtension() !== 'php') {
                    continue;
                }
                $contents = file_get_contents($file->getPathname());
                if ($contents === false) {
                    continue;
                }
                if (preg_match_all($regex, $contents, $matches, PREG_OFFSET_CAPTURE)) {
                    foreach ($matches[0] as $match) {
                        $line = substr_count(substr($contents, 0, $match[1]), "\n") + 1;
                        $relative = str_replace(base_path().'/', '', $file->getPathname());
                        $hits[] = "{$relative}:{$line} — {$match[0]}";
                    }
                }
            }
        }

        return $hits;
    }

    public function test_no_user_type_enum_references_remain_in_app_or_seeders(): void
    {
        $hits = $this->scanForPattern('/\bUserType\b/');
        $this->assertSame([], $hits, 'UserType references must be removed entirely.');
    }

    public function test_no_users_dot_type_or_agency_id_string_remains(): void
    {
        // Match the literal SQL-style `users.type` / `users.agency_id` strings.
        // Prose mentions in comments would also flag — that's intentional, the
        // documentation lives in tickets, not the code.
        $hits = $this->scanForPattern('/users\.(type|agency_id)/');
        $this->assertSame([], $hits, 'No `users.type` / `users.agency_id` literals must remain.');
    }
}
