import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req) {
  await connectToDB();
  const { username, password } = await req.json();

  // evitar duplicados
  const exists = await User.findOne({ username });
  if (exists) {
    return NextResponse.json(
      { error: "El usuario ya existe" },
      { status: 400 }
    );
  }

  const hashedPass = await bcrypt.hash(password, 10);

  await User.create({
    username,
    password: hashedPass,
  });

  return NextResponse.json({ message: "Usuario registrado" });
}
