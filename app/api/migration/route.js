import { connectToDB } from "@/lib/mongodb";
import User from "@/models/User";
import { Novel } from "@/models/Novel";

await connectToDB();

const novels = await Novel.find();

for (const n of novels) {
  const u = await User.findOne({ username: n.author });

  if (u) {
    n.author = u._id;
    await n.save();
    console.log("Migrado:", n.title);
  } else {
    console.log("Sin usuario:", n.author);
  }
}
