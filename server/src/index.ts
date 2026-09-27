import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";

import "dotenv/config";

const app = express();

const PORT = process.env.PORT;

// Mount body-parsing middleware after the Better Auth handler.
app.all("/api/auth/{*any}", toNodeHandler(auth));

app.use(express.json());

app.get("/", (req, res) => {
  res.send("route GET");
});

app.get("/health", (req, res) => {
  res.send("server healthy");
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
