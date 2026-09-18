import { AuthenticateWithRedirectCallback } from "@clerk/react";

import { AuthLoading } from "@/components/app/auth-loading";

function SsoCallbackPage() {
  return (
    <>
      <AuthLoading />
      <AuthenticateWithRedirectCallback />
    </>
  );
}

export { SsoCallbackPage };
