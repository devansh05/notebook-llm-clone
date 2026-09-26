import express from "express";
import "dotenv/config";

const app = express();

const PORT = process.env.PORT;

app.get("/", (req, res) => {
  res.send("route GET");
});

app.get("/health", (req, res) => {
  res.send("server healthy");
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
