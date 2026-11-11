import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { DataSection } from './data-section.tsx';

it('puts deferred content in the initial HTML without a loading fallback', async () => {
  const html = await new Promise<string>((resolve, reject) => {
    const body = new PassThrough();
    let html = '';
    body.setEncoding('utf8');
    body.on('data', (chunk) => {
      html += chunk;
    });
    body.on('end', () => resolve(html));
    const { pipe } = renderToPipeableStream(
      <MemoryRouter>
        <DataSection label="data" resolve={Promise.resolve({ value: 'Complete table' })}>
          {({ value }) => <p>{value}</p>}
        </DataSection>
      </MemoryRouter>,
      { onAllReady: () => pipe(body), onError: reject },
    );
  });
  expect(html).toContain('Complete table');
  expect(html).not.toContain('Loading');
  expect(html).not.toContain('<template');
});
