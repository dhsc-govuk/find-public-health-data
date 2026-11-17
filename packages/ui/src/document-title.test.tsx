// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createRoutesStub, Form, Link, Meta, Outlet, useActionData } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDocumentMeta,
  DocumentTitle,
  formatDocumentTitle,
  titleFromPage,
} from './document-title.tsx';
import { serviceName } from './service-name.ts';

afterEach(cleanup);

describe('formatDocumentTitle', () => {
  it('names the page, then the service', () => {
    expect(formatDocumentTitle('Add a topic')).toBe(`Add a topic - ${serviceName} - GOV.UK`);
  });

  it('names only the service when there is no page title', () => {
    expect(formatDocumentTitle()).toBe(`${serviceName} - GOV.UK`);
  });

  it('starts with "Error: " when the page shows errors', () => {
    expect(formatDocumentTitle('Add a topic', { hasErrors: true })).toBe(
      `Error: Add a topic - ${serviceName} - GOV.UK`,
    );
  });
});

function FormPage() {
  const rejected = useActionData<{ error: string } | undefined>();

  return (
    <>
      <DocumentTitle hasErrors={rejected !== undefined} pageTitle="Add a topic" />
      <Form method="post">
        <button type="submit">Submit</button>
      </Form>
      <Link to="/other">Other page</Link>
    </>
  );
}

function ServerDocument() {
  return (
    <html lang="en">
      <head>
        <Meta />
      </head>
      <body>
        <Outlet />
      </body>
    </html>
  );
}

function ClientDocument() {
  return (
    <>
      <Meta />
      <Outlet />
    </>
  );
}

// The root renders Meta as AppDocument does; its title is the one the form page replaces.
function createRoutes(Document: typeof ServerDocument) {
  return createRoutesStub([
    {
      id: 'root',
      path: '/',
      meta: createDocumentMeta(),
      Component: Document,
      children: [
        {
          id: 'form',
          path: 'form',
          meta: titleFromPage,
          action: () => ({ error: 'Enter a topic name' }),
          Component: FormPage,
        },
        { id: 'other', path: 'other', meta: createDocumentMeta('Other page'), Component: Outlet },
      ],
    },
  ]);
}

// Server-renders the document as a no-JavaScript POST gets it, with the action's result.
function renderDocument(actionData?: { error: string }) {
  const Routes = createRoutes(ServerDocument);

  return renderToString(
    <Routes
      hydrationData={{ actionData: actionData === undefined ? null : { form: actionData } }}
      initialEntries={['/form']}
    />,
  );
}

function titlesIn(html: string) {
  return [...html.matchAll(/<title>(.*?)<\/title>/g)].map(([, title]) => title);
}

function documentTitles() {
  return [...document.querySelectorAll('title')].map((title) => title.textContent);
}

describe('DocumentTitle', () => {
  it('server-renders the one title into the head', () => {
    const html = renderDocument();

    expect(titlesIn(html)).toEqual([`Add a topic - ${serviceName} - GOV.UK`]);
    expect(html.indexOf('<title>')).toBeLessThan(html.indexOf('</head>'));
  });

  it('server-renders the one title with the error prefix after a rejected submission', () => {
    expect(titlesIn(renderDocument({ error: 'Enter a topic name' }))).toEqual([
      `Error: Add a topic - ${serviceName} - GOV.UK`,
    ]);
  });

  it('keeps one title through a client-side submission and navigation', async () => {
    const Routes = createRoutes(ClientDocument);
    render(<Routes initialEntries={['/form']} />);

    expect(documentTitles()).toEqual([`Add a topic - ${serviceName} - GOV.UK`]);

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(documentTitles()).toEqual([`Error: Add a topic - ${serviceName} - GOV.UK`]),
    );

    fireEvent.click(screen.getByRole('link', { name: 'Other page' }));
    await waitFor(() => expect(documentTitles()).toEqual([`Other page - ${serviceName} - GOV.UK`]));
  });
});
