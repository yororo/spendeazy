import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  EyeIcon,
  EyeOffIcon,
  FileUpIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  LockOpenIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { importFileRules } from "./statement-import-data";
import type { CategorizedStatement } from "./statement-categorizer";
import type { CategoryRule } from "./statement-import-service";
import { createStatementUpload } from "./statement-upload";

interface StatementDropZoneProps {
  categoryRules: readonly CategoryRule[];
  activeCategoryIds: ReadonlySet<string>;
  onStatementCategorized: (
    file: File,
    statement: CategorizedStatement,
  ) => void;
}

function StatementDropZone({
  categoryRules,
  activeCategoryIds,
  onStatementCategorized,
}: StatementDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const browseButtonRef = useRef<HTMLButtonElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const gcashMobileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [upload] = useState(() => createStatementUpload({
    getCategorizationInputs: () => ({ rules: categoryRules, activeCategoryIds }),
    onPrepared: onStatementCategorized,
  }));
  useLayoutEffect(() => {
    upload.updateDependencies({
      getCategorizationInputs: () => ({ rules: categoryRules, activeCategoryIds }),
      onPrepared: onStatementCategorized,
    });
  }, [upload, categoryRules, activeCategoryIds, onStatementCategorized]);
  const state = useSyncExternalStore(upload.subscribe, upload.getState);
  useLayoutEffect(() => () => upload.abandon(), [upload]);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [deferRecipientPrompt, setDeferRecipientPrompt] = useState(false);
  const isProcessing = state.stage === "processing";
  const selectedFile = state.stage === "idle" ? null : state.file;
  const error = state.stage === "idle" ? state.error : null;
  const isPasswordDialogOpen = state.stage === "password" || (state.stage === "processing" && state.challenge);
  const pdfPassword = state.stage === "password" || state.stage === "processing" ? state.password : "";
  const passwordError = state.stage === "password" ? state.error : null;
  const gcashMobileNumber = state.stage === "recipient" ? state.recipient : "";
  const gcashRecipientError = state.stage === "recipient" ? state.error : null;

  useEffect(() => {
    if (isProcessing || !passwordError) return;
    passwordInputRef.current?.focus();
    passwordInputRef.current?.select();
  }, [isProcessing, passwordError]);
  useEffect(() => {
    if (gcashRecipientError) gcashMobileInputRef.current?.focus();
  }, [gcashRecipientError]);

  function abandonPasswordChallenge() {
    upload.cancelPassword();
    setIsPasswordVisible(false);
    if (inputRef.current) inputRef.current.value = "";
  }
  function handlePasswordDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isProcessing) abandonPasswordChallenge();
  }
  function selectFile(file?: File) {
    if (isProcessing) return;
    setIsPasswordVisible(false);
    setDeferRecipientPrompt(false);
    void upload.selectFile(file);
  }
  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.stage !== "password" || !pdfPassword) return;
    setDeferRecipientPrompt(true);
    void upload.retryPassword();
  }
  function submitGcashRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    upload.completeRecipient();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    selectFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    selectFile(event.dataTransfer.files[0]);
  }

  return (
    <>
      <div
        className={cn(
          "flex min-h-[28rem] flex-1 flex-col items-center justify-center border border-structure bg-muted px-5 py-12 text-center transition-colors sm:min-h-[34rem]",
          isDragging &&
            "bg-primary/15 outline-2 outline-offset-[-6px] outline-ring",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isProcessing) setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
        aria-busy={isProcessing}
      >
        <div className="grid size-16 place-content-center border border-structure bg-primary text-primary-foreground">
          <FileUpIcon className="size-7" aria-hidden="true" />
        </div>

        <h2 className="mt-4 font-mono text-lg font-bold tracking-tight uppercase">
          Drop statement file here
        </h2>
        <p className="mt-2 font-mono text-xs text-muted-foreground uppercase">
          {importFileRules.formats.join(" · ")} · Max {importFileRules.maxSizeMb}{" "}
          MB
        </p>

        <input
          ref={inputRef}
          id="statement-file"
          type="file"
          accept={importFileRules.accept}
          className="sr-only"
          disabled={isProcessing}
          onChange={handleChange}
        />

        <Button
          ref={browseButtonRef}
          type="button"
          variant="secondary"
          className="mt-4 bg-upload-action hover:bg-upload-action/80"
          disabled={isProcessing}
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.value = "";
              inputRef.current.click();
            }
          }}
        >
          {isProcessing ? (
            <LoaderCircleIcon
              className="size-4 animate-spin text-inverse-accent"
              aria-hidden="true"
            />
          ) : (
            <FolderOpenIcon
              className="size-4 text-inverse-accent"
              aria-hidden="true"
            />
          )}
          {isProcessing ? "Processing" : "Browse files"}
        </Button>

        <div
          aria-live="polite"
          className="mt-3 min-h-14 w-full max-w-sm text-sm"
        >
          {error ? (
            <p className="font-medium text-destructive">{error}</p>
          ) : isProcessing && selectedFile ? (
            <div>
              <div className="font-mono text-xs font-semibold uppercase">
                <span className="wrap-anywhere">Processing {selectedFile.name}</span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              PDF processed locally. Reviewed statement details and Transactions
              are saved when you import.
            </p>
          )}
        </div>
      </div>

      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={handlePasswordDialogOpenChange}
      >
        <DialogContent
          closeButtonDisabled={isProcessing}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            setIsPasswordVisible(false);
            setDeferRecipientPrompt(false);
            if (upload.getState().stage !== "recipient") browseButtonRef.current?.focus();
          }}
        >
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-content-center border border-structure bg-primary text-primary-foreground">
                <LockKeyholeIcon className="size-4" aria-hidden="true" />
              </span>
              <DialogTitle className="uppercase">
                PDF password required
              </DialogTitle>
            </div>
          </DialogHeader>
          <form onSubmit={submitPassword} aria-busy={isProcessing}>
            <div className="grid gap-5 px-5 py-6">
              <div className="grid gap-2">
                <h3 className="text-xl font-bold">
                  This PDF is password protected
                </h3>
                <DialogDescription className="text-foreground/80">
                  Enter the document password to open this statement and
                  continue importing Transactions.
                </DialogDescription>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pdf-password">PDF password</Label>
                <div className="flex h-10 items-center border border-control-border bg-background pl-3">
                  <KeyRoundIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    ref={passwordInputRef}
                    id="pdf-password"
                    type={isPasswordVisible ? "text" : "password"}
                    value={pdfPassword}
                    autoFocus
                    autoComplete="off"
                    placeholder="Enter PDF password"
                    disabled={isProcessing}
                    className="h-full border-0 bg-transparent"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={
                      passwordError ? "pdf-password-error" : undefined
                    }
                    onChange={(event) => {
                      upload.setPassword(event.target.value);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mr-1"
                    disabled={isProcessing}
                    aria-label={
                      isPasswordVisible ? "Hide password" : "Show password"
                    }
                    aria-pressed={isPasswordVisible}
                    onClick={() => setIsPasswordVisible((visible) => !visible)}
                  >
                    {isPasswordVisible ? (
                      <EyeOffIcon aria-hidden="true" />
                    ) : (
                      <EyeIcon aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {passwordError && (
                  <p
                    id="pdf-password-error"
                    className="text-sm text-destructive"
                  >
                    {passwordError}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2.5 border border-input bg-muted p-3 text-left text-xs text-foreground/80">
                <ShieldCheckIcon className="size-4 shrink-0" aria-hidden="true" />
                <p>
                  Your password is used only to open this file and is never
                  stored.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isProcessing}
                onClick={abandonPasswordChallenge}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!pdfPassword || isProcessing}>
                {isProcessing ? (
                  <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                ) : (
                  <LockOpenIcon aria-hidden="true" />
                )}
                {isProcessing ? "Opening PDF" : "Open PDF"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={state.stage === "recipient" && !deferRecipientPrompt}
        onOpenChange={(open) => { if (!open) upload.skipRecipient(); }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            browseButtonRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Identify incoming GCash transfers</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitGcashRecipient}>
            <div className="grid gap-5 px-5 py-6">
              <DialogDescription className="text-foreground/80">
                Enter your GCash mobile number to automatically mark transfers
                to you as Debit and exclude them from this import. If you skip,
                search for your number in the transactions and manually exclude
                transfers to you.
              </DialogDescription>

              <div className="grid gap-2">
                <Label htmlFor="gcash-mobile-number">
                  GCash mobile number (optional)
                </Label>
                <Input
                  ref={gcashMobileInputRef}
                  id="gcash-mobile-number"
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  autoComplete="off"
                  value={gcashMobileNumber}
                  aria-invalid={gcashRecipientError ? true : undefined}
                  aria-describedby={
                    gcashRecipientError
                      ? "gcash-mobile-number-hint gcash-mobile-number-error"
                      : "gcash-mobile-number-hint"
                  }
                  onChange={(event) => {
                    upload.setRecipient(event.target.value);
                  }}
                />
                <p
                  id="gcash-mobile-number-hint"
                  className="text-xs text-muted-foreground"
                >
                  11 digits starting with 09, e.g. 09999999999.
                </p>
                {gcashRecipientError && (
                  <p
                    id="gcash-mobile-number-error"
                    role="alert"
                    className="text-sm font-medium text-destructive"
                  >
                    {gcashRecipientError}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2.5 border border-input bg-muted p-3 text-left text-xs text-foreground/80">
                <ShieldCheckIcon
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  The number you enter is used only in your browser for this
                  import; it is not saved or sent to our servers.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => upload.skipRecipient()}
              >
                Skip
              </Button>
              <Button type="submit">Continue</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { StatementDropZone };
