import '@fphd/ui/styles.scss';

import { AppDocument, AppShell, createDocumentMeta, RootErrorBoundary } from '@fphd/ui';
import { href, Outlet } from 'react-router';

export const Layout = AppDocument;
export const meta = createDocumentMeta();

const navigation = [
  { href: href('/'), text: 'Home' },
  { href: href('/search'), text: 'Search' },
  { href: href('/topics'), text: 'Topics' },
];

export default function PublicApp() {
  return (
    <AppShell audience="Public" navigation={navigation}>
      <Outlet />
    </AppShell>
  );
}

export function ErrorBoundary() {
  return <RootErrorBoundary audience="Public" navigation={navigation} />;
}
