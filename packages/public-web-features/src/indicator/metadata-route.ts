import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import type { IndicatorQuestion } from './loader.ts';
import {
  dataValueTitle,
  providerSourceText,
  rollingTimePeriodsText,
  updateFrequencyLine,
} from './metadata-data.ts';
import { indicatorPageContext } from './page-context.ts';
import { isIndicatorSegment, redirectStatus } from './paths.ts';
import { isUnanswered, NOT_ENTERED_YET } from './placeholders.ts';

export async function loadIndicatorMetadata({
  context,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  const slug = params.slug;
  if (!slug || !isIndicatorSegment(slug)) throw new Response('Not Found', { status: 404 });
  const { detailSchema, links } = context.get(indicatorPageContext);
  const detail = await context.get(apiContext).get(apiPath`/api/indicators/${slug}`, detailSchema);
  const metadataPath = links.metadata(detail.slug);
  if (detail.slug !== slug && metadataPath !== links.metadata(slug))
    throw redirect(metadataPath, redirectStatus(slug, detail.slug));
  // A preview's draft gives a question it hasn't answered as the page does.
  const answer = (question: IndicatorQuestion, value: string | null | undefined) =>
    isUnanswered(detail, question) ? NOT_ENTERED_YET : value;
  const entries = [
    ['Indicator', detail.name],
    ['Indicator ID', String(detail.shortId)],
    ['Definition', detail.definition],
    ['Rationale', detail.rationale],
    ['Value type', answer('valueType', detail.valueType)],
    ['Unit', answer('unit', detail.unit)],
    ['Time periods', answer('timePeriods', detail.timePeriods)],
    ['Rolling time periods', rollingTimePeriodsText(detail)],
    ['Update frequency', answer('updateFrequency', updateFrequencyLine(detail))],
    ['Data source', detail.dataSource?.name],
    ['Data source URL', detail.dataSource?.url],
    ['Numerator definition', detail.numeratorDefinition],
    ['Numerator sources', providerSourceText(detail.numeratorSources)],
    ['Numerator disclosure control', detail.numeratorDisclosureControl],
    ['Denominator definition', detail.denominatorDefinition],
    ['Denominator sources', providerSourceText(detail.denominatorSources)],
    ['Denominator disclosure control', detail.denominatorDisclosureControl],
    ...detail.dataValues.flatMap(({ definition, sources, disclosureControl }, index) => {
      const title = dataValueTitle(index, detail.dataValues.length);
      return [
        [`${title} definition`, definition],
        [`${title} sources`, providerSourceText(sources)],
        [`${title} disclosure control`, disclosureControl],
      ];
    }),
    ['How the indicator was calculated', detail.methodology],
    ['Confidence interval method', detail.ciMethod],
    ['Benchmarking method', detail.comparatorMethod],
    ['Caveats', detail.caveats],
    ['Notes', detail.notes],
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

export const loader = loadIndicatorMetadata;
