import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
} from "node:http";
import { connect, type Socket } from "node:net";
import { resolvePublicTarget } from "./url-policy";

// Enforce the destination at connection time, including browser-followed redirects.
// Use the validated IP directly so a second DNS lookup cannot change the peer.
export async function createCaptureProxy(
  trustedOrigin: string | undefined,
  onBlock: (url: string) => void,
) {
  const sockets = new Set<Socket>();
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    return socket;
  };
  const target = async (input: string) => {
    const url = new URL(input);
    if (
      trustedOrigin &&
      url.origin === trustedOrigin &&
      url.pathname.startsWith("/reference/")
    ) {
      return { url, address: "127.0.0.1" };
    }
    return resolvePublicTarget(input);
  };
  const server = createServer(async (req, res) => {
    const input = req.url || "";
    try {
      if (!["GET", "HEAD"].includes(req.method || ""))
        throw new Error("Method blocked");
      const { url, address } = await target(input);
      if (url.protocol !== "http:") throw new Error("Protocol blocked");
      if (req.destroyed || res.destroyed) return;
      const headers: IncomingHttpHeaders = { ...req.headers, host: url.host };
      delete headers["proxy-connection"];
      delete headers["proxy-authorization"];
      const upstream = httpRequest(
        {
          hostname: address,
          port: url.port || 80,
          path: url.pathname + url.search,
          method: req.method,
          headers,
          agent: false,
        },
        (response) => {
          res.writeHead(response.statusCode || 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("socket", track);
      upstream.setTimeout(15000, () => upstream.destroy());
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      res.on("close", () => upstream.destroy());
      req.pipe(upstream);
    } catch {
      onBlock(input);
      res.writeHead(403);
      res.end("Destination blocked");
    }
  });
  server.on("connection", track);
  server.on("connect", async (req, client, head) => {
    const input = "https://" + req.url;
    try {
      // Only HTTPS's standard destination port is supported.
      if (!req.url?.endsWith(":443")) throw new Error("Port blocked");
      const { address } = await resolvePublicTarget(input);
      if (client.destroyed) return;
      const upstream = track(connect({ host: address, port: 443 }));
      upstream.setTimeout(15000, () => upstream.destroy());
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
      client.on("close", () => upstream.destroy());
      upstream.on("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
    } catch {
      onBlock(input);
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
