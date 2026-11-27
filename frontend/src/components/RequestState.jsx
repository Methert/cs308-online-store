export function Loading({ children = 'Loading...' }) {
  return <p className="request-state" role="status"><span className="loading-dot" aria-hidden="true" />{children}</p>;
}

export function RequestError({ message, onRetry, retryLabel = 'Try again', busy = false }) {
  return <div className="request-error" role="alert">
    <p>{message}</p>
    {onRetry && <button className="secondary" type="button" disabled={busy} onClick={onRetry}>{retryLabel}</button>}
  </div>;
}
