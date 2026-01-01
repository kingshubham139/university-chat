// ================= IMPORTS =================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

// ================= MODELS =================
const User = require("./models/user");
const Message = require("./models/message");
const Group = require("./models/group");

// ================= APP =================
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(cors());

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.send("University Chat Backend Running 🚀");
});

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error(err));

// ================= AUTH =================
app.post("/register", async (req, res) => {
  const { username, password, groupName } = req.body;

  if (await User.findOne({ username }))
    return res.json({ success: false, msg: "User exists" });

  const hash = await bcrypt.hash(password, 10);

  let group = await Group.findOne({ groupName });
  if (!group) await Group.create({ groupName, createdBy: username });
  else { group.membersCount++; await group.save(); }

  const user = await User.create({
    username,
    password: hash,
    groupName
  });

  res.json({ success: true, user });
});

app.post("/login", async (req, res) => {
  const { username, password, groupName } = req.body;

  const user = await User.findOne({ username, groupName });
  if (!user) return res.json({ success: false, msg: "Invalid login" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ success: false, msg: "Wrong password" });

  if (user.isBlocked)
    return res.json({ success: false, msg: "Blocked by admin" });

  res.json({ success: true, user });
});

// ================= ADMIN =================
app.get("/admin/messages", async (req, res) => {
  res.json(await Message.find().sort({ createdAt: -1 }));
});

app.delete("/admin/message/:id", async (req, res) => {
  await Message.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ================= SOCKET.IO =================
const onlineUsers = {}; // groupName -> count

io.on("connection", (socket) => {
  socket.on("join", (groupName) => {
    socket.join(groupName);
    onlineUsers[groupName] = (onlineUsers[groupName] || 0) + 1;
    io.to(groupName).emit("online", onlineUsers[groupName]);
  });

  socket.on("send", async (data) => {
    const msg = await Message.create({
      text: data.text,
      sender: data.sender,
      groupName: data.groupName,
      createdAt: new Date()
    });

    io.to(data.groupName).emit("receive", msg);
  });

  socket.on("typing", (data) => {
    socket.to(data.groupName).emit("typing", data.username);
  });

  socket.on("delete", async (data) => {
    const msg = await Message.findById(data.id);
    if (msg && msg.sender === data.username) {
      await Message.findByIdAndDelete(data.id);
      io.to(data.groupName).emit("deleted", data.id);
    }
  });

  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (onlineUsers[room]) {
        onlineUsers[room]--;
        io.to(room).emit("online", onlineUsers[room]);
      }
    }
  });
});

// ================= START =================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
