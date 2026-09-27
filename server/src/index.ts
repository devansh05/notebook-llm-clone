import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import cors from "cors";
import { registerRoutes } from "./routes/index.js";
import { errorHandler } from "./middleware/error-handler-middlewares.js";
import "dotenv/config";

const PORT = process.env.PORT;

const clientUrl = process.env.CLIENT_URL ?? "http://localhost:3000";

const app = express();

app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  }),
);

// Mount body-parsing middleware after the Better Auth handler.
app.all("/api/auth/{*any}", toNodeHandler(auth));

app.use(express.json());

app.get("/", (req, res) => {
  res.send("route GET");
});

app.get("/health", (req, res) => {
  res.send("server healthy");
});

registerRoutes(app);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
