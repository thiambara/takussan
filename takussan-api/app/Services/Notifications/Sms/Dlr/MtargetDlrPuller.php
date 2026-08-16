<?php

namespace App\Services\Notifications\Sms\Dlr;

use App\Services\Notifications\Sms\IntegrationLocator;
use Illuminate\Contracts\Config\Repository as ConfigRepository;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Support\Facades\Log;

/**
 * TCK-294 — Mtarget "API Pulling DLR / MO" driver.
 *
 * Contract, as published by the operator (developers.mtarget.fr/api-pulling,
 * read 2026-08-16):
 *
 *   POST {pull_url}  (form-urlencoded)
 *   body : username, password, optional `max` (page size, operator
 *          default 50), optional `serviceid` (mandatory once the account
 *          is configured for it)
 *   200  : {"results":[ … ]} — `{"results":[]}` when the queue is empty
 *   error: reported INSIDE `results` as a row with a negative `code`,
 *          a `reason`, and the literal string "null" as `ticket`
 *   retention: reports are dropped by Mtarget after one month
 *
 * ⚠️ What the operator does NOT document, and what this driver therefore
 * treats defensively:
 *
 *   - the field names of a *delivery report* row. The only example on the
 *     page is an error row (`msisdn`,`smscount`,`code`,`reason`,`ticket`);
 *     the push documentation uses `MsgId`/`DestinationAdress`/`StatusText`
 *     for the same data. Both spellings are accepted below.
 *   - whether pulling must be enabled by Mtarget support on the account
 *     (a support note says it is opt-in), and what quota applies.
 *
 * Credentials come from the same `sms_mtarget` Integration row the send
 * driver uses — pulling introduces no new secret.
 */
class MtargetDlrPuller implements SmsDlrPullerInterface
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly ConfigRepository $config,
        private readonly IntegrationLocator $integrations,
    ) {}

    public function id(): string
    {
        return 'mtarget';
    }

    public function pull(array $context = [], int $max = 50): SmsDlrBatch
    {
        $integration = $this->integrations->find($context['agency_id'] ?? null, 'sms_mtarget');
        if ($integration === null) {
            return SmsDlrBatch::failed('mtarget_integration_missing');
        }
        $creds = $integration->credentials ?? [];
        $payload = [
            'username' => $creds['username'] ?? '',
            'password' => $creds['password'] ?? '',
            'max' => max(1, $max),
        ];
        if (! empty($creds['service_id'])) {
            $payload['serviceid'] = $creds['service_id'];
        }

        try {
            $response = $this->http->asForm()
                ->timeout(15)
                ->post((string) $this->config->get('sms.mtarget.pull_url'), $payload);
        } catch (\Throwable $e) {
            return SmsDlrBatch::failed('mtarget_pull_http_exception: '.$e->getMessage());
        }

        if (! $response->successful()) {
            return SmsDlrBatch::failed('mtarget_pull_http_'.$response->status());
        }

        $body = $response->json();
        if (! is_array($body) || ! array_key_exists('results', $body) || ! is_array($body['results'])) {
            return SmsDlrBatch::failed('mtarget_pull_malformed_body');
        }

        $records = [];
        foreach ($body['results'] as $row) {
            if (! is_array($row)) {
                continue;
            }
            // API-level errors travel inside `results`. Treating one as a
            // report would mark a real message failed because of an
            // authentication problem — fail the whole call instead.
            $error = $this->errorOf($row);
            if ($error !== null) {
                return SmsDlrBatch::failed($error);
            }
            $record = $this->toRecord($row);
            if ($record === null) {
                Log::warning('[sms.mtarget.pull] unrecognised record shape', ['record' => $row]);

                continue;
            }
            $records[] = $record;
        }

        // Only on a productive call: the scheduler polls every five
        // minutes and an empty queue is the normal case — stamping
        // `last_used_at` on each tick would say "we used Mtarget" 288
        // times a day and mean nothing.
        if ($records !== []) {
            $integration->forceFill(['last_used_at' => now()])->save();
        }

        return SmsDlrBatch::of($records);
    }

    /**
     * An API-level error row, per the documented example: negative `code`,
     * a `reason`, and the literal string "null" where the ticket goes. The
     * ticket condition matters — without it, any future report row that
     * happens to carry a negative `code` would abort a whole drain.
     *
     * @param  array<string,mixed>  $row
     */
    private function errorOf(array $row): ?string
    {
        if (! array_key_exists('code', $row) || ! is_numeric($row['code'])) {
            return null;
        }
        $code = (int) $row['code'];
        $ticket = trim((string) ($row['ticket'] ?? $row['MsgId'] ?? ''));
        if ($code >= 0 || ! in_array($ticket, ['', 'null'], true)) {
            return null;
        }

        return 'mtarget_pull_error_'.$code.': '.(string) ($row['reason'] ?? 'unknown');
    }

    /**
     * @param  array<string,mixed>  $row
     */
    private function toRecord(array $row): ?SmsDlrRecord
    {
        $ticket = trim((string) ($row['ticket'] ?? $row['MsgId'] ?? ''));
        if ($ticket === '' || $ticket === 'null') {
            return null;
        }
        $msisdn = trim((string) ($row['msisdn'] ?? $row['DestinationAdress'] ?? ''));
        $rawStatus = $row['Status'] ?? $row['status'] ?? null;
        $statusText = $row['StatusText'] ?? $row['reason'] ?? null;

        return new SmsDlrRecord(
            ticket: $ticket,
            msisdn: $msisdn === 'null' ? '' : $msisdn,
            statusCode: is_numeric($rawStatus) ? (int) $rawStatus : null,
            statusText: $statusText !== null ? (string) $statusText : null,
            raw: $row,
        );
    }
}
