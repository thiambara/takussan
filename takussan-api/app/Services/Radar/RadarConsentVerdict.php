<?php

namespace App\Services\Radar;

use App\Ai\Agents\RadarConsentVerification;
use App\Models\Enums\RadarConfidence;
use App\Models\RadarConsent;
use App\Support\RadarPhone;
use InvalidArgumentException;

/**
 * TCK-2388 (ADR-0077 §3) — la sortie de `radar.verification_accord`, relue par du code, qui l'emporte sur le modèle
 * là où il peut juger : le NUMÉRO se compare en E.164 (`RadarPhone`) quand il se lit, et les clauses se dédoublonnent
 * et se bornent à `1..N`. **Un verdict n'ouvre rien** : seul un humain confirme, et `discordances()` dit à
 * l'opérateur ce qui, dans le verdict, ne va pas dans le sens d'un accord.
 */
final class RadarConsentVerdict
{
    public const DISCORDANCES = ['no_verdict', 'number_mismatch', 'identity_unverified', 'clauses_missing', 'not_consent'];

    /** Les clés que la sortie doit porter : une clé absente n'est pas une sortie du schéma. */
    private const KEYS = [
        'transcript', 'reply_text', 'counterpart_phone', 'counterpart_name', 'number_matches', 'name_matches',
        'clauses_found', 'classification', 'confidence',
    ];

    /**
     * @param  array<string, mixed>  $structured  la sortie de l'agent
     * @return array{classification: string, confidence: string, transcript: string, reply_text: ?string,
     *               counterpart_phone: ?string, counterpart_name: ?string, number_matches: ?bool,
     *               number_checked_by: 'code'|'model', name_matches: ?bool, clauses_found: list<int>,
     *               clauses_complete: bool, discordances: list<string>}
     *
     * @throws InvalidArgumentException une sortie qui n'est pas celle du schéma
     */
    public static function from(array $structured, ?string $advertiserE164, int $clauseCount): array
    {
        foreach (self::KEYS as $key) {
            if (! array_key_exists($key, $structured)) {
                throw new InvalidArgumentException("clé absente : {$key}");
            }
        }
        $classification = $structured['classification'];
        if (! is_string($classification) || ! in_array($classification, RadarConsentVerification::CLASSIFICATIONS, true)) {
            throw new InvalidArgumentException('classification inconnue');
        }
        $confidence = is_string($structured['confidence']) ? RadarConfidence::tryFrom($structured['confidence']) : null;
        if ($confidence === null) {
            throw new InvalidArgumentException('confiance inconnue');
        }
        if (! is_string($structured['transcript']) || ! is_array($structured['clauses_found'])) {
            throw new InvalidArgumentException('transcription ou clauses illisibles');
        }

        $shown = self::text($structured['counterpart_phone']);
        $canonical = $shown === null ? null : RadarPhone::canonical($shown);
        // Le numéro se lit : le code compare, le modèle n'a plus voix au chapitre. Sinon, son booléen, étiqueté comme tel.
        if ($canonical !== null && $advertiserE164 !== null) {
            $numberMatches = $canonical === $advertiserE164;
            $checkedBy = 'code';
        } else {
            $numberMatches = is_bool($structured['number_matches']) ? $structured['number_matches'] : null;
            $checkedBy = 'model';
        }

        $clauses = [];
        foreach ($structured['clauses_found'] as $number) {
            if (is_int($number) && $number >= 1 && $number <= $clauseCount) {
                $clauses[$number] = true;
            }
        }
        $found = array_keys($clauses);
        sort($found);

        $verdict = [
            'classification' => $classification,
            'confidence' => $confidence->value,
            'transcript' => $structured['transcript'],
            'reply_text' => self::text($structured['reply_text']),
            'counterpart_phone' => $shown,
            'counterpart_name' => self::text($structured['counterpart_name']),
            'number_matches' => $numberMatches,
            'number_checked_by' => $checkedBy,
            'name_matches' => is_bool($structured['name_matches']) ? $structured['name_matches'] : null,
            'clauses_found' => $found,
            'clauses_complete' => $clauseCount > 0 && count($found) === $clauseCount,
        ];

        return $verdict + ['discordances' => self::judge($verdict)];
    }

    /**
     * TCK-2395 — le verdict d'une réponse reçue par l'API (`proof = provider_message`). Le modèle n'y a voix que pour le
     * classement et sa confiance ; le reste est jugé par le code : le numéro est celui de l'expéditeur, authentifié par la
     * signature de Meta et rattaché à l'annonceur par ce numéro (`number_matches`, `code`), les clauses sont parties dans
     * le gabarit approuvé (`clauses_checked_by`, `code`), la transcription et le texte sont ceux reçus.
     *
     * @param  array<string, mixed>  $structured  la sortie de l'agent
     * @return array<string, mixed>
     *
     * @throws InvalidArgumentException une classification ou une confiance hors du schéma
     */
    public static function fromProviderMessage(array $structured, string $transcript, string $replyText, int $clauseCount): array
    {
        $classification = $structured['classification'] ?? null;
        if (! is_string($classification) || ! in_array($classification, RadarConsentVerification::CLASSIFICATIONS, true)) {
            throw new InvalidArgumentException('classification inconnue');
        }
        $confidence = is_string($structured['confidence'] ?? null) ? RadarConfidence::tryFrom($structured['confidence']) : null;
        if ($confidence === null) {
            throw new InvalidArgumentException('confiance inconnue');
        }

        $verdict = [
            'classification' => $classification,
            'confidence' => $confidence->value,
            'transcript' => $transcript,
            'reply_text' => $replyText,
            'counterpart_phone' => null,
            'counterpart_name' => null,
            'number_matches' => true,
            'number_checked_by' => 'code',
            'name_matches' => null,
            'clauses_found' => $clauseCount > 0 ? range(1, $clauseCount) : [],
            'clauses_complete' => $clauseCount > 0,
            'clauses_checked_by' => 'code',
        ];

        return $verdict + ['discordances' => self::judge($verdict)];
    }

    /**
     * Ce qui, dans le verdict enregistré d'une réponse, ne va pas dans le sens d'un accord : `no_verdict` (aucun verdict :
     * en cours, ou échec), `number_mismatch` (un numéro lu et différent), `clauses_missing` (une clause du message
     * envoyé n'est pas lisible sur les captures), `not_consent` (la dernière réponse n'est pas un « oui »),
     * `identity_unverified` (le numéro ne s'est PAS lu et le nom n'est pas confirmé non plus : rien ne dit à qui
     * appartient la conversation — décision du porteur du 2026-10-28). Un numéro illisible dont le NOM concorde n'est pas
     * une discordance ; un numéro lu et différent est déjà `number_mismatch`, sans `identity_unverified` en plus.
     *
     * @return list<string>
     */
    public static function discordances(RadarConsent $reply): array
    {
        $verdict = $reply->ai_verdict;

        return is_array($verdict) && $verdict !== [] ? self::judge($verdict) : ['no_verdict'];
    }

    /**
     * @param  array<string, mixed>  $verdict
     * @return list<string>
     */
    private static function judge(array $verdict): array
    {
        $out = [];
        $numberMatches = $verdict['number_matches'] ?? null;
        if ($numberMatches === false) {
            $out[] = 'number_mismatch';
        }
        if ($numberMatches === null && ($verdict['name_matches'] ?? null) !== true) {
            $out[] = 'identity_unverified';
        }
        if (($verdict['clauses_complete'] ?? false) !== true) {
            $out[] = 'clauses_missing';
        }
        if (($verdict['classification'] ?? null) !== 'consent') {
            $out[] = 'not_consent';
        }

        return $out;
    }

    private static function text(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
