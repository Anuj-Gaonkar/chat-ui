import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json(
        {
            status: "ok",
            timeStamp: new Date().toISOString(),
            uptime: process.uptime,
            publicKeyPath: process.env.NEXT_PUBLIC_ENCRYPTION_PUBLIC_KEY ?? null,
        },
        {status: 200},  
    );
}