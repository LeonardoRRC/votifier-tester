<?php

namespace UK\TheQuantum\VotifierTester\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use LeonardoRRC\VotifierClient\Exception\NotVotifierException;
use LeonardoRRC\VotifierClient\Exception\NuVotifierChallengeInvalidException;
use LeonardoRRC\VotifierClient\Exception\NuVotifierSignatureInvalidException;
use LeonardoRRC\VotifierClient\Exception\NuVotifierUnknownServiceException;
use LeonardoRRC\VotifierClient\Exception\NuVotifierUsernameTooLongException;
use LeonardoRRC\VotifierClient\Exception\Socket\NoConnectionException;
use LeonardoRRC\VotifierClient\Exception\Socket\PackageNotReceivedException;
use LeonardoRRC\VotifierClient\Exception\Socket\PackageNotSentException;
use LeonardoRRC\VotifierClient\Server\NuVotifier;
use LeonardoRRC\VotifierClient\Server\Votifier;
use LeonardoRRC\VotifierClient\Vote\ClassicVote;

class VoteSender
{
    /**
     * Sends one vote and returns the outcome as a response payload. Listener errors are
     * returned as readable messages rather than thrown.
     *
     * @return array{success: bool, message: string, protocol: string, host: string, port: int, username: string, latency_ms: int}
     */
    public function send(
        string $protocol,
        VoteTarget $target,
        string $username,
        string $serviceName,
        string $address,
        ?string $publicKey,
        ?string $token,
        int $timeout,
    ): array {
        // Classic Votifier and NuVotifier v1 share the RSA protocol.
        $server = $protocol === 'nuvotifier-v2'
            ? (new NuVotifier())->setProtocolV2(true)->setToken(mb_trim((string) $token))
            : (new Votifier())->setPublicKey($this->normalizePublicKey((string) $publicKey));

        $server->setHost($target->host)->setPort($target->port);

        $vote = (new ClassicVote())
            ->setUsername($username)
            ->setServiceName($serviceName)
            ->setAddress($address);

        $previousTimeout = ini_get('default_socket_timeout');
        ini_set('default_socket_timeout', (string) $timeout);
        $started = hrtime(true);

        try {
            $server->sendVote($vote);
            $success = true;
            $message = sprintf('Test vote for %s was delivered to %s:%d.', $username, $target->host, $target->port);
        } catch (\Throwable $exception) {
            $success = false;
            $message = $this->describe($exception, $target);
        } finally {
            ini_set('default_socket_timeout', (string) $previousTimeout);
        }

        return [
            'success' => $success,
            'message' => $message,
            'protocol' => $protocol,
            'host' => $target->host,
            'port' => $target->port,
            'username' => $username,
            'latency_ms' => (int) round((hrtime(true) - $started) / 1e6),
        ];
    }

    /**
     * Accepts the key as copied from public.key, with or without PEM headers and line
     * breaks, and rejects it before connecting if OpenSSL cannot read it. Without this
     * check an invalid key encrypts to an empty packet that the library reports as sent.
     */
    private function normalizePublicKey(string $key): string
    {
        $body = preg_replace('/-----(BEGIN|END) PUBLIC KEY-----|\s+/', '', $key) ?? '';
        $pem = "-----BEGIN PUBLIC KEY-----\n".wordwrap($body, 64, "\n", true)."\n-----END PUBLIC KEY-----";

        if ($body === '' || openssl_pkey_get_public($pem) === false) {
            throw ValidationException::withMessages([
                'public_key' => 'This is not a valid RSA public key. Copy the contents of plugins/Votifier/rsa/public.key.',
            ]);
        }

        return $body;
    }

    private function describe(\Throwable $exception, VoteTarget $target): string
    {
        $address = sprintf('%s:%d', $target->host, $target->port);

        return match (true) {
            $exception instanceof NoConnectionException => sprintf('Could not connect to %s. Check that the server is running and Votifier is listening on that port.', $address),
            $exception instanceof PackageNotReceivedException => sprintf('%s accepted the connection but did not answer in time. It may not be a Votifier port.', $address),
            $exception instanceof PackageNotSentException => sprintf('The vote could not be sent to %s. The connection was closed.', $address),
            $exception instanceof NuVotifierSignatureInvalidException => 'NuVotifier rejected the vote signature. Check the token in plugins/Votifier/config.yml.',
            $exception instanceof NuVotifierUnknownServiceException => 'NuVotifier has no token for this service name. Add one to config.yml, or ask an administrator to change the service name.',
            $exception instanceof NuVotifierUsernameTooLongException => 'NuVotifier rejected the username because it is too long.',
            $exception instanceof NuVotifierChallengeInvalidException => 'NuVotifier rejected the vote challenge. Try again.',
            $exception instanceof NotVotifierException => sprintf('%s answered, but not as the selected Votifier version. Check the port and protocol.', $address),
            default => $this->unexpected($exception),
        };
    }

    private function unexpected(\Throwable $exception): string
    {
        Log::warning('Votifier Tester could not send a vote.', ['exception' => $exception]);

        return 'The vote could not be sent. Check the details and try again.';
    }
}
