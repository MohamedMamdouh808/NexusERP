import { useState } from 'react';
import { COMPONENTS, STATE_MANIFEST } from './state-manifest';
import { FIXTURES } from './fixtures';
import { sampleCatalogService } from '../../services/sample-catalog-service';
import { Button, Card, Toast, ConfirmDialog } from '../../components/ui';

const GALLERY_SAMPLE_RECORD_ID = 'sample-0001';

export function GalleryRoute() {
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [simulateSlow, setSimulateSlow] = useState(false);
  const [simulateEmptyData, setSimulateEmptyData] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function toggleFailure() {
    const next = !simulateFailure;
    setSimulateFailure(next);
    sampleCatalogService.simulateFailure = next;
  }

  function toggleSlow() {
    const next = !simulateSlow;
    setSimulateSlow(next);
    sampleCatalogService.simulateSlowResponse = next;
  }

  function toggleEmptyData() {
    const next = !simulateEmptyData;
    setSimulateEmptyData(next);
    sampleCatalogService.simulateEmptyData = next;
  }

  return (
    <div
      data-testid="gallery-container"
      data-gallery="nexuserp-dev-gallery-route"
      style={{ padding: 'var(--spacing-xl)', maxWidth: '1200px', margin: '0 auto' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--spacing-xl)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 'var(--spacing-md)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>Component Gallery</h1>
          <p style={{ margin: 'var(--spacing-xs) 0 0', color: 'var(--color-muted-foreground)' }}>
            Exhaustive review of all design system primitives across declared states.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          <span className="sample-marker">Sample data</span>
          <Button variant={simulateFailure ? 'danger' : 'secondary'} onClick={toggleFailure}>
            {simulateFailure ? 'Disable Failures' : 'Simulate failure'}
          </Button>
          <Button variant={simulateSlow ? 'danger' : 'secondary'} onClick={toggleSlow}>
            {simulateSlow ? 'Disable Delay' : 'Simulate slow response'}
          </Button>
          <Button variant={simulateEmptyData ? 'danger' : 'secondary'} onClick={toggleEmptyData}>
            {simulateEmptyData ? 'Show sample data' : 'Simulate empty data'}
          </Button>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <Card title="Interactive Sandbox (In-Memory Mutation Demo)">
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmOpen(true);
              }}
            >
              Trigger Row Removal Dialog
            </Button>
            {toastMessage && (
              <Toast
                id="interactive-toast"
                tone="success"
                message={toastMessage}
                onDismiss={() => setToastMessage(null)}
              />
            )}
          </div>
        </Card>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          open={confirmOpen}
          destructive
          title="Delete Sample Record"
          description={`Are you sure you want to remove sample record ${GALLERY_SAMPLE_RECORD_ID}?`}
          actionLabel="Delete Sample Record"
          onClose={() => setConfirmOpen(false)}
          onConfirm={async () => {
            const res = await sampleCatalogService.removeRecord({ id: GALLERY_SAMPLE_RECORD_ID });
            setConfirmOpen(false);
            setToastMessage(`Removed record: ${res.removedLabel}`);
          }}
        />
      )}

      {COMPONENTS.map((componentName) => {
        const componentStates = Object.keys(STATE_MANIFEST[componentName]);

        return (
          <section
            key={componentName}
            style={{ marginBottom: 'var(--spacing-2xl)' }}
            data-testid={`gallery-section-${componentName.toLowerCase()}`}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: 'var(--spacing-xs)',
                marginBottom: 'var(--spacing-md)',
              }}
            >
              {componentName}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 'var(--spacing-md)',
              }}
            >
              {componentStates.map((state) => {
                const slot = `${componentName}.${state}` as keyof typeof FIXTURES;
                const renderer = FIXTURES[slot];

                return (
                  <div
                    key={state}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--spacing-md)',
                      background: 'var(--color-card)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 'var(--spacing-sm)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--color-muted-foreground)',
                      }}
                    >
                      State: <code>{state}</code>
                    </div>
                    <div style={{ padding: 'var(--spacing-xs) 0' }}>
                      {renderer ? (
                        renderer()
                      ) : (
                        <span style={{ color: 'var(--color-destructive)' }}>Missing fixture</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
