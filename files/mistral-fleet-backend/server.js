import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRoutes from "./src/routes.js";

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json());

app.use("/api", apiRoutes);

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Mistral Agents backend is running. This is an API server, not a page.",
    try: ["/health", "/api/agents", "/api/tasks", "/api/feed"],
  });
});

app.listen(PORT, () => {
  console.log(`Mistral Agents backend listening on http://localhost:${PORT}`);
  if (!process.env.MISTRAL_API_KEY) {
    console.warn("⚠️  MISTRAL_API_KEY is not set — copy .env.example to .env and add your key.");
  }
});
