import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount between cases so a query cannot match a node left behind by the
// previous one - a passing test that reads yesterday's DOM proves nothing.
afterEach(() => {
  cleanup();
});