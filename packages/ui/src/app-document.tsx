import { RouteAnnouncer } from '@react-foundry/router';
import type { ReactNode } from 'react';
import { Links, Meta, Scripts, ScrollRestoration } from 'react-router';

import { useNonce } from './nonce.tsx';

interface AppDocumentProps {
  children: ReactNode;
}

export function AppDocument({ children }: AppDocumentProps) {
  const nonce = useNonce();
  const supportsFrontend =
    typeof HTMLScriptElement !== 'undefined' && 'noModule' in HTMLScriptElement.prototype;

  return (
    <html lang="en" className="govuk-template">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links nonce={nonce} />
      </head>
      <body
        className={`govuk-template__body${supportsFrontend ? ' govuk-frontend-supported' : ''}`}
        suppressHydrationWarning
      >
        <script
          nonce={nonce}
          // The CSP blanks the nonce attribute in the DOM, so hydration can never see it
          // match the real value both renders agree on.
          suppressHydrationWarning
          // GOV.UK Frontend enhances interactive components when this class is present.
          dangerouslySetInnerHTML={{
            __html:
              "if ('noModule' in HTMLScriptElement.prototype) document.body.classList.add('govuk-frontend-supported');",
          }}
        />
        {children}
        <RouteAnnouncer />
        {/* Default keying: filter navigations pass preventScrollReset and carry no
            hash, so anchors still scroll while nothing else moves the page. */}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
