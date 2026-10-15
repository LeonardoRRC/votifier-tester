import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createExtensionTestHost, createTestServer } from '@pterodactyl/sdk/testing';
import { setConfig } from '../config';
import VotifierScreen from './VotifierScreen';

vi.mock('../api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../api')>()),
    sendVote: vi.fn(),
}));

let host: ReturnType<typeof createExtensionTestHost> | undefined;
afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
    setConfig({});
});

function renderScreen() {
    host = createExtensionTestHost({
        extensionId: 'votifier-tester',
        prefix: 'vt',
        server: createTestServer({ owner: false, permissions: ['ext.votifier-tester.send'] }),
    });
    render(<VotifierScreen />, { wrapper: host.Wrapper });
}

test('asks for a public key by default and a token for NuVotifier v2', async () => {
    renderScreen();

    expect(await screen.findByText('Send a test vote')).toBeTruthy();
    expect(screen.getByLabelText('Public key')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: /NuVotifier v2/ }));

    expect(await screen.findByLabelText('Token')).toBeTruthy();
    expect(screen.queryByLabelText('Public key')).toBeNull();
});

test('lets users type any host when allocations are not enforced', async () => {
    setConfig({ restrict_to_allocations: false, service_name: 'TestList' });
    renderScreen();

    expect(await screen.findByLabelText('Host')).toBeTruthy();
    expect(screen.getByLabelText('Port')).toBeTruthy();
    expect(screen.getByText('TestList')).toBeTruthy();
});
