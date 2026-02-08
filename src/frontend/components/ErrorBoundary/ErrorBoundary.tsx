import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-900 text-white h-screen overflow-auto">
          <h1 className="text-xl font-bold mb-2">Something went wrong.</h1>
          <details className="whitespace-pre-wrap">
            <summary>Error Details</summary>
            <p className="font-mono mt-2">
              {this.state.error && this.state.error.toString()}
            </p>
            <p className="font-mono text-xs mt-2 text-gray-300">
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </p>
          </details>
          <button
            className="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 rounded"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
