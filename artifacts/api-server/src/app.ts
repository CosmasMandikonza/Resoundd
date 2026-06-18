import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import router from "./routes";
import { authMiddleware } from "./middlewares/authMiddleware";
import { logger } from "./lib/logger";
import { mediaDir } from "./lib/analyze/mediaStore";

// Ensure the media directory exists on startup (best-effort).
const dir = mediaDir();
if (!existsSync(dir)) {
  mkdir(dir, { recursive: true }).catch(() => {
    logger.warn({ dir }, "Could not create media directory");
  });
}

const app: Express = express();

// Serve generated audio files (ElevenLabs TTS / LALAL stems) with the CORS
// header required by the Web Audio API AnalyserNode (crossOrigin='anonymous').
app.use(
  "/api/media",
  express.static(dir, {
    setHeaders(res) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// `credentials: true` lets the web app send the session cookie through the proxy.
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(authMiddleware);

app.use("/api", router);

export default app;
