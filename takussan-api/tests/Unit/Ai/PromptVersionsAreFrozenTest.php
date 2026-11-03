<?php

namespace Tests\Unit\Ai;

use PHPUnit\Framework\TestCase;

/**
 * TCK-2384 (ADR-0076 §6) — une version de prompt publiée ne se réécrit pas : `ai_calls` inscrit la
 * version jouée, et un `v1` réécrit ferait mentir chaque ligne passée. Changer un prompt, c'est
 * créer `v<N+1>.md` et l'inscrire dans `versions.lock.json` (`shasum -a 256 <fichier>`).
 */
class PromptVersionsAreFrozenTest extends TestCase
{
    public function test_every_prompt_file_is_locked_and_unchanged(): void
    {
        $root = dirname(__DIR__, 3).'/resources/ai/prompts';
        $lock = json_decode((string) file_get_contents($root.'/versions.lock.json'), true, flags: JSON_THROW_ON_ERROR);
        $files = glob($root.'/*/v*.md') ?: [];

        $this->assertNotEmpty($files);
        foreach ($files as $file) {
            $relative = substr($file, strlen($root) + 1);
            $this->assertArrayHasKey($relative, $lock, "{$relative} n'est pas inscrit dans versions.lock.json");
            $this->assertSame($lock[$relative], hash_file('sha256', $file), "{$relative} a été réécrit : créer une nouvelle version");
        }
        $this->assertCount(count($files), $lock, 'versions.lock.json cite un prompt qui n\'existe plus');
    }
}
