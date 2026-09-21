import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { FeatureDataLoading } from '@/components/app/feature-data-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

import {
  useDeclinePublicInvitationMutation,
  usePublicInvitationQuery,
} from './public-invitation-queries';

function InvitationLandingPage() {
  const { token = '' } = useParams();
  const [confirmingToken, setConfirmingToken] = useState<string | null>(null);
  const [declinedToken, setDeclinedToken] = useState<string | null>(null);
  const invitationQuery = usePublicInvitationQuery(token);
  const declineMutation = useDeclinePublicInvitationMutation();
  const invitation = invitationQuery.data;
  const error = invitationQuery.error;
  const declineError =
    declineMutation.variables?.token === token ? declineMutation.error : null;
  const confirmingDecline = confirmingToken === token;
  const declined = declinedToken === token;

  async function confirmDecline() {
    try {
      await declineMutation.mutateAsync({ token });
      setDeclinedToken(token);
      setConfirmingToken(null);
    } catch {
      // The mutation's error is rendered below and remains available for retry.
    }
  }

  if (invitationQuery.isPending) {
    return <FeatureDataLoading label="Loading invitation" />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <Card variant="strong" className="w-full max-w-lg">
        <CardHeader>
          <p className="text-label text-muted-foreground">Spendeazy</p>
          <CardTitle className="mt-2 text-xl">Shared Space invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {declined ? (
            <p role="status">The invitation was declined. No account or membership was created.</p>
          ) : error || declineError ? (
            <p className="text-destructive" role="alert">
              {(error ?? declineError) instanceof Error
                ? (error ?? declineError)?.message
                : 'This invitation is unavailable.'}
            </p>
          ) : invitation ? (
            <>
              <p>
                <span className="font-semibold">{invitation.senderName}</span> invited you to share a financial Space on Spendeazy.
              </p>
              <p className="text-muted-foreground">
                This limited page only lets you review or decline the invitation. Opening it has not changed its state.
              </p>
              <p className="text-xs text-muted-foreground">
                Invitation for {invitation.recipientEmail} · expires {new Date(invitation.expiresAt).toLocaleDateString()}
              </p>
            </>
          ) : null}
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          {invitation?.canDecline && !declined && (
            confirmingDecline ? (
              <>
                <Button type="button" variant="destructive" onClick={() => void confirmDecline()} disabled={declineMutation.isPending}>
                  Confirm decline
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmingToken(null)} disabled={declineMutation.isPending}>
                  Keep invitation
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={() => setConfirmingToken(token)}>
                Decline invitation
              </Button>
            )
          )}
          <Button asChild variant="secondary">
            <Link to="/sign-in">Go to Spendeazy</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export { InvitationLandingPage };
