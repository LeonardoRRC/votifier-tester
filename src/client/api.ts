import { http } from '@pterodactyl/sdk';

export type Protocol = 'votifier' | 'nuvotifier' | 'nuvotifier-v2';

export interface VotePayload {
    protocol: Protocol;
    host: string;
    port: number;
    username: string;
    public_key?: string;
    token?: string;
}

export interface VoteResult {
    success: boolean;
    message: string;
    protocol: Protocol;
    host: string;
    port: number;
    username: string;
    latency_ms: number;
}

export async function sendVote(server: string, payload: VotePayload): Promise<VoteResult> {
    const { data } = await http.post<VoteResult>(
        `/api/client/servers/${server}/extensions/votifier-tester/vote`,
        payload,
    );

    return data;
}
