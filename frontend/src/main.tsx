import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import './styles/app.css';
import './i18n';
import { restorePreferences } from './lib/theme';
import { restoreLanguage } from './i18n';
import { ErrorBoundary } from './app/error-boundary';
import { createQueryClient } from './app/query-client';
import { router } from './app/router';

// Apply the saved theme/density before React renders, and the saved language
// with its direction and lang attribute - the first paint is already in the
// chosen language, never a flash of the wrong one.
restorePreferences();
restoreLanguage();

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