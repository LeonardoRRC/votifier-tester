import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
    Alert,
    Form,
    Label,
    NamedIcon,
    Select,
    ServerContentBlock,
    Table,
    TitledGreyBox,
    httpErrorToHuman,
    toast,
    useAppForm,
    useCurrentServerRequired,
    type SdkServer,
    type SelectOption,
} from '@pterodactyl/sdk';
import { sendVote, type Protocol, type VotePayload, type VoteResult } from '../api';
import { restrictToAllocations, serviceName } from '../config';

const PROTOCOLS: { value: Protocol; label: string; description: string }[] = [
    { value: 'votifier', label: 'Votifier', description: 'Classic plugin, RSA public key.' },
    { value: 'nuvotifier', label: 'NuVotifier v1', description: 'Most vote sites, RSA public key.' },
    { value: 'nuvotifier-v2', label: 'NuVotifier v2', description: 'Token-based protocol.' },
];

const PROTOCOL_LABELS = Object.fromEntries(PROTOCOLS.map((p) => [p.value, p.label])) as Record<Protocol, string>;

interface Values {
    protocol: Protocol;
    allocation: string;
    host: string;
    port: string;
    username: string;
    public_key: string;
    token: string;
}

interface HistoryEntry extends VoteResult {
    id: number;
    time: string;
}

interface AllocationOption {
    value: string;
    host: string;
    port: number;
    label: string;
}

/** The server's allocations as host:port choices, preferring aliases over raw IPs. */
function allocationOptions(server: SdkServer): AllocationOption[] {
    const relation = server.attributes.relationships?.allocations;
    const list = relation && 'data' in relation && Array.isArray(relation.data) ? relation.data : [];

    return list.map(({ attributes: a }) => {
        const host = a.ip_alias || (a.ip === '0.0.0.0' || a.ip === '::' ? server.attributes.sftp_details.ip : a.ip);

        return {
            value: `${host}:${a.port}`,
            host,
            port: a.port,
            label: `${host}:${a.port}${a.notes ? ` · ${a.notes}` : ''}${a.is_default ? ' · primary' : ''}`,
        };
    });
}

function validate(values: Values, restricted: boolean): Partial<Record<keyof Values, string>> {
    const errors: Partial<Record<keyof Values, string>> = {};
    const port = Number(values.port);

    if (restricted) {
        if (!values.allocation) errors.allocation = 'Choose the allocation Votifier listens on.';
    } else {
        if (!values.host.trim()) errors.host = 'Enter the address of the Votifier listener.';
        if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = 'Enter a port from 1 to 65535.';
    }

    if (!/^[A-Za-z0-9_]{1,16}$/.test(values.username)) {
        errors.username = 'Use 1 to 16 letters, numbers, or underscores.';
    }

    if (values.protocol === 'nuvotifier-v2') {
        if (!values.token.trim()) errors.token = 'Paste the token from config.yml.';
    } else if (!values.public_key.trim()) {
        errors.public_key = 'Paste the contents of rsa/public.key.';
    }

    return errors;
}

function ProtocolPicker({ value, onChange }: { value: Protocol; onChange: (value: Protocol) => void }) {
    return (
        <div role={'radiogroup'} aria-label={'Protocol'} className={'vt:grid vt:gap-3 vt:sm:grid-cols-3'}>
            {PROTOCOLS.map((protocol) => {
                const selected = protocol.value === value;

                return (
                    <button
                        key={protocol.value}
                        type={'button'}
                        role={'radio'}
                        aria-checked={selected}
                        onClick={() => onChange(protocol.value)}
                        className={[
                            'vt:flex vt:flex-col vt:gap-1 vt:rounded-md vt:border vt:p-3 vt:text-left vt:transition-colors',
                            'vt:focus-visible:outline-none vt:focus-visible:ring-2 vt:focus-visible:ring-ring',
                            selected
                                ? 'vt:border-primary vt:bg-primary/10'
                                : 'vt:border-border vt:bg-card vt:hover:bg-muted',
                        ].join(' ')}
                    >
                        <span className={'vt:flex vt:items-center vt:gap-2 vt:text-sm vt:font-medium vt:text-foreground'}>
                            <span
                                className={[
                                    'vt:size-3 vt:shrink-0 vt:rounded-full vt:border-2',
                                    selected ? 'vt:border-primary vt:bg-primary' : 'vt:border-muted-foreground',
                                ].join(' ')}
                            />
                            {protocol.label}
                        </span>
                        <span className={'vt:text-xs vt:text-muted-foreground'}>{protocol.description}</span>
                    </button>
                );
            })}
        </div>
    );
}

function Code({ children }: { children: string }) {
    return (
        <code className={'vt:rounded-sm vt:bg-muted vt:px-1.5 vt:py-0.5 vt:font-mono vt:text-xs vt:text-foreground'}>
            {children}
        </code>
    );
}

function StatusBadge({ success }: { success: boolean }) {
    return (
        <span
            className={[
                'vt:inline-flex vt:items-center vt:rounded-full vt:px-2 vt:py-0.5 vt:text-xs vt:font-medium',
                success ? 'vt:bg-success/15 vt:text-success' : 'vt:bg-destructive/15 vt:text-destructive',
            ].join(' ')}
        >
            {success ? 'Delivered' : 'Failed'}
        </span>
    );
}

function BoxTitle({ icon, children }: { icon: string; children: string }) {
    return (
        <span className={'vt:flex vt:items-center vt:gap-2'}>
            <NamedIcon name={icon} className={'vt:size-4'} />
            {children}
        </span>
    );
}

export default function VotifierScreen() {
    const server = useCurrentServerRequired();
    const identifier = server.attributes.identifier;
    const restricted = restrictToAllocations();
    const allocations = useMemo(() => allocationOptions(server), [server]);
    const [result, setResult] = useState<VoteResult | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [quickFill, setQuickFill] = useState<string | null>(null);

    const mutation = useMutation({ mutationFn: (payload: VotePayload) => sendVote(identifier, payload) });

    const form = useAppForm({
        defaultValues: {
            protocol: 'nuvotifier',
            allocation: '',
            host: '',
            port: '',
            username: '',
            public_key: '',
            token: '',
        } as Values,
        validators: {
            onSubmit: ({ value }) => {
                const fields = validate(value, restricted);

                return Object.keys(fields).length > 0 ? { fields } : undefined;
            },
        },
        onSubmit: async ({ value }) => {
            const target = restricted ? allocations.find((a) => a.value === value.allocation) : undefined;
            const payload: VotePayload = {
                protocol: value.protocol,
                host: target ? target.host : value.host.trim(),
                port: target ? target.port : Number(value.port),
                username: value.username,
                ...(value.protocol === 'nuvotifier-v2' ? { token: value.token } : { public_key: value.public_key }),
            };

            try {
                const response = await mutation.mutateAsync(payload);
                setResult(response);
                setHistory((entries) =>
                    [{ ...response, id: Date.now(), time: new Date().toLocaleTimeString() }, ...entries].slice(0, 10),
                );
                if (response.success) {
                    toast.success('Test vote delivered.');
                } else {
                    toast.error('The test vote was not delivered.');
                }
            } catch (error) {
                setResult(null);
                toast.error(httpErrorToHuman(error));
            }
        },
    });

    const fillFromAllocation = (value: string | number) => {
        const allocation = allocations.find((a) => a.value === value);
        if (!allocation) return;

        setQuickFill(allocation.value);
        form.setFieldValue('host', allocation.host);
        form.setFieldValue('port', String(allocation.port));
    };

    const allocationSelectOptions: SelectOption[] = allocations.map((a) => ({ value: a.value, label: a.label }));

    return (
        <ServerContentBlock title={'Votifier Tester'}>
            <div className={'vt:grid vt:items-start vt:gap-6 vt:lg:grid-cols-3'}>
                <div className={'vt:flex vt:flex-col vt:gap-6 vt:lg:col-span-2'}>
                    {result && (
                        <Alert
                            type={result.success ? 'success' : 'danger'}
                            title={result.success ? 'Vote delivered' : 'Vote not delivered'}
                        >
                            {result.message}{' '}
                            <span className={'vt:text-muted-foreground'}>({result.latency_ms} ms)</span>
                        </Alert>
                    )}

                    <TitledGreyBox title={<BoxTitle icon={'send'}>Send a test vote</BoxTitle>}>
                        <Form form={form} className={'vt:m-0 vt:flex vt:flex-col vt:gap-6'}>
                            <div className={'vt:flex vt:flex-col vt:gap-2'}>
                                <Label>Protocol</Label>
                                <form.Field name={'protocol'}>
                                    {(field) => (
                                        <ProtocolPicker value={field.state.value} onChange={field.handleChange} />
                                    )}
                                </form.Field>
                            </div>

                            {restricted ? (
                                <form.AppField name={'allocation'}>
                                    {(field) => (
                                        <field.SelectField
                                            label={'Votifier address'}
                                            description={'The allocation the Votifier listener is bound to. Its port is set in plugins/Votifier/config.yml.'}
                                            placeholder={allocations.length ? 'Choose an allocation' : 'This server has no allocations'}
                                            options={allocationSelectOptions}
                                            disabled={allocations.length === 0}
                                        />
                                    )}
                                </form.AppField>
                            ) : (
                                <div className={'vt:flex vt:flex-col vt:gap-4'}>
                                    {allocations.length > 0 && (
                                        <div className={'vt:flex vt:flex-col vt:gap-2'}>
                                            <Label htmlFor={'vt-quick-fill'}>Fill from an allocation</Label>
                                            <Select
                                                id={'vt-quick-fill'}
                                                value={quickFill}
                                                placeholder={'Choose one of this server\'s allocations'}
                                                options={allocationSelectOptions}
                                                onChange={fillFromAllocation}
                                            />
                                        </div>
                                    )}
                                    <div className={'vt:grid vt:gap-4 vt:sm:grid-cols-3'}>
                                        <div className={'vt:sm:col-span-2'}>
                                            <form.AppField name={'host'}>
                                                {(field) => (
                                                    <field.TextField
                                                        label={'Host'}
                                                        placeholder={'play.example.com'}
                                                        autoComplete={'off'}
                                                    />
                                                )}
                                            </form.AppField>
                                        </div>
                                        <form.AppField name={'port'}>
                                            {(field) => (
                                                <field.TextField label={'Port'} placeholder={'8192'} inputMode={'numeric'} />
                                            )}
                                        </form.AppField>
                                    </div>
                                </div>
                            )}

                            <form.AppField name={'username'}>
                                {(field) => (
                                    <field.TextField
                                        label={'Username'}
                                        description={'The player who receives the vote.'}
                                        placeholder={'Notch'}
                                        maxLength={16}
                                        autoComplete={'off'}
                                    />
                                )}
                            </form.AppField>

                            <form.Subscribe selector={(state) => state.values.protocol}>
                                {(protocol) =>
                                    protocol === 'nuvotifier-v2' ? (
                                        <form.AppField name={'token'}>
                                            {(field) => (
                                                <field.TextField
                                                    label={'Token'}
                                                    description={'The token from plugins/Votifier/config.yml.'}
                                                    className={'vt:font-mono'}
                                                    autoComplete={'off'}
                                                    spellCheck={false}
                                                />
                                            )}
                                        </form.AppField>
                                    ) : (
                                        <form.AppField name={'public_key'}>
                                            {(field) => (
                                                <field.TextAreaField
                                                    label={'Public key'}
                                                    description={'The contents of plugins/Votifier/rsa/public.key. PEM headers are optional.'}
                                                    rows={4}
                                                    className={'vt:font-mono vt:text-xs'}
                                                    spellCheck={false}
                                                />
                                            )}
                                        </form.AppField>
                                    )
                                }
                            </form.Subscribe>

                            <div
                                className={
                                    'vt:flex vt:flex-col-reverse vt:gap-3 vt:sm:flex-row vt:sm:items-center vt:sm:justify-between'
                                }
                            >
                                <p className={'vt:text-xs vt:text-muted-foreground'}>
                                    Sent as service <span className={'vt:font-medium vt:text-foreground'}>{serviceName()}</span>.
                                </p>
                                <form.AppForm>
                                    <form.SubmitButton>Send test vote</form.SubmitButton>
                                </form.AppForm>
                            </div>
                        </Form>
                    </TitledGreyBox>

                    <TitledGreyBox title={<BoxTitle icon={'history'}>Recent tests</BoxTitle>}>
                        <Table
                            rows={history}
                            keyOf={(row) => String(row.id)}
                            emptyState={'Votes you send from this page appear here.'}
                            columns={[
                                { id: 'time', label: 'Time', cell: (row) => row.time },
                                { id: 'target', label: 'Target', cell: (row) => `${row.host}:${row.port}` },
                                { id: 'username', label: 'Username', cell: (row) => row.username },
                                { id: 'protocol', label: 'Protocol', cell: (row) => PROTOCOL_LABELS[row.protocol] },
                                { id: 'status', label: 'Result', cell: (row) => <StatusBadge success={row.success} /> },
                                { id: 'latency', label: 'Time taken', cell: (row) => `${row.latency_ms} ms` },
                            ]}
                        />
                    </TitledGreyBox>
                </div>

                <TitledGreyBox title={<BoxTitle icon={'info'}>How it works</BoxTitle>}>
                    <div className={'vt:flex vt:flex-col vt:gap-4 vt:text-sm vt:text-muted-foreground'}>
                        <p>
                            The Panel sends a vote to your Votifier listener, like a vote site would, so you can check
                            rewards without voting for real.
                        </p>
                        <ol className={'vt:flex vt:list-decimal vt:flex-col vt:gap-3 vt:pl-5'}>
                            <li>
                                Make sure the Votifier <span className={'vt:text-foreground'}>port</span> in{' '}
                                <Code>plugins/Votifier/config.yml</Code> is one of this server&apos;s allocations.
                            </li>
                            <li>
                                For Votifier and NuVotifier v1, copy the key from <Code>plugins/Votifier/rsa/public.key</Code>.
                            </li>
                            <li>
                                For NuVotifier v2, copy the <Code>default</Code> token from the <Code>tokens</Code> section
                                of <Code>config.yml</Code>.
                            </li>
                            <li>Enter an online player&apos;s name and send the vote.</li>
                        </ol>
                        {restricted && (
                            <p className={'vt:rounded-md vt:border vt:border-border vt:bg-muted vt:p-3 vt:text-xs'}>
                                Votes can only be sent to this server&apos;s own allocations.
                            </p>
                        )}
                        <div className={'vt:flex vt:flex-col vt:gap-1.5 vt:border-t vt:border-border vt:pt-4'}>
                            <a
                                href={'https://www.spigotmc.org/resources/nuvotifier.13449/'}
                                target={'_blank'}
                                rel={'noopener noreferrer'}
                                className={'vt:inline-flex vt:items-center vt:gap-1.5 vt:text-accent vt:hover:underline'}
                            >
                                <NamedIcon name={'external-link'} className={'vt:size-3.5'} />
                                NuVotifier on SpigotMC
                            </a>
                            <a
                                href={'https://github.com/NuVotifier/NuVotifier/wiki/Setup-Guide'}
                                target={'_blank'}
                                rel={'noopener noreferrer'}
                                className={'vt:inline-flex vt:items-center vt:gap-1.5 vt:text-accent vt:hover:underline'}
                            >
                                <NamedIcon name={'external-link'} className={'vt:size-3.5'} />
                                NuVotifier setup guide
                            </a>
                        </div>
                    </div>
                </TitledGreyBox>
            </div>
        </ServerContentBlock>
    );
}
