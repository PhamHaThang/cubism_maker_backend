import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import app from "./app.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

// Start server
const start = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`Cubism Maker Server running on http://localhost:${PORT}`);
    });
};

start();
