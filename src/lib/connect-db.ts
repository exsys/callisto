import dotenv from "dotenv";
dotenv.config();
import mongoose, { Mongoose } from "mongoose";
import { postDbErrorWebhook } from "./util";

const MONGODB_URI: string | undefined = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    throw new Error("DB not defined");
}

declare global {
    var mongoose: {
        promise: Promise<Mongoose> | null;
        conn: Mongoose | null;
    };
}

let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectDb() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
            return mongoose;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        await postDbErrorWebhook(e);
        cached.promise = null;
        throw e;
    }

    console.log("DB connected");
    return cached.conn;
}

export default connectDb;