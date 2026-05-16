import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import levelRoutes from "./routes/levels.js";
import favoriteRoutes from "./routes/favorites.js";
import adminRoutes from "./routes/admin.js";

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
app.get("/", (_req, res) => {
    res.json({
        status: "API is running...",
        timestamp: new Date().toISOString(),
    });
});
app.use("/api/auth", authRoutes);
app.use("/api/levels", levelRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
