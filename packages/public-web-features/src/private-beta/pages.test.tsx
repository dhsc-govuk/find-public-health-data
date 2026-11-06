// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import type { PrivateBetaData, PrivateBetaRequest } from './loader.ts';
import { PrivateBetaPage } from './pages.tsx';

afterEach(cleanup);

const data: PrivateBetaData = { ended: false, linkRejected: false, returnTo: '/topics' };

function renderPage(pageData: PrivateBetaData, request?: PrivateBetaRequest) {
  return render(
    <MemoryRouter>
      <PrivateBetaPage data={pageData} request={request} />
    </MemoryRouter>,
  );
}

describe('PrivateBetaPage', () => {
  it('asks for an email address, carrying the return address in the form', () => {
    const { container } = renderPage(data);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Sign in to the private beta',
    );
    expect(screen.getByLabelText('Email address').getAttribute('autocomplete')).toBe('email');
    expect(container.querySelector('input[name="returnTo"]')?.getAttribute('value')).toBe(
      '/topics',
    );
    expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy();
  });

  it('says when a sign-in link has expired or is not valid', () => {
    renderPage({ ...data, linkRejected: true });

    expect(screen.getByText(/That sign-in link has expired or is not valid/)).toBeTruthy();
  });

  it('shows the error against the field, keeping what was typed', () => {
    renderPage(data, {
      status: 'invalid',
      email: 'sam',
      error: 'Enter an email address in the correct format, like name@example.com',
    });

    expect((screen.getByLabelText(/Email address/) as HTMLInputElement).value).toBe('sam');
    expect(screen.getAllByText(/Enter an email address in the correct format/)).toHaveLength(2);
  });

  it('asks the visitor to check their email, offering another link', () => {
    renderPage(data, { status: 'requested', email: 'sam@example.com', link: undefined });

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Check your email');
    expect(screen.getByText('sam@example.com')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBe(null);
    expect(screen.getByRole('link', { name: 'ask for another link' }).getAttribute('href')).toBe(
      '/private-beta?returnTo=%2Ftopics',
    );
  });

  it('shows the link itself where there is no email service', () => {
    const link = 'http://localhost:3000/private-beta/sign-in?token=abc';
    renderPage(data, { status: 'requested', email: 'sam@example.com', link });

    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(link);
  });

  it('says the private beta has ended, whatever was asked', () => {
    renderPage(
      { ...data, ended: true },
      { status: 'requested', email: 'sam@example.com', link: undefined },
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'The private beta has ended',
    );
    expect(screen.queryByLabelText('Email address')).toBe(null);
  });
});
