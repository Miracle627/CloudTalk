// 默认文件名 worker.ts  —— Cloudflare 识别入口
export interface Env {
  CHAT_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const nick = url.searchParams.get("nick") || "anon";
      const id = env.CHAT_ROOM.idFromName("public"); // 单房间
      const room = env.CHAT_ROOM.get(id);
      return room.fetch(req.clone(), { headers: { "x-nick": nick } });
    }
    return new Response("WebSocket endpoint: /ws?nick=NICK");
  },
};

export class ChatRoom {
  private sessions: Map<WebSocket, string> = new Map();

  async fetch(request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    const nick = request.headers.get("x-nick") || "anon";
    this.handleSession(server, nick);
    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(ws: WebSocket, nick: string): void {
    ws.accept();
    this.sessions.set(ws, nick);
    this.broadcast({ type: "join", nick });
    ws.addEventListener("message", ({ data }) => {
      try {
        const msg = JSON.parse(data as string);
        if (msg.type === "chat") {
          this.broadcast({ type: "chat", nick, text: msg.text });
        }
      } catch {}
    });
    ws.addEventListener("close", () => {
      this.sessions.delete(ws);
      this.broadcast({ type: "leave", nick });
    });
  }

  broadcast(obj: any): void {
    const msg = JSON.stringify(obj);
    this.sessions.forEach((_, ws) => {
      try { ws.send(msg); } catch { ws.close(); }
    });
  }
}