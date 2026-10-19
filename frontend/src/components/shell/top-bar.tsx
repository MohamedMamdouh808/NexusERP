/**
 * Top bar (T086, T077).
 *
 * The organization switcher and user menu are PLACEHOLDERS, and they must be
 * honest about it: they render as labelled status, not as controls. A dropdown
 * that opens and does nothing, or a name that is silently absent, is worse than
 * an explicit "not available yet" - the first implies a working feature, the
 * second tells the truth.
 *
 * The design system requires the tenant name to be always visible in the top bar
 * so a user always knows which organization they are acting in. Until
 * authentication exists there is no tenant, so the placeholder itself carries that
 * label and is announced to assistive technology.
 */
export function TopBar() {
  return (
    <header className="app-shell__topbar">
      <span className="top-bar__brand">NexusERP</span>

      <div className="top-bar__placeholders">
        <span className="shell-placeholder" data-testid="organization-placeholder">
          <span className="shell-placeholder__label">Organization:</span>
          <span>None available yet</span>
        </span>

        <span className="shell-placeholder" data-testid="user-placeholder">
          <span className="shell-placeholder__label">Signed in as:</span>
          <span>No user available yet</span>
        </span>
      </div>
    </header>
  );
}