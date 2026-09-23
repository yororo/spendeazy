import { useState } from 'react';
import {
  ArchiveIcon,
  BellIcon,
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
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

import {
  useCreateInvitationMutation,
  useInvitationsQuery,
} from './invitation-queries';
import type { OutgoingInvitation } from './invitations-service';
import type { SpaceNotification } from './space-notification';
import {
  useMarkSpaceNotificationReadMutation,
  useRetrySpaceNotificationMutation,
  useSpaceNotificationsQuery,
} from './space-notification-queries';

function SharingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedSpaceId = searchParams.get('spaceId');
  const invitationsQuery = useInvitationsQuery();
  const createMutation = useCreateInvitationMutation();
  const spacesQuery = useAccessibleSpacesQuery(true);
  const notificationsQuery = useSpaceNotificationsQuery();
  const [copyState, setCopyState] = useState<CopyState>('idle');
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
  const activeSharedSpace = spacesQuery.data?.find(
    (space) => space.kind === 'shared' && space.status === 'active',
  );

  if (invitationsQuery.isPending) {
    return <FeatureDataLoading label="Loading Invite Codes" />;
  }
  if (invitationsQuery.isError) {
    return (
      <FeatureDataError
        message={invitationsQuery.error.message}
        onRetry={() => void invitationsQuery.refetch()}
      />
    );
  }

  const outgoing = invitationsQuery.data.outgoing;

  async function copyInviteCode(code: string): Promise<void> {
    setCopyState('copying');
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable');
      }
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="mx-auto w-full max-w-screen-lg px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 border-b border-foreground pb-5">
        <p className="text-label text-muted-foreground">Shared Space</p>
        <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          Invite someone you trust
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Share a seven-day Invite Code directly. Entering a code will never
          change membership without a separate explicit join action.
        </p>
      </header>

      <NotificationsPanel query={notificationsQuery} />

      {canEndSharing && (
        <LeaveSharedSpaceCard
          spaceId={sharedSpaceForLeaving.id}
          onArchived={() => navigate('/sharing')}
        />
      )}

      <InviteCodeCard
        outgoing={outgoing}
        ineligible={activeSharedSpace !== undefined}
        disabled={createMutation.isPending}
        error={createMutation.error}
        copyState={copyState}
        onCreate={() => createMutation.mutate(undefined)}
        onCopy={copyInviteCode}
      />
    </div>
  );
}

type CopyState = 'idle' | 'copying' | 'copied' | 'failed';

function InviteCodeCard({
  outgoing,
  ineligible,
  disabled,
  error,
  copyState,
  onCreate,
  onCopy,
}: {
  readonly outgoing: OutgoingInvitation | null;
  readonly ineligible: boolean;
  readonly disabled: boolean;
  readonly error: Error | null;
  readonly copyState: CopyState;
  readonly onCreate: () => void;
  readonly onCopy: (code: string) => Promise<void>;
}) {
  if (ineligible && !outgoing) {
    return (
      <Card variant="strong">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRoundIcon aria-hidden="true" className="size-4" />
            <CardTitle>You already belong to an active Shared Space</CardTitle>
          </div>
          <CardDescription>
            A User can create a new Shared Space Invite Code only while they are
            not a member of another active Shared Space.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!outgoing) {
    return (
      <Card variant="strong">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRoundIcon aria-hidden="true" className="size-4" />
            <CardTitle>Create a Shared Space Invite Code</CardTitle>
          </div>
          <CardDescription>
            Generate one code to share through a channel you trust. It expires
            after seven days and does not reveal any financial data.
          </CardDescription>
        </CardHeader>
        {error && (
          <Alert variant="destructive" className="m-4">
            <AlertTitle>Invite Code could not be created</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <CardFooter>
          <Button type="button" onClick={onCreate} disabled={disabled}>
            <KeyRoundIcon aria-hidden="true" />
            {disabled ? 'Creating…' : 'Create Invite Code'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card variant="strong">
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRoundIcon aria-hidden="true" className="size-4" />
          <CardTitle>Your Shared Space Invite Code</CardTitle>
        </div>
        <CardDescription>
          Share this code directly. Anyone who receives it must sign in and
          choose whether to save the invitation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-label text-muted-foreground">Active code</p>
          <code className="mt-2 block break-all font-mono text-lg font-bold tracking-widest">
            {outgoing.code}
          </code>
        </div>
        <p className="text-sm text-muted-foreground">
          Expires{' '}
          <time dateTime={outgoing.expiresAt}>
            {formatInvitationExpiry(outgoing.expiresAt)}
          </time>
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void onCopy(outgoing.code)}
          disabled={disabled || copyState === 'copying'}
        >
          {copyState === 'copied' ? (
            <CheckIcon aria-hidden="true" />
          ) : (
            <CopyIcon aria-hidden="true" />
          )}
          {copyState === 'copied' ? 'Copied' : 'Copy Invite Code'}
        </Button>
        {copyState === 'failed' && (
          <p className="text-sm text-destructive" role="alert">
            This browser could not access the clipboard. Copy the code manually.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatInvitationExpiry(value: string): string {
  return `${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
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
        <CardDescription>
          Important changes to your Shared Spaces.
        </CardDescription>
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={disabled}
          >
            <RotateCcwIcon aria-hidden="true" /> Retry email
          </Button>
        )}
        {!notification.readAt && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRead}
            disabled={disabled}
          >
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
        <Button
          type="button"
          variant="destructive"
          onClick={() => setOpen(true)}
        >
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
              permanently archived as read-only history for both former members
              and cannot be reopened.
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

export { SharingPage };
