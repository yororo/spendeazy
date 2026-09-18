import { useEffect, type ReactNode } from "react";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { LedgerMark } from "@/components/app/ledger-mark";
import { cn } from "@/lib/utils";

const operatorName = "Spendeazy";
const operatorLocation = "Manila, Philippines";
const supportEmail = "seanalvinyoro@gmail.com";
const documentDate = "September 2026";

const inlineLinkClassName =
  "inline-block min-h-6 align-baseline font-semibold text-foreground underline decoration-1 underline-offset-4 hover:bg-primary hover:text-primary-foreground focus-ledger";

interface LegalSection {
  readonly id: string;
  readonly title: string;
  readonly content: ReactNode;
}

interface LegalDocument {
  readonly id: "privacy" | "terms";
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly LegalSection[];
}

function SupportEmailLink() {
  return (
    <a className={inlineLinkClassName} href={"mailto:" + supportEmail}>
      {supportEmail}
    </a>
  );
}

const privacySections: readonly LegalSection[] = [
  {
    id: "overview",
    title: "1. Overview",
    content: (
      <>
        <p>
          Spendeazy is designed to help you understand spending, import
          statement details, and organize Transactions and Budgets. The{" "}
          <Link className={inlineLinkClassName} to="/terms">
            Terms of Service
          </Link>{" "}
          describe the rules for using the service.
        </p>
      </>
    ),
  },
  {
    id: "information-we-process",
    title: "2. Information we process",
    content: (
      <>
        <p>Depending on how you use Spendeazy, we may process:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Identity information</strong>,
            such as the display name, verified primary email address, and
            provider or session identifiers made available through Google and
            Clerk SSO.
          </li>
          <li>
            <strong className="text-foreground">Financial information</strong>{" "}
            that you enter or choose to commit, including Categories, Budgets,
            transaction descriptions, dates, amounts, account details, and
            Statement Import metadata such as a bank, card type, last four
            digits, and file name.
          </li>
          <li>
            <strong className="text-foreground">
              Derived import information
            </strong>
            , including a file hash used to help identify duplicate imports and
            the parsed statement and transaction details you choose to save.
          </li>
          <li>
            <strong className="text-foreground">Support information</strong>{" "}
            that you provide when you contact us.
          </li>
        </ul>
        <p>
          We do not need your bank login credentials to provide the current
          Statement Import workflow. We also do not store your Google password.
        </p>
      </>
    ),
  },
  {
    id: "local-pdf-processing",
    title: "3. Statement Import and local PDF files",
    content: (
      <>
        <p>
          The original PDF file is processed locally in your browser. The PDF
          bytes and any optional PDF password stay on your device; Spendeazy
          does not upload, store, or share the source PDF file.
        </p>
        <p>
          When you choose to commit a Statement Import, the app sends only the
          selected parsed statement details and Transactions, the file name, and
          a derived SHA-256 file hash used to help detect duplicate imports.
          Those derived records may be stored in the Expense Tracker API as your
          financial data. The PDF itself is not sent to that API.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "4. How we use information",
    content: (
      <>
        <p>We use information to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>authenticate you and maintain your signed-in session;</li>
          <li>create and maintain your private Spendeazy account;</li>
          <li>
            provide the Dashboard, Transactions, Categories, Budgets, and
            Statement Import features;
          </li>
          <li>identify probable duplicate Statement Imports;</li>
          <li>respond to support and privacy requests; and</li>
          <li>
            protect, troubleshoot, and improve the reliability of the service.
          </li>
        </ul>
        <p>
          We do not sell or rent your personal information, and we do not use
          your financial information for advertising.
        </p>
      </>
    ),
  },
  {
    id: "when-information-is-shared",
    title: "5. When information is shared",
    content: (
      <>
        <p>
          We may share the information needed to operate Spendeazy with service
          providers that act on our behalf, including:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Clerk</strong> for identity,
            authentication, and session services;
          </li>
          <li>
            <strong className="text-foreground">Google</strong> when you use
            Google as your identity provider; and
          </li>
          <li>
            the Expense Tracker API and hosting providers needed to operate the
            application and persist your committed financial data.
          </li>
        </ul>
        <p>
          These providers may process information under their own terms and
          privacy practices. Review the{" "}
          <a
            className={inlineLinkClassName}
            href="https://clerk.com/legal/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Clerk Privacy Policy
            <ExternalLinkIcon
              className="ml-1 inline size-3.5"
              aria-hidden="true"
            />
          </a>{" "}
          and{" "}
          <a
            className={inlineLinkClassName}
            href="https://policies.google.com/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google Privacy Policy
            <ExternalLinkIcon
              className="ml-1 inline size-3.5"
              aria-hidden="true"
            />
          </a>{" "}
          for their respective practices.
        </p>
        <p>
          We may also disclose information if required by law, to protect the
          rights or safety of users and the service, or as part of a business
          transfer. We do not share the original PDF file because it remains on
          your device.
        </p>
      </>
    ),
  },
  {
    id: "retention-and-deletion",
    title: "6. Retention and deletion",
    content: (
      <>
        <p>
          The source PDF is not stored by Spendeazy. We retain your identity
          profile and committed financial data while needed to provide the
          service and for legitimate operational, security, or legal purposes.
          This first-pass policy does not promise a fixed retention period.
        </p>
        <p>
          You may request access, correction, or deletion of personal
          information by contacting <SupportEmailLink />. We may need to verify
          your identity before acting on a request and may retain limited
          information where required by law or reasonably necessary for
          security, dispute resolution, or backups.
        </p>
      </>
    ),
  },
  {
    id: "cookies-and-tracking",
    title: "7. Cookies and similar technologies",
    content: (
      <>
        <p>
          Spendeazy uses essential cookies or similar browser technologies
          needed for authentication and session continuity. We do not currently
          use advertising cookies or non-essential analytics in this client
          application.
        </p>
        <p>
          Clerk, Google, the API, or hosting providers may use their own
          technologies as described in their respective policies.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "8. Security",
    content: (
      <>
        <p>
          We use reasonable technical and organizational safeguards intended to
          protect information under our control. No online service can guarantee
          absolute security, and you should use a secure device and protect your
          identity-provider account.
        </p>
        <p>
          Keeping source PDFs on your device is an important part of the current
          Statement Import design, but the security of your device and browser
          remains your responsibility.
        </p>
      </>
    ),
  },
  {
    id: "privacy-choices",
    title: "9. Your privacy choices",
    content: (
      <>
        <p>
          Depending on applicable law, you may have rights to be informed about
          processing, access your information, correct it, object to certain
          processing, request erasure or blocking, request portability, and file
          a complaint. Contact us at <SupportEmailLink /> so we can review and
          route your request.
        </p>
        <p>
          The Philippine National Privacy Commission provides general
          information about data-subject rights in its{" "}
          <a
            className={inlineLinkClassName}
            href="https://privacy.gov.ph/data-subject-rights/"
            rel="noopener noreferrer"
            target="_blank"
          >
            data-subject rights guidance
            <ExternalLinkIcon
              className="ml-1 inline size-3.5"
              aria-hidden="true"
            />
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "10. Children",
    content: (
      <p>
        Spendeazy is intended for people who are at least 18 years old or have
        reached the age of majority where they live. We do not knowingly collect
        personal information from children.
      </p>
    ),
  },
  {
    id: "policy-changes",
    title: "11. Changes to this policy",
    content: (
      <p>
        We may update this Privacy Policy as the service or our practices
        change. We will post the revised policy here and update the “Last
        updated” date. If a change is material, we will provide additional
        notice where appropriate.
      </p>
    ),
  },
  {
    id: "privacy-contact",
    title: "12. Contact",
    content: (
      <p>
        For privacy questions or requests, contact {operatorName} at{" "}
        <SupportEmailLink />.
      </p>
    ),
  },
];

const termsSections: readonly LegalSection[] = [
  {
    id: "agreement",
    title: "1. Agreement to these Terms",
    content: (
      <>
        <p>
          By selecting “Continue with Google” or using Spendeazy, you agree to
          these Terms and the{" "}
          <Link className={inlineLinkClassName} to="/privacy">
            Privacy Policy
          </Link>
          . If you do not agree, do not use the service.
        </p>
      </>
    ),
  },
  {
    id: "eligibility-and-accounts",
    title: "2. Eligibility and accounts",
    content: (
      <>
        <p>
          You must be at least 18 years old or the age of majority where you
          live to use Spendeazy. You are responsible for the activity that
          occurs through your identity-provider account and for keeping that
          account secure.
        </p>
        <p>
          Spendeazy uses Google and Clerk for SSO. Spendeazy does not see or
          store your Google password. You must provide information that is
          accurate enough for us to operate your account and contact you about
          service or legal matters.
        </p>
      </>
    ),
  },
  {
    id: "the-service",
    title: "3. The service",
    content: (
      <>
        <p>
          Spendeazy provides tools for personal expense organization, including
          a Dashboard, Transactions, Categories, Budgets, and a Statement Import
          workflow. We may add, change, suspend, or remove features as the
          service develops.
        </p>
        <p>
          Spendeazy is not a bank, broker, lender, payment service, or financial
          adviser. The service does not connect to your bank or execute
          financial transactions on your behalf.
        </p>
      </>
    ),
  },
  {
    id: "statement-import",
    title: "4. Statement Import",
    content: (
      <>
        <p>
          Statement Import parses supported PDF statements in your browser. The
          source PDF and any password remain on your device and are not uploaded
          to, stored by, or shared through Spendeazy.
        </p>
        <p>
          When you review and commit an import, the parsed statement details and
          selected Transactions become part of your Spendeazy account. You are
          responsible for reviewing imported information before committing it
          and for having the right to use the statement information you provide.
        </p>
      </>
    ),
  },
  {
    id: "your-content",
    title: "5. Your information and content",
    content: (
      <>
        <p>
          You retain your rights in the information you provide to Spendeazy.
          You give Spendeazy the limited permission needed to receive, process,
          store, display, and back up committed information so we can provide
          the service.
        </p>
        <p>
          You must not submit information that you do not have permission to
          use, or intentionally submit information that is unlawful, harmful,
          deceptive, or designed to compromise another person’s privacy or
          security.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "6. Acceptable use",
    content: (
      <>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>use Spendeazy in violation of applicable law;</li>
          <li>
            access another person’s account or attempt to bypass authentication
            or security controls;
          </li>
          <li>
            interfere with the service, its API, or another user’s access;
          </li>
          <li>
            introduce malware, harmful code, or unreasonable automated load;
          </li>
          <li>
            copy, reverse engineer, resell, or misuse the service except where
            applicable law permits it; or
          </li>
          <li>
            use Spendeazy to provide professional financial advice to others.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "third-party-services",
    title: "7. Third-party services",
    content: (
      <p>
        Google and Clerk provide identity and authentication services used to
        sign in. Their services are governed by their own terms and policies.
        Spendeazy is not responsible for a third party’s service, content,
        availability, or handling of information under that third party’s
        policies.
      </p>
    ),
  },
  {
    id: "financial-disclaimer",
    title: "8. Financial-information disclaimer",
    content: (
      <>
        <p>
          Spendeazy is not financial, investment, tax, or legal advice. We do
          not guarantee that parsed, categorized, summarized, or displayed
          information is complete, accurate, or suitable for a particular
          decision.
        </p>
        <p>
          You are responsible for checking Transactions and totals against your
          original records and for obtaining professional advice when needed.
        </p>
      </>
    ),
  },
  {
    id: "availability-and-disclaimers",
    title: "9. Availability and disclaimers",
    content: (
      <p>
        To the fullest extent permitted by law, Spendeazy is provided on an “as
        is” and “as available” basis without guarantees of uninterrupted
        availability, accuracy, fitness for a particular purpose, or absolute
        security. We may experience maintenance, defects, outages, or changes
        that affect the service.
      </p>
    ),
  },
  {
    id: "suspension-and-termination",
    title: "10. Suspension and termination",
    content: (
      <>
        <p>
          You may stop using Spendeazy at any time. We may suspend or terminate
          access where reasonably necessary to address misuse, security risks,
          legal requirements, or the closure or material change of the service.
        </p>
        <p>
          The Privacy Policy describes how information may be retained or
          deleted after use of the service ends. Provisions that by their nature
          should continue—including ownership, disclaimers, limitations, and
          governing law—will continue after termination.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "11. Limitation of liability",
    content: (
      <p>
        To the fullest extent permitted by law, Spendeazy and its operator will
        not be liable for indirect, incidental, special, consequential, or
        exemplary losses, or for loss of data, profits, goodwill, or opportunity
        arising from or related to your use of the service. Nothing in these
        Terms excludes or limits liability that cannot legally be excluded or
        limited. This section is subject to legal review.
      </p>
    ),
  },
  {
    id: "governing-law",
    title: "12. Governing law and disputes",
    content: (
      <p>
        These Terms are governed by Philippine law, without regard to conflict
        of law rules. Subject to any mandatory rights or remedies available to
        you, courts located in Manila, Philippines will have jurisdiction over
        disputes related to these Terms or the service.
      </p>
    ),
  },
  {
    id: "terms-changes",
    title: "13. Changes to these Terms",
    content: (
      <p>
        We may update these Terms as the service or our practices change. We
        will post the revised Terms here and update the “Last updated” date. If
        a change is material, we will provide additional notice where
        appropriate. Continued use after an updated effective date means you
        accept the revised Terms, subject to applicable law.
      </p>
    ),
  },
  {
    id: "terms-contact",
    title: "14. Contact",
    content: (
      <p>
        Questions about these Terms can be sent to {operatorName} at{" "}
        <SupportEmailLink />.
      </p>
    ),
  },
];

const legalDocuments: Record<LegalDocument["id"], LegalDocument> = {
  privacy: {
    id: "privacy",
    title: "Privacy Policy",
    summary:
      "How Spendeazy handles identity information, financial data, and browser-local statement files.",
    sections: privacySections,
  },
  terms: {
    id: "terms",
    title: "Terms of Service",
    summary:
      "The rules and limits that apply when you use Spendeazy to organize personal expenses.",
    sections: termsSections,
  },
};

interface DocumentNavigationProps {
  readonly sections: readonly LegalSection[];
  readonly mobile?: boolean;
}

function DocumentNavigation({
  sections,
  mobile = false,
}: DocumentNavigationProps) {
  return (
    <nav
      aria-label={mobile ? "Document sections" : "On this page"}
      className={cn(mobile && "border border-border bg-muted p-4")}
    >
      <p className="text-label text-muted-foreground">On this page</p>
      <ol className="mt-3 space-y-2 border-l border-border pl-3">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              className="inline-flex min-h-6 items-center focus-ledger text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              href={"#" + section.id}
            >
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface LegalPageProps {
  readonly page: LegalDocument["id"];
}

function LegalPage({ page }: LegalPageProps) {
  const legalDocument = legalDocuments[page];

  useEffect(() => {
    document.title = legalDocument.title + " · Spendeazy";
  }, [legalDocument.title]);

  return (
    <div className="min-h-screen bg-background">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:font-mono focus:text-sm focus:font-semibold focus:text-primary-foreground focus-ledger"
        href="#legal-content"
      >
        Skip to legal content
      </a>

      <header className="border-b border-foreground bg-secondary text-secondary-foreground">
        <div className="mx-auto flex min-h-16 max-w-screen-2xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-9">
          <LedgerMark interactive={false} />

          <nav
            aria-label="Legal documents"
            className="order-3 flex basis-full items-center gap-4 font-mono text-xs font-semibold uppercase tracking-wide sm:order-2 sm:basis-auto"
          >
            <Link
              aria-current={page === "privacy" ? "page" : undefined}
              className={cn(
                "focus-ledger py-2 underline-offset-4 hover:text-primary hover:underline",
                page === "privacy" && "text-primary",
              )}
              to="/privacy"
            >
              Privacy Policy
            </Link>
            <Link
              aria-current={page === "terms" ? "page" : undefined}
              className={cn(
                "focus-ledger py-2 underline-offset-4 hover:text-primary hover:underline",
                page === "terms" && "text-primary",
              )}
              to="/terms"
            >
              Terms of Service
            </Link>
          </nav>

          <Link
            className="focus-ledger ml-auto inline-flex min-h-10 items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide hover:text-primary"
            to="/sign-in"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Back to sign in
          </Link>
        </div>
      </header>

      <main
        id="legal-content"
        className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-12 lg:px-9 lg:py-16"
      >
        <div className="mx-auto max-w-6xl">
          <div className="lg:hidden">
            <DocumentNavigation mobile sections={legalDocument.sections} />
          </div>

          <div className="mt-10 grid gap-12 lg:mt-0 lg:grid-cols-[12rem_minmax(0,48rem)] lg:gap-16">
            <aside className="hidden lg:block lg:pt-2">
              <div className="sticky top-6">
                <DocumentNavigation sections={legalDocument.sections} />
              </div>
            </aside>

            <article className="min-w-0">
              <header>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-label text-muted-foreground">Legal</p>
                    <h1 className="mt-3 font-mono text-4xl font-bold tracking-tight sm:text-5xl">
                      {legalDocument.title}
                    </h1>
                  </div>
                </div>

                <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                  {legalDocument.summary}
                </p>

                <dl className="mt-8 grid gap-5 border-y border-border py-5 sm:grid-cols-3">
                  <div>
                    <dt className="text-label text-muted-foreground">
                      Operator
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold">
                      {operatorName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-label text-muted-foreground">
                      Location
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold">
                      {operatorLocation}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-label text-muted-foreground">
                      Effective / updated
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold">
                      {documentDate}
                    </dd>
                  </div>
                </dl>
              </header>

              <div className="mt-12 space-y-12">
                {legalDocument.sections.map((section) => (
                  <section
                    aria-labelledby={section.id + "-heading"}
                    id={section.id}
                    key={section.id}
                    className="scroll-mt-6"
                  >
                    <h2
                      className="font-mono text-xl font-bold tracking-tight sm:text-2xl"
                      id={section.id + "-heading"}
                    >
                      {section.title}
                    </h2>
                    <div className="mt-4 space-y-4 text-base leading-7 text-muted-foreground">
                      {section.content}
                    </div>
                  </section>
                ))}
              </div>

              <footer className="mt-16 flex flex-col gap-4 border-t border-foreground pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Need to review the other legal document?
                </p>
                <Link
                  className="focus-ledger inline-flex min-h-10 items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide underline underline-offset-4 hover:bg-primary hover:text-primary-foreground"
                  to={page === "privacy" ? "/terms" : "/privacy"}
                >
                  View{" "}
                  {page === "privacy" ? "Terms of Service" : "Privacy Policy"}
                  <ArrowLeftIcon
                    className="size-4 rotate-180"
                    aria-hidden="true"
                  />
                </Link>
              </footer>
            </article>
          </div>
        </div>
      </main>
    </div>
  );
}

function PrivacyPolicyPage() {
  return <LegalPage page="privacy" />;
}

function TermsOfServicePage() {
  return <LegalPage page="terms" />;
}

export { PrivacyPolicyPage, TermsOfServicePage };
