<?php

namespace Tests\Support;

use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use PHPUnit\Framework\Assert;

/**
 * TCK-589 — faux {@see SmsRouterDriver}, lié dans le conteneur à la place du vrai.
 *
 * C'est le SEUL endroit où un test lit un code à usage unique : l'API ne le rend
 * dans aucune réponse, dans aucun environnement (contrainte 3). Le faux répond
 * `sent` à chaque destinataire et garde chaque envoi (numéro, texte, contexte).
 *
 *     $sms = FakeSmsRouter::install();
 *     $this->postJson('/api/auth/phone/send-otp')->assertOk();
 *     $code = $sms->lastCodeFor('+221770000000');
 */
class FakeSmsRouter extends SmsRouterDriver
{
    /** @var list<array{to: string, message: string, context: array<string, mixed>}> */
    public array $sent = [];

    /** Le constructeur du vrai routeur n'est pas appelé : le faux n'a aucune dépendance. */
    public function __construct() {}

    public static function install(): self
    {
        $fake = new self;
        app()->instance(SmsRouterDriver::class, $fake);

        return $fake;
    }

    public function id(): string
    {
        return 'router';
    }

    public function send(array|string $to, string $message, array $context = []): array
    {
        $results = [];
        foreach ((array) $to as $recipient) {
            $number = PhoneNumber::normalize($recipient);
            $this->sent[] = ['to' => $number, 'message' => $message, 'context' => $context];
            $results[$number] = SmsResult::sent($number, 'fake', 'fake_'.count($this->sent));
        }

        return $results;
    }

    /** @return list<array{to: string, message: string, context: array<string, mixed>}> */
    public function sentTo(string $phone): array
    {
        return array_values(array_filter($this->sent, fn (array $s) => $s['to'] === $phone));
    }

    /** Le code à 6 chiffres du dernier SMS envoyé à ce numéro. */
    public function lastCodeFor(string $phone): string
    {
        $messages = $this->sentTo($phone);
        Assert::assertNotEmpty($messages, "Aucun SMS envoyé à {$phone}.");
        $last = end($messages)['message'];
        Assert::assertMatchesRegularExpression('/\b\d{6}\b/', $last, 'Le SMS ne contient pas de code à 6 chiffres.');
        preg_match('/\b(\d{6})\b/', $last, $m);

        return $m[1];
    }
}
