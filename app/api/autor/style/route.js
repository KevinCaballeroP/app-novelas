import { NextResponse } from "next/server";
import { connectToDB as connectDB } from "@/lib/mongodb";
import AuthorStyle from "@/models/AuthorStyle";
export const runtime = "nodejs";

export async function POST(req) {
    try{
        await connectDB();
        const { novelId } = await req.json();
        if(!novelId) 
            return NextResponse.json({ error: "novelId is required" }, { status: 400 });
        const doc = await AuthorStyle.findOne({ novelId });
        if(!doc)
            return NextResponse.json({ error: "No style found for this novelId" }, { status: 404 });
        return NextResponse.json({ style: doc.style });
    } catch (err) {
        console.error("STYLE ERROR:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}