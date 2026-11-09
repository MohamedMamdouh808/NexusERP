/**
 * The sample-data banner (T061, FR-041, FR-044).
 *
 * Every surface whose module has no backend yet carries this banner, read from
 * `src/config/real-modules.ts` - the one switchboard that says which modules
 * are backed by the service. A module marked real renders no banner, so a later
 * backend feature is ONE line in that config plus deleting its sample rows.
 *
 * Two texts, by session state:
 *
 *  - Signed out (or mid-probe): the short, long-standing "Sample data" marker
 *    the design system documents.
 *  - Signed in: the honest sentence required by the auth feature - the sample
 *    rows on screen belong to sample data only, never to the real organization
 *    the top bar names.
 *
 * The banner is static text: it is never keyed by the real organization or
 * user, and it never claims the sample rows are theirs.
 */

import { useSession } from '../../services/auth-session';
import { isSampleModule } from '../../config/real-modules';

export const SAMPLE_BANNER_SIGNED_IN_TEXT =
  'Sample data - this module is not connected yet; nothing shown here belongs to your organization';

export interface SampleDataBannerProps {
  /** The module the banner describes; omit for an unkeyed sample surface. */
  readonly moduleKey?: string;
}

export function SampleDataBanner({ moduleKey }: SampleDataBannerProps) {
  const session = useSession();
  // An unkeyed banner is always sample: only the switchboard can retire one.
  if (moduleKey !== undefined && !isSampleModule(moduleKey)) return null;

  const sampleText = session.status === 'signed-in' ? SAMPLE_BANNER_SIGNED_IN_TEXT : 'Sample data';
  return (
    <div className="sample-banner" data-module={moduleKey}>
      {sampleText}
    </div>
  );
}
