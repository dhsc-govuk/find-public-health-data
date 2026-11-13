import { indicatorDetailSchema } from '@fphd/public-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { providerSourceText, updateFrequencyText } from './metadata-data.ts';
import { indicatorMetadataPath, isIndicatorSegment, redirectStatus } from './paths.ts';

export async function loader({ context, params }: LoaderFunctionArgs): Promise<Response> {
  const slug = params.slug;
  if (!slug || !isIndicatorSegment(slug)) throw new Response('Not Found', { status: 404 });
  const detail = await context
    .get(apiContext)
    .get(apiPath`/api/indicators/${slug}`, indicatorDetailSchema);
  if (detail.slug !== slug)
    throw redirect(indicatorMetadataPath(detail.slug), redirectStatus(slug, detail.slug));
  const entries = [
    ['Indicator', detail.name],
    ['Indicator ID', String(detail.shortId)],
    ['Definition', detail.definition],
    ['Rationale', detail.rationale],
    ['Value type', detail.valueType],
    ['Unit', detail.unit],
    ['Year type', detail.yearType?.label],
    ['Update frequency', updateFrequencyText(detail)],
    ['Data source', detail.dataSource?.name],
    ['Data source URL', detail.dataSource?.url],
    ['Numerator definition', detail.numeratorDefinition],
    ['Numerator sources', providerSourceText(detail.numeratorSources)],
    ['Denominator definition', detail.denominatorDefinition],
    ['Denominator sources', providerSourceText(detail.denominatorSources)],
    ['Methodology', detail.methodology],
    ['Confidence interval method', detail.ciMethod],
    ['Benchmarking method', detail.comparatorMethod],
    ['Disclosure control', detail.disclosureControl],
    ['Notes', detail.notes],
    ['Caveats', detail.caveats],
  ];
  return new Response(
    `${entries
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n\n')}\n`,
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${detail.shortId}-metadata.txt"`,
      },
    },
  );
}
