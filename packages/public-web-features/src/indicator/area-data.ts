import {
  type IndicatorAreaData,
  indicatorAreaDataListSchema,
  indicatorAreaDataSchema,
  pickAreaCodes,
} from '@fphd/public-api-features/contract';
import { type ApiClient, apiPath } from '@fphd/web-server/api-client';

const singleAreaSchema = indicatorAreaDataSchema.transform((one) => [one]);

/**
 * One indicator's data for the given areas, asking only for the codes the API accepts. The API
 * answers a single code with a bare object, so a code it ignored would change the answer's shape.
 */
export async function loadAreaData(
  api: ApiClient,
  indicator: string,
  codes: string[],
): Promise<IndicatorAreaData[]> {
  const accepted = pickAreaCodes(codes, Number.POSITIVE_INFINITY);
  if (accepted.length === 0) return [];
  return api.get(
    `${apiPath`/api/indicators/${indicator}/data`}?${accepted
      .map((code) => `areaCode=${encodeURIComponent(code)}`)
      .join('&')}`,
    accepted.length === 1 ? singleAreaSchema : indicatorAreaDataListSchema,
  );
}
