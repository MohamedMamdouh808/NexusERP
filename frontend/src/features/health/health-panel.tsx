import { ERROR_CODES } from '@nexuserp/shared';

import { Card, Skeleton, StatusBadge } from '../../components/ui';
import { useHealth } from './use-health';

/**
 * The health status panel (T087).
 *
 * Three states, and each one says something true:
 *
 *   loading  - a skeleton, because an empty panel reads as "healthy with nothing
 *              to report" (T079)
 *   healthy  - the report, with the two checks attributed separately so a failure
 *              can be pointed at a component (FR-033)
 *   failed   - the message, the retry action, and the request identifier, so the
 *              person can quote it (T080). The cause is NOT guessed at: the service
 *              deliberately keeps it out of the response (FR-035), so inventing one
 *              here would be fiction.
 *
 * A 429 is a distinct state rather than a generic failure: the service has told the
 * client when to come back, and reporting "something went wrong" while ignoring
 * `Retry-After` would invite the user to hammer a limit that is still in force
 * (T049).
 */
export function HealthPanel() {
  const { data, isPending, isError, refetch } = useHealth();

  if (isPending) {
    return (
      <Card title="System health">
        <Skeleton label="Loading the system health report" />
      </Card>
    );
  }

  if (isError || data === undefined) {
    return (
      <Card title="System health">
        <div className="health-panel__error" role="alert">
          <p>The system health report could not be read.</p>
        </div>
        <button type="button" className="button" onClick={() => void refetch()}>
          Check again
        </button>
      </Card>
    );
  }

  if (data.kind === 'failed') {
    const { failure } = data;
    const isRateLimited = failure.status === 429 || failure.code === ERROR_CODES.TOO_MANY_REQUESTS;

    return (
      <Card title="System health">
        <div className="health-panel__error" role="alert">
          <p>{failure.message}</p>

          {isRateLimited && failure.retryAfterSeconds !== null && (
            <p className="health-panel__retry-after">
              Too many requests. Try again in {failure.retryAfterSeconds} seconds.
            </p>
          )}

          <p className="health-panel__request-id">
            Request identifier: <span className="mono">{failure.requestId}</span>
          </p>
        </div>

        <button type="button" className="button" onClick={() => void refetch()}>
          Check again
        </button>
      </Card>
    );
  }

  const { report } = data;
  const databaseOk = report.checks.database.status === 'ok';

  return (
    <Card title="System health">
      <div className="health-panel__summary">
        <StatusBadge tone="success">Healthy</StatusBadge>
        <span>Uptime {report.uptimeSeconds} seconds</span>
      </div>

      <ul className="health-panel__checks">
        <li className="health-panel__check">
          <span>Application</span>
          <StatusBadge tone={report.checks.application.status === 'ok' ? 'success' : 'warning'}>
            {report.checks.application.status}
          </StatusBadge>
        </li>
        <li className="health-panel__check">
          <span>Database</span>
          <span className="numeric-cell">
            {databaseOk ? `${report.checks.database.latencyMs} ms` : 'unavailable'}
          </span>
        </li>
      </ul>
    </Card>
  );
}