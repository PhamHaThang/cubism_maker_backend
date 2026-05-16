/**
 * Migration: set reviewStatus = "approved" for legacy levels missing the field.
 *
 * Usage: tsx scripts/migrate-review-status-approved.ts
 */
import dotenv from "dotenv";
import { connectDB } from "../src/config/db.js";
import { Level } from "../src/models/Level.js";

dotenv.config();

const main = async () => {
    await connectDB();

    const filter = {
        $or: [{ reviewStatus: { $exists: false } }, { reviewStatus: null }],
    };

    const total = await Level.countDocuments(filter);
    console.log(`Found ${total} levels missing reviewStatus.`);

    if (total === 0) {
        console.log("Nothing to migrate.");
        process.exit(0);
    }

    const result = await Level.updateMany(filter, [
        {
            $set: {
                reviewStatus: "approved",
                reviewedAt: { $ifNull: ["$publishedAt", "$updatedAt"] },
            },
        },
    ]);

    const matched = (result as any).matchedCount ?? result.n ?? 0;
    const modified = (result as any).modifiedCount ?? result.nModified ?? 0;

    console.log(`Done. Matched: ${matched}, Updated: ${modified}.`);
    process.exit(0);
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
