import type { ExtensionConfig } from '@pterodactyl/sdk';

let config: ExtensionConfig = {};

export function setConfig(value: ExtensionConfig): void {
    config = value;
}

/** Whether votes may only target the server's own allocations. Defaults to the safe choice. */
export function restrictToAllocations(): boolean {
    return config.restrict_to_allocations !== false;
}

export function serviceName(): string {
    return typeof config.service_name === 'string' && config.service_name !== '' ? config.service_name : 'Votifier Tester';
}
