<?php

namespace UK\TheQuantum\VotifierTester;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class VotifierTesterProvider extends ExtensionProvider
{
    public function boot(): void
    {
        // POST /api/client/servers/{server}/extensions/votifier-tester/vote
        $this->registerApiRoutes();

        $this->registerPermissions('Send test votes with the Votifier Tester.', [
            'send' => 'Allows a user to send test votes to a Votifier or NuVotifier listener.',
        ]);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make('restrict_to_allocations', 'restrict_to_allocations', true, ['required', 'boolean'])
                ->label('Only allow the server\'s own allocations')
                ->help('When enabled, votes can only be sent to an IP and port assigned to the server. Disable it to let users test any public Votifier listener.')
                ->field('toggle')
                ->frontend()
                ->frontendType('boolean'),
            ExtensionSettingDefinition::make('service_name', 'service_name', 'Votifier Tester', ['required', 'string', 'max:64'])
                ->label('Service name')
                ->help('The vote site name sent with every test vote. NuVotifier v2 uses it to choose the token.')
                ->field('text')
                ->frontend()
                ->frontendType('string'),
            ExtensionSettingDefinition::make('timeout', 'timeout', 5, ['required', 'integer', 'min:1', 'max:30'])
                ->label('Timeout (seconds)')
                ->help('How long to wait for the Votifier listener to answer.')
                ->field('number'),
            ExtensionSettingDefinition::make('rate_limit', 'rate_limit', 10, ['required', 'integer', 'min:1', 'max:120'])
                ->label('Votes per minute')
                ->help('The most test votes a user can send to one server each minute.')
                ->field('number'),
        ]));
    }
}
