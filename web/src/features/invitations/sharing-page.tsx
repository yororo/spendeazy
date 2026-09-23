import { useState } from 'react';
import { ArchiveIcon, BellIcon, RotateCcwIcon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
  const spacesQuery = useAccessibleSpacesQuery(true);
  const notificationsQuery = useSpaceNotificationsQuery();
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

  return (
    <div className="mx-auto w-full max-w-screen-lg px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 border-b border-foreground pb-5">
        <p className="text-label text-muted-foreground">Shared Space</p>
        <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          Sharing
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Existing Personal and Shared Space data remains available while the
          next Shared Space joining flow is being built.
        </p>
      </header>

      <NotificationsPanel query={notificationsQuery} />

      {canEndSharing && (
        <LeaveSharedSpaceCard
          spaceId={sharedSpaceForLeaving.id}
          onArchived={() => navigate('/sharing')}
        />
      )}

      <Card variant="strong">
        <CardHeader>
          <CardTitle>Shared Space creation is temporarily unavailable</CardTitle>
          <CardDescription>
            Invite Codes are being built so people can join a Shared Space
            directly without relying on email delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Creating or joining a new Shared Space will be available again when
            the replacement flow is ready.
          </p>
          <p className="text-muted-foreground">
            Your existing Personal and Shared Space financial data is not
            affected.
          </p>
        </CardContent>
      </Card>
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

export { SharingPage };
