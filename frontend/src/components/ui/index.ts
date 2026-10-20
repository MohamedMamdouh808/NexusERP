/**
 * Reusable interface primitives built from the design system (T054).
 * Sourced entirely from design tokens via tokens.css and app.css.
 */

export * from './button';
export * from './input';
export * from './select';
export * from './textarea';
export * from './checkbox';
export * from './badge';
export * from './card';
export * from './data-table';
export * from './dialog';
export * from './confirm-dialog';
export * from './dropdown-menu';
export * from './toast';
export * from './skeleton';
export * from './empty-state';
export * from './error-state';
export * from './icon';

// Backwards compatibility aliases for health-panel
export { Badge as StatusBadge } from './badge';
