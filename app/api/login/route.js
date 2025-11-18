import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req) {
  await connectToDB();
  const { username, password } = await req.json();

  const user = await User.findOne({ username });
  if (!user) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos" },
      { status: 400 }
    );
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos" },
      { status: 400 }
    );
  }

  return NextResponse.json({ message: "Login ok", username });
}
