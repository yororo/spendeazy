import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { FeatureDataLoading } from '@/components/app/feature-data-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

import {
  declinePublicInvitation,
  getPublicInvitation,
} from './public-invitation-service';
import type { PublicInvitation } from './invitations-service';

function InvitationLandingPage() {
  const { token = '' } = useParams();
  const [invitation, setInvitation] = useState<PublicInvitation | null>(null);
  const [loadedToken, setLoadedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [declinePending, setDeclinePending] = useState(false);

  useEffect(() => {
    let active = true;
    void getPublicInvitation(token)
      .then((result) => {
        if (active) {
          setInvitation(result);
          setError(null);
          setDeclined(false);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'This invitation is unavailable.');
      })
      .finally(() => {
        if (active) setLoadedToken(token);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function confirmDecline() {
    setDeclinePending(true);
    try {
      await declinePublicInvitation(token);
      setDeclined(true);
      setConfirmingDecline(false);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'The invitation could not be declined.');
    } finally {
      setDeclinePending(false);
    }
  }

  if (loadedToken !== token) return <FeatureDataLoading label="Loading invitation" />;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <Card variant="strong" className="w-full max-w-lg">
        <CardHeader>
          <p className="text-label text-muted-foreground">Spendeazy</p>
          <CardTitle className="mt-2 text-xl">Shared Space invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {error ? (
            <p className="text-destructive" role="alert">{error}</p>
          ) : declined ? (
            <p role="status">The invitation was declined. No account or membership was created.</p>
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
                <Button type="button" variant="destructive" onClick={() => void confirmDecline()} disabled={declinePending}>
                  Confirm decline
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmingDecline(false)} disabled={declinePending}>
                  Keep invitation
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={() => setConfirmingDecline(true)}>
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
