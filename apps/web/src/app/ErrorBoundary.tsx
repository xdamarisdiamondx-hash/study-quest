/**
 * The last line of P21 error reporting: a render error anywhere below shows
 * this instead of a blank page, records the failure in the local buffer, and
 * offers the two honest exits — reload, or take the diagnostics and go.
 *
 * A class component because React only supports error boundaries this way
 * (there is no hook equivalent), and it must sit OUTSIDE the router so a
 * crash in one route cannot unmount the whole tree without explanation.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

import { copyDiagnostics } from "../lib/diagnostics";
import { recordClientError } from "../lib/capture";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, copied: false };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    recordClientError("react", `${error.name}: ${error.message}`);
  }

  private copy = (): void => {
    void copyDiagnostics().then((ok) => this.setState({ copied: ok }));
  };

  override render(): ReactNode {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="sq-boundary" role="alert">
        <h1>Something went wrong</h1>
        <p>
          This screen hit an unexpected error. Your study data is safe — it lives on the
          server, and anything waiting to sync stays on this device until it does.
        </p>
        <p className="sq-boundary-detail">
          {error.name}: {error.message}
        </p>
        <div className="sq-boundary-actions">
          <button
            type="button"
            className="sq-btn sq-btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload the app
          </button>
          <button type="button" className="sq-btn sq-btn-secondary" onClick={this.copy}>
            {copied ? "Copied ✓" : "Copy diagnostics"}
          </button>
        </div>
      </div>
    );
  }
}
