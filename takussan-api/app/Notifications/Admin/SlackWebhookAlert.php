<?php

namespace App\Notifications\Admin;

class SlackWebhookAlert
{
    public static function payload(array $alert): array
    {
        return [
            'text' => $alert['message'],
            'blocks' => [
                ['type' => 'section', 'text' => ['type' => 'mrkdwn', 'text' => $alert['message']]],
                ['type' => 'context', 'elements' => [['type' => 'mrkdwn', 'text' => $alert['audit_url']]]],
            ],
        ];
    }
}
