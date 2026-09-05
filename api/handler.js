import server from "../server/server.cjs";

export function createHandler(options = {}) {
  let app;
  const handler = async (req, res) => {
    try {
      // The rewrite carries the API path explicitly so it survives platform
      // routing. Board and other query parameters stay on the request.
      const url = new URL(req.url, "http://localhost");
      const route = url.searchParams.get("route");
      if (route !== null) {
        url.pathname = `/api/${route}`;
        url.searchParams.delete("route");
        req.url = url.pathname + url.search;
      }
      app ||= server.createApp({ ...options, serverless: true });
      await app.handler(req, res);
    } catch (error) {
      console.error("API initialization failed:", error.code || error.name);
      if (!res.headersSent) {
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(
          JSON.stringify({
            error:
              "The service is not configured or is temporarily unavailable. Please retry.",
          }),
        );
      } else res.end();
    }
  };
  handler.close = () => app?.close();
  return handler;
}
export default createHandler();
