import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import levelRoutes from "./routes/levels.js";
import favoriteRoutes from "./routes/favorites.js";

const app = express();

const corsOrigins = (process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }

            if (corsOrigins.length === 0 || corsOrigins.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    }),
);

app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/levels", levelRoutes);
app.use("/api/favorites", favoriteRoutes);

app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
