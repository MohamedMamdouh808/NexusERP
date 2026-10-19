import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence for a render failure (T088).
 *
 * It must not print the error: a stack trace in the interface is the same leak the
 * API is forbidden from making in a response body (FR-026). It states what
 * happened, offers a reload, and nothing else.
 */
interface State {
  readonly failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the developer's channel, not the user's. It is also the only
    // place this may appear, mirroring the rule the structured logger follows.
    console.error('interface render failure', error.name, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="app-shell__content" role="alert">
          <h1>Something went wrong</h1>
          <p>The interface could not be displayed. Reloading usually resolves this.</p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}