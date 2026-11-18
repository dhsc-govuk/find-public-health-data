import { useLocation } from 'react-router';
import { DownloadShareData } from '../download-share.tsx';
import { useIndicatorLinks } from './links.ts';

export function IndicatorViewDownload({ slug, tab }: { slug: string; tab: string }) {
  const { search } = useLocation();
  const links = useIndicatorLinks();
  const params = new URLSearchParams(search);
  params.set('tab-indicator', tab);
  return (
    <DownloadShareData
      inline
      href={`${links.csv(slug, 'table')}?${params}`}
      allDataHref={`${links.csv(slug, 'all-data')}?allAreas=yes`}
      metadataHref={links.metadata(slug)}
    />
  );
}
