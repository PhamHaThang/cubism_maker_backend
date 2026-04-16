import mongoose from "mongoose";

let isConnected = false;

export const connectDB = async (): Promise<void> => {
    if (isConnected || mongoose.connection.readyState === 1) {
        isConnected = true;
        return;
    }

    try {
        const mongoURI =
            process.env.MONGODB_URI || "mongodb://localhost:27017/cubism-maker";
        await mongoose.connect(mongoURI);
        isConnected = true;
        console.log("MongoDB connected successfully");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        throw error;
    }
};
