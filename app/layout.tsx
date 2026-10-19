import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { asset, REPO_URL, SITE_NAME, SITE_URL, STATIC_MODE } from "@/lib/site";
import { THEME_BOOT } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ServiceWorker } from "@/components/ServiceWorker";
import { InstallHint } from "@/components/InstallHint";
import { Analytics } from "@/components/Analytics";
import { ANALYTICS_ORIGIN } from "@/lib/analytics";

const description = "Every public API on one zoomable wall: search, filter by category or auth, and open docs in a click. Built from the community public-apis catalog.";

export const metadata: Metadata = {
  // With a base path (static Pages build) Next adds it to metadata URLs itself, so use the bare origin.
  metadataBase: new URL(STATIC_MODE ? new URL(SITE_URL).origin + "/" : SITE_URL + "/"),
  title: { default: `${SITE_NAME} — every public API on one wall`, template: `%s · ${SITE_NAME}` },
  description,
  openGraph: { type: "website", siteName: SITE_NAME, title: `${SITE_NAME} — every public API on one wall`, description, url: "./" },
  twitter: { card: "summary_large_image", title: `${SITE_NAME} — every public API on one wall`, description },
  // Icon URLs are not given the base path by Next, so add it here (the manifest link is).
  icons: { icon: [{ url: asset("/icons/icon-192.png"), sizes: "192x192", type: "image/png" }], apple: asset("/icons/apple-touch-icon.png") },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
};

// GitHub Pages cannot send headers, so the static build carries its policy in a meta tag.
const STATIC_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // The analytics count is an image request to GoatCounter, allowed only when it is configured.
  `img-src 'self' data: blob:${ANALYTICS_ORIGIN ? ` ${ANALYTICS_ORIGIN}` : ""}`,
  "font-src 'self'",
  // The admin page talks to GitHub's API with the signed-in reviewer's own token.
  "connect-src 'self' https://api.github.com",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0c0e14" }, { color: "#f2f3f7" }] };

function Logo() {
  return (
    <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" className="logo-mark">
      <rect x="1" y="1" width="12" height="12" rx="2.5" fill="var(--accent)" />
      <rect x="15" y="1" width="12" height="12" rx="2.5" fill="var(--tile-b)" />
      <rect x="1" y="15" width="12" height="12" rx="2.5" fill="var(--tile-c)" />
      <rect x="15" y="15" width="12" height="12" rx="2.5" fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="3 2" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script below may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        {STATIC_MODE && (
          <>
            <meta httpEquiv="Content-Security-Policy" content={STATIC_CSP} />
            <meta name="referrer" content="strict-origin-when-cross-origin" />
          </>
        )}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="brand" aria-label="ApiWall home">
              <Logo />
              <span>ApiWall</span>
            </Link>
            <nav aria-label="Main" className="main-nav">
              <Link href="/">Explore</Link>
              <Link href="/submit">Submit an API</Link>
              <Link href="/providers">For Providers</Link>
              <Link href="/packs">Packs</Link>
              <Link href="/changes">What&apos;s new</Link>
              <Link href="/developers">Developers</Link>
              <Link href="/about">About &amp; Source</Link>
            </nav>
            <div className="header-actions">
              <ThemeToggle />
              <a className="btn star-btn" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label={`Star ${SITE_NAME} on GitHub (opens GitHub)`}>
                <GitHubMark />
                <span className="star-label">Star</span>
                <span aria-hidden="true">★</span>
              </a>
              <Link href="/submit" className="btn btn-primary btn-cta">
                Place your API
              </Link>
            </div>
          </div>
        </header>
        <main id="main" className="wrap">
          {children}
        </main>
        <footer className="site-footer">
          <div className="wrap footer-inner">
            <p>
              Entries are community-sourced from{" "}
              <a href="https://github.com/public-apis/public-apis" target="_blank" rel="noopener noreferrer">
                public-apis/public-apis
              </a>{" "}
              (MIT). Confirm current documentation, terms and availability with each provider. ApiWall is independent and is not affiliated with or endorsed by the
              public-apis maintainers or by the listed providers.
            </p>
            <p className="muted">
              Brand marks belong to their owners and are shown only to identify services. <Link href="/about">How marks are chosen</Link> ·{" "}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                Source on GitHub
              </a>
            </p>
            <p className="muted">
              Browse: <Link href="/apis/">All APIs, A to Z</Link> · <Link href="/categories/">Categories</Link> · <Link href="/packs/">Starter packs</Link> ·{" "}
              <Link href="/stats/">Stats</Link> · <Link href="/developers/">Public API</Link> · <Link href="/about/#privacy">Privacy</Link> · <Link href="/admin/">Maintainers</Link>
            </p>
          </div>
        </footer>
        <ServiceWorker />
        <InstallHint />
        <Analytics />
      </body>
    </html>
  );
}
