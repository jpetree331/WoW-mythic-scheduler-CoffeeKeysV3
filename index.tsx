import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="panel m-6" role="alert">
        <h1 className="text-xl font-bold">This view could not be displayed.</h1>
        <p className="my-3">
          Your saved data and form drafts are preserved. Refresh the page to
          retry.
        </p>
        <button className="btn" onClick={() => location.reload()}>
          Refresh page
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
