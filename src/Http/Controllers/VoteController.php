<?php

namespace UK\TheQuantum\VotifierTester\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\Endpoint;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use UK\TheQuantum\VotifierTester\Services\VoteSender;
use UK\TheQuantum\VotifierTester\Services\VoteTarget;

class VoteController
{
    public const PROTOCOLS = ['votifier', 'nuvotifier', 'nuvotifier-v2'];

    #[Endpoint('Send a test vote', 'Sends a test vote to a Votifier or NuVotifier listener.')]
    public function store(Request $request, Server $server, ExtensionSettingsRegistry $registry, VoteSender $sender): JsonResponse
    {
        abort_unless($request->user()->can('ext.votifier-tester.send', $server), 403, 'You do not have permission to send test votes.');

        $settings = $registry->get('votifier-tester');

        $data = $request->validate([
            'protocol' => ['required', Rule::in(self::PROTOCOLS)],
            'host' => ['required', 'string', 'max:253'],
            'port' => ['required', 'integer', 'between:1,65535'],
            'username' => ['required', 'string', 'regex:/^[A-Za-z0-9_]{1,16}$/'],
            'public_key' => ['exclude_if:protocol,nuvotifier-v2', 'required', 'string', 'max:4096'],
            'token' => ['exclude_unless:protocol,nuvotifier-v2', 'required', 'string', 'max:512'],
        ], [
            'username.regex' => 'The username must be 1 to 16 letters, numbers, or underscores.',
        ]);

        $key = sprintf('votifier-tester:%s:%s', $request->user()->id, $server->id);
        $limit = max(1, (int) $settings->get('rate_limit'));
        if (RateLimiter::tooManyAttempts($key, $limit)) {
            abort(429, sprintf('Too many test votes. Try again in %d seconds.', RateLimiter::availableIn($key)));
        }
        RateLimiter::hit($key, 60);

        $target = new VoteTarget(mb_strtolower(mb_trim($data['host'])), (int) $data['port']);
        if ((bool) $settings->get('restrict_to_allocations')) {
            $target = $this->resolveAllocation($server, $target);
        }

        $result = $sender->send(
            protocol: $data['protocol'],
            target: $target,
            username: $data['username'],
            serviceName: (string) $settings->get('service_name'),
            address: (string) $request->ip(),
            publicKey: $data['public_key'] ?? null,
            token: $data['token'] ?? null,
            timeout: max(1, (int) $settings->get('timeout')),
        );

        return new JsonResponse($result);
    }

    /**
     * Matches the requested host and port to one of the server's allocations and returns
     * the address to connect to, so a user can only reach the server they have access to.
     */
    private function resolveAllocation(Server $server, VoteTarget $requested): VoteTarget
    {
        $server->loadMissing(['allocations', 'node']);

        foreach ($server->allocations as $allocation) {
            if ((int) $allocation->port !== $requested->port) {
                continue;
            }

            $connect = in_array($allocation->ip, ['0.0.0.0', '::'], true) ? $server->node->fqdn : $allocation->ip;
            $names = array_filter([$allocation->ip, $allocation->ip_alias, $connect]);

            if (in_array($requested->host, array_map('mb_strtolower', $names), true)) {
                return new VoteTarget($connect, $requested->port);
            }
        }

        throw ValidationException::withMessages([
            'host' => 'Choose one of this server\'s allocations. Sending votes to other addresses is disabled on this Panel.',
        ]);
    }
}
