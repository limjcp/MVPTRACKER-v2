import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  error?: Error;
  errorInfo?: React.ErrorInfo;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Keep console logging for devtools / logs
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    const { error, errorInfo } = this.state;
    if (!error) return this.props.children;

    const stack = String(errorInfo?.componentStack || '').trim();
    return (
      <div className="min-h-screen bg-[#0D0F14] text-white p-8">
        <div className="max-w-3xl rounded-2xl border border-red-500/25 bg-red-500/5 p-5">
          <p className="text-red-300 font-semibold">App crashed</p>
          <p className="mt-2 text-red-200/70 text-sm">{String(error.message || error)}</p>
          {stack ? (
            <pre className="mt-4 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/45 bg-black/30 border border-white/[0.06] rounded-xl p-3 overflow-auto max-h-[360px]">
              {stack}
            </pre>
          ) : null}
          <p className="mt-4 text-white/35 text-xs">
            Tip: after enabling devtools, check the console for the full stack trace.
          </p>
        </div>
      </div>
    );
  }
}

