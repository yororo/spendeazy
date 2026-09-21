import { useState } from 'react';
import { MailPlusIcon, RefreshCwIcon, RotateCcwIcon, XIcon } from 'lucide-react';

import {
  FeatureDataEmpty,
  FeatureDataError,
  FeatureDataLoading,
} from '@/components/app/feature-data-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  useCancelInvitationMutation,
  useCreateInvitationMutation,
  useDeclineInvitationMutation,
  useInvitationsQuery,
  useResendInvitationMutation,
  useRetryInvitationMutation,
} from './invitation-queries';
import type { Invitation } from './invitations-service';

function SharingPage() {
  const invitationsQuery = useInvitationsQuery();
  const createMutation = useCreateInvitationMutation();
  const cancelMutation = useCancelInvitationMutation();
  const resendMutation = useResendInvitationMutation();
  const retryMutation = useRetryInvitationMutation();
  const declineMutation = useDeclineInvitationMutation();
  const [email, setEmail] = useState('');
  const [confirmingDeclineId, setConfirmingDeclineId] = useState<string | null>(null);

  if (invitationsQuery.isPending) return <FeatureDataLoading label="Loading invitations" />;
  if (invitationsQuery.isError) {
    return (
      <FeatureDataError
        message={invitationsQuery.error.message}
        onRetry={() => void invitationsQuery.refetch()}
      />
    );
  }

  const inbox = invitationsQuery.data;
  const outgoing = inbox.outgoing;
  const isMutating =
    createMutation.isPending ||
    cancelMutation.isPending ||
    resendMutation.isPending ||
    retryMutation.isPending ||
    declineMutation.isPending;

  function submitInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    createMutation.mutate(email.trim(), {
      onSuccess: () => setEmail(''),
    });
  }

  return (
    <div className="mx-auto w-full max-w-screen-lg px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 border-b border-foreground pb-5">
        <p className="text-label text-muted-foreground">Shared Space</p>
        <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          Invite someone you trust
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Invitations do not grant access or reserve membership. The recipient
          must make an explicit decision before a Shared Space can be created.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card variant="strong">
          <CardHeader>
            <CardTitle>Send an invitation</CardTitle>
            <CardDescription>
              Delivery responses are the same for registered and unregistered email addresses.
            </CardDescription>
          </CardHeader>
          <form onSubmit={submitInvitation}>
            <CardContent className="space-y-3">
              <Label htmlFor="invitation-email">Recipient email</Label>
              <Input
                id="invitation-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="partner@example.com"
                disabled={isMutating}
                required
              />
              {createMutation.isError && (
                <p className="text-sm text-destructive" role="alert">
                  {createMutation.error.message}
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isMutating || !email.trim()}>
                <MailPlusIcon aria-hidden="true" />
                Send invitation
              </Button>
            </CardFooter>
          </form>
        </Card>

        {outgoing ? (
          <OutgoingInvitationCard
            invitation={outgoing}
            disabled={isMutating}
            onCancel={() => cancelMutation.mutate(outgoing.id)}
            onResend={() => resendMutation.mutate(outgoing.id)}
            onRetry={() => retryMutation.mutate(outgoing.id)}
            error={cancelMutation.error ?? resendMutation.error ?? retryMutation.error}
          />
        ) : (
          <FeatureDataEmpty
            title="No outgoing invitation"
            description="You can keep multiple incoming invitations, but only one outgoing invitation may be pending at a time."
          />
        )}
      </div>

      <section className="mt-5" aria-labelledby="incoming-invitations-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-label text-muted-foreground">Inbox</p>
            <h2 id="incoming-invitations-heading" className="mt-1 font-mono text-lg font-bold">
              Incoming invitations
            </h2>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {inbox.incoming.length} pending
          </span>
        </div>
        {inbox.incoming.length === 0 ? (
          <FeatureDataEmpty
            title="Your inbox is clear"
            description="Pending invitations addressed to your verified email will appear here."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {inbox.incoming.map((invitation) => (
              <IncomingInvitationCard
                key={invitation.id}
                invitation={invitation}
                disabled={isMutating}
                confirming={confirmingDeclineId === invitation.id}
                onConfirm={() => declineMutation.mutate(invitation.id, {
                  onSuccess: () => setConfirmingDeclineId(null),
                })}
                onStartConfirm={() => setConfirmingDeclineId(invitation.id)}
                onCancelConfirm={() => setConfirmingDeclineId(null)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface OutgoingInvitationCardProps {
  readonly invitation: Invitation;
  readonly disabled: boolean;
  readonly error: Error | null;
  readonly onCancel: () => void;
  readonly onResend: () => void;
  readonly onRetry: () => void;
}

function OutgoingInvitationCard({
  invitation,
  disabled,
  error,
  onCancel,
  onResend,
  onRetry,
}: OutgoingInvitationCardProps) {
  const deliveryLabel =
    invitation.deliveryStatus === 'failed'
      ? 'Delivery failed'
      : invitation.deliveryStatus === 'sent'
        ? 'Email sent'
        : 'Sending email';
  return (
    <Card variant="muted">
      <CardHeader>
        <CardTitle>Outgoing invitation</CardTitle>
        <CardDescription>{invitation.recipientEmail}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <span className="font-semibold">Status:</span> {invitation.status}
        </p>
        <p>
          <span className="font-semibold">Delivery:</span> {deliveryLabel}
        </p>
        {invitation.deliveryError && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Could not deliver this email</AlertTitle>
            <AlertDescription>{invitation.deliveryError}</AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          Expires {new Date(invitation.expiresAt).toLocaleDateString()}
        </p>
        {error && <p className="text-sm text-destructive" role="alert">{error.message}</p>}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        {invitation.deliveryStatus === 'failed' ? (
          <Button type="button" size="sm" onClick={onRetry} disabled={disabled}>
            <RotateCcwIcon aria-hidden="true" /> Retry delivery
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={onResend} disabled={disabled}>
            <RefreshCwIcon aria-hidden="true" /> Resend
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={disabled}>
          <XIcon aria-hidden="true" /> Cancel
        </Button>
      </CardFooter>
    </Card>
  );
}

interface IncomingInvitationCardProps {
  readonly invitation: Invitation;
  readonly disabled: boolean;
  readonly confirming: boolean;
  readonly onConfirm: () => void;
  readonly onStartConfirm: () => void;
  readonly onCancelConfirm: () => void;
}

function IncomingInvitationCard({
  invitation,
  disabled,
  confirming,
  onConfirm,
  onStartConfirm,
  onCancelConfirm,
}: IncomingInvitationCardProps) {
  return (
    <Card variant="strong">
      <CardHeader>
        <CardTitle>{invitation.senderName ?? 'A Spendeazy User'} invited you</CardTitle>
        <CardDescription>Shared Space invitation</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        <p>
          This invitation is addressed to <span className="font-semibold">{invitation.recipientEmail}</span>.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Expires {new Date(invitation.expiresAt).toLocaleDateString()}
        </p>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        {confirming ? (
          <>
            <Button type="button" size="sm" variant="destructive" onClick={onConfirm} disabled={disabled}>
              Confirm decline
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancelConfirm} disabled={disabled}>
              Keep invitation
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={onStartConfirm} disabled={disabled}>
            Decline
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export { SharingPage };
