import { AuthenticateWithRedirectCallback } from "@clerk/react";

import { AuthLoading } from "@/shared/ui/auth-loading";

function SsoCallbackPage() {
  return (
    <>
      <AuthLoading />
      <AuthenticateWithRedirectCallback />
    </>
  );
}

export { SsoCallbackPage };
