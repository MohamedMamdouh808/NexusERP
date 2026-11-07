import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import './styles/app.css';
import { restorePreferences } from './lib/theme';
import { ErrorBoundary } from './app/error-boundary';
import { createQueryClient } from './app/query-client';
import { router } from './app/router';

// Apply the saved theme/density/direction before React renders so the first
// paint matches the user’s preference instead of flashing light mode.
restorePreferences();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('The #root element is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);