import { useState } from 'react';
import {
  ArchiveIcon,
  BellIcon,
  CheckIcon,
  MailPlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  XIcon,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  normalizeEmailDeliveryFailure,
  useAccessibleSpacesQuery,
  useLeaveSharedSpaceMutation,
} from '@/shared/api';
import { useAppSession } from '@/shared/session';

import {
  useCancelInvitationMutation,
  useCreateInvitationMutation,
  useAcceptInvitationMutation,
  useDeclineInvitationMutation,
  useInvitationsQuery,
  useResendInvitationMutation,
  useRetryInvitationMutation,
} from './invitation-queries';
import { usePublicInvitationQuery } from './public-invitation-queries';
import type { Invitation, PublicInvitation } from './invitations-service';
import type { SpaceNotification } from './space-notification';
import {
  useMarkSpaceNotificationReadMutation,
  useRetrySpaceNotificationMutation,
  useSpaceNotificationsQuery,
} from './space-notification-queries';

function SharingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const invitationToken = searchParams.get('invitationToken') ?? '';
  const selectedSpaceId = searchParams.get('spaceId');
  const invitationsQuery = useInvitationsQuery();
  const spacesQuery = useAccessibleSpacesQuery(true);
  const notificationsQuery = useSpaceNotificationsQuery();
  const invitationContextQuery = usePublicInvitationQuery(invitationToken);
  const createMutation = useCreateInvitationMutation();
  const acceptMutation = useAcceptInvitationMutation();
  const cancelMutation = useCancelInvitationMutation();
  const resendMutation = useResendInvitationMutation();
  const retryMutation = useRetryInvitationMutation();
  const declineMutation = useDeclineInvitationMutation();
  const selectedSpace = spacesQuery.data?.find(
    (space) => space.id === selectedSpaceId,
  );
  const sharedSpaceForLeaving = selectedSpaceId
    ? selectedSpace
    : spacesQuery.data?.find(
        (space) =>
          space.kind === 'shared' &&
          space.status === 'active' &&
          space.accessLevel === 'write',
      );
  const canEndSharing =
    sharedSpaceForLeaving?.kind === 'shared' &&
    sharedSpaceForLeaving.status === 'active' &&
    sharedSpaceForLeaving.accessLevel === 'write';
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
  const focusedInvitation = invitationContextQuery.data
    ? inbox.incoming.find((item) => item.id === invitationContextQuery.data?.id)
    : undefined;
  const isMutating =
    createMutation.isPending ||
    cancelMutation.isPending ||
    resendMutation.isPending ||
    retryMutation.isPending ||
    acceptMutation.isPending ||
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

      <NotificationsPanel query={notificationsQuery} />

      {canEndSharing && (
        <LeaveSharedSpaceCard
          spaceId={sharedSpaceForLeaving.id}
          onArchived={() => navigate('/sharing')}
        />
      )}

      {invitationToken && (
        <InvitationContinuationCard
          query={invitationContextQuery}
          matchingInvitation={focusedInvitation}
        />
      )}

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
                error={
                  acceptMutation.variables === invitation.id
                    ? acceptMutation.error
                    : null
                }
                confirming={confirmingDeclineId === invitation.id}
                onAccept={() => acceptMutation.mutate(invitation.id)}
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

function NotificationsPanel({
  query,
}: {
  readonly query: ReturnType<typeof useSpaceNotificationsQuery>;
}) {
  const retryMutation = useRetrySpaceNotificationMutation();
  const readMutation = useMarkSpaceNotificationReadMutation();

  if (query.isPending) return null;
  if (query.isError) {
    return (
      <Alert variant="destructive" className="mb-5">
        <AlertTitle>Notifications unavailable</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
      </Alert>
    );
  }
  if (query.data.length === 0) return null;

  return (
    <Card variant="muted" className="mb-5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BellIcon aria-hidden="true" className="size-4" />
          <CardTitle>Notifications</CardTitle>
        </div>
        <CardDescription>Important changes to your Shared Spaces.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.data.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onRetry={() => retryMutation.mutate(notification.id)}
            onRead={() => readMutation.mutate(notification.id)}
            disabled={retryMutation.isPending || readMutation.isPending}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function NotificationRow({
  notification,
  onRetry,
  onRead,
  disabled,
}: {
  readonly notification: SpaceNotification;
  readonly onRetry: () => void;
  readonly onRead: () => void;
  readonly disabled: boolean;
}) {
  const emailDeliveryError = normalizeEmailDeliveryFailure(
    notification.emailDeliveryError,
  );

  return (
    <div className="border border-border p-3 text-sm">
      <p className="font-semibold">{notification.title}</p>
      <p className="mt-1 text-muted-foreground">{notification.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Email: {notification.emailDeliveryStatus}
        </span>
        {emailDeliveryError && (
          <Alert variant="destructive" className="basis-full mt-1">
            <AlertTitle>Could not deliver this email</AlertTitle>
            <AlertDescription>{emailDeliveryError}</AlertDescription>
          </Alert>
        )}
        {notification.emailDeliveryStatus === 'failed' && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={disabled}>
            <RotateCcwIcon aria-hidden="true" /> Retry email
          </Button>
        )}
        {!notification.readAt && (
          <Button type="button" size="sm" variant="ghost" onClick={onRead} disabled={disabled}>
            Mark read
          </Button>
        )}
      </div>
    </div>
  );
}

function LeaveSharedSpaceCard({
  spaceId,
  onArchived,
}: {
  readonly spaceId: string;
  readonly onArchived: () => void;
}) {
  const leaveMutation = useLeaveSharedSpaceMutation();
  const [open, setOpen] = useState(false);

  return (
    <Card variant="strong" className="mb-5 border-destructive/60">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ArchiveIcon aria-hidden="true" className="size-4" />
          <CardTitle>End sharing</CardTitle>
        </div>
        <CardDescription>
          Permanently archive this Shared Space when you are finished sharing.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
          End sharing
        </Button>
      </CardFooter>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!leaveMutation.isPending) {
            leaveMutation.reset();
            setOpen(nextOpen);
          }
        }}
      >
        <DialogContent closeButtonDisabled={leaveMutation.isPending}>
          <DialogHeader>
            <DialogTitle>End sharing and archive this Space?</DialogTitle>
            <DialogDescription>
              Both members will lose editing access. The Shared Space will be
              permanently archived as read-only history for both former
              members and cannot be reopened.
            </DialogDescription>
          </DialogHeader>
          {leaveMutation.error && (
            <Alert variant="destructive" className="m-5">
              <AlertTitle>Shared Space could not be archived</AlertTitle>
              <AlertDescription>{leaveMutation.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={leaveMutation.isPending}
            >
              Keep sharing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                leaveMutation.mutate(spaceId, {
                  onSuccess: () => {
                    setOpen(false);
                    onArchived();
                  },
                })
              }
              disabled={leaveMutation.isPending}
            >
              {leaveMutation.isPending ? 'Archiving…' : 'Confirm archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface InvitationContinuationCardProps {
  readonly query: ReturnType<typeof usePublicInvitationQuery>;
  readonly matchingInvitation: Invitation | undefined;
}

function InvitationContinuationCard({
  query,
  matchingInvitation,
}: InvitationContinuationCardProps) {
  const { openUserProfile } = useAppSession();

  if (query.isPending) {
    return <FeatureDataLoading label="Loading invitation context" />;
  }

  if (query.isError || !query.data) {
    return (
      <Alert variant="destructive" className="mb-5">
        <AlertTitle>Invitation context unavailable</AlertTitle>
        <AlertDescription>
          {query.error instanceof Error
            ? query.error.message
            : 'This invitation link is no longer available.'}
        </AlertDescription>
      </Alert>
    );
  }

  const invitation = query.data;
  if (invitation.status === 'pending' && matchingInvitation) {
    return (
      <Alert className="mb-5" role="status">
        <AlertTitle>Invitation ready for your decision</AlertTitle>
        <AlertDescription>
          Review the invitation from {invitation.senderName} below. Accepting
          is the only action that creates a Shared Space.
        </AlertDescription>
      </Alert>
    );
  }

  if (invitation.status === 'pending') {
    return (
      <Card variant="strong" className="mb-5">
        <CardHeader>
          <CardTitle>Verify the invited email before accepting</CardTitle>
          <CardDescription>
            This invitation is addressed to {invitation.recipientEmail}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Add and verify that address in your Clerk profile, including as a
            secondary email if you registered with another address. Return
            here and refresh this page; the invitation will appear only when
            the verified identity matches it.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void openUserProfile()}
          >
            Manage verified email addresses
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Alert className="mb-5" role="status">
      <AlertTitle>Invitation {invitationStatusLabel(invitation.status)}</AlertTitle>
      <AlertDescription>
        This invitation from {invitation.senderName} is no longer actionable.
        Your Personal Space remains available.
      </AlertDescription>
    </Alert>
  );
}

function invitationStatusLabel(status: PublicInvitation['status']): string {
  switch (status) {
    case 'accepted':
      return 'already accepted';
    case 'canceled':
      return 'canceled';
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    case 'pending':
      return 'pending';
  }
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
  const deliveryError = normalizeEmailDeliveryFailure(
    invitation.deliveryError,
  );
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
        {deliveryError && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Could not deliver this email</AlertTitle>
            <AlertDescription>{deliveryError}</AlertDescription>
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
  readonly error: Error | null;
  readonly confirming: boolean;
  readonly onAccept: () => void;
  readonly onConfirm: () => void;
  readonly onStartConfirm: () => void;
  readonly onCancelConfirm: () => void;
}

function IncomingInvitationCard({
  invitation,
  disabled,
  error,
  confirming,
  onAccept,
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
        <p className="mt-2 text-muted-foreground">
          Accepting creates a separate Shared Space with {invitation.senderName ?? 'the inviter'}.
          Your Personal Space stays private, and the new Shared Space starts with Default Categories but no Transactions, Budgets, or learned Category Rules.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Expires {new Date(invitation.expiresAt).toLocaleDateString()}
        </p>
        {error && <p className="mt-2 text-sm text-destructive" role="alert">{error.message}</p>}
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
          <>
            <Button type="button" size="sm" onClick={onAccept} disabled={disabled}>
              <CheckIcon aria-hidden="true" /> Accept invitation
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onStartConfirm} disabled={disabled}>
              Decline
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

export { SharingPage };
