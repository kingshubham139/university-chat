// ===============================
// Imports
// ===============================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

// ===============================
// Models
// ===============================
const User = require("./models/user");
const Message = require("./models/message");
const Group = require("./models/group");

// ===============================
// App & Server
// ===============================
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // later you can restrict to Netlify URL
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// ===============================
// Middleware
// ===============================
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// ===============================
// Root Health Check
// ===============================
app.get("/", (req, res) => {
  res.send("University Chat Backend is running 🚀");
});

// ===============================
// MongoDB Connection
// ===============================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ===============================
// AUTH: Register
// ===============================
app.post("/register", async (req, res) => {
  try {
    const { username, password, groupName } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.json({ success: false, msg: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let group = await Group.findOne({ groupName });
    if (!group) {
      await Group.create({ groupName, createdBy: username });
    } else {
      group.membersCount += 1;
      await group.save();
    }

    const user = await User.create({
      username,
      password: hashedPassword,
      groupName
    });

    res.json({ success: true, user });
  } catch (err) {
    res.json({ success: false, msg: "Registration failed" });
  }
});

// ===============================
// AUTH: Login
// ===============================
app.post("/login", async (req, res) => {
  const { username, password, groupName } = req.body;

  const user = await User.findOne({ username, groupName });
  if (!user) {
    return res.json({ success: false, msg: "Invalid credentials" });
  }

  if (user.isBlocked) {
    return res.json({ success: false, msg: "You are blocked by admin" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.json({ success: false, msg: "Wrong password" });
  }

  res.json({ success: true, user });
});

// ===============================
// ADMIN: Login
// ===============================
app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;

  const admin = await User.findOne({ username, role: "admin" });
  if (!admin) {
    return res.json({ success: false });
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res.json({ success: false });
  }

  res.json({ success: true });
});

// ===============================
// ADMIN: Messages
// ===============================
app.get("/admin/messages", async (req, res) => {
  const messages = await Message.find().sort({ createdAt: -1 });
  res.json(messages);
});

app.delete("/admin/message/:id", async (req, res) => {
  await Message.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ===============================
// Socket.IO (Real-time Chat)
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 User connected");

  socket.on("join", (groupName) => {
    socket.join(groupName);
  });

  socket.on("send", async (data) => {
    const msg = await Message.create({
      text: data.text,
      sender: data.sender,
      groupName: data.groupName
    });

    io.to(data.groupName).emit("receive", msg);
  });

  socket.on("delete", async (id) => {
    await Message.findByIdAndDelete(id);
    io.emit("deleted", id);
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected");
  });
});

// ===============================
// Start Server (Railway Safe)
// ===============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
