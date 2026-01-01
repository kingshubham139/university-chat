const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const User = require("./models/user");
const Message = require("./models/message");
const Group = require("./models/group");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("✅ MongoDB Connected"));

/* ---------- AUTH ---------- */
app.post("/register", async (req,res)=>{
  const { username,password,groupName } = req.body;
  if(await User.findOne({username}))
    return res.json({success:false,msg:"User exists"});

  const hash = await bcrypt.hash(password,10);

  let group = await Group.findOne({groupName});
  if(!group) await Group.create({groupName,createdBy:username});
  else { group.membersCount++; await group.save(); }

  const user = await User.create({
    username,password:hash,groupName
  });

  res.json({success:true,user});
});

app.post("/login", async (req,res)=>{
  const { username,password,groupName } = req.body;
  const user = await User.findOne({username,groupName});
  if(!user) return res.json({success:false});

  if(user.isBlocked)
    return res.json({success:false,msg:"Blocked"});

  const ok = await bcrypt.compare(password,user.password);
  if(!ok) return res.json({success:false});

  res.json({success:true,user});
});

/* ---------- SOCKET ---------- */
io.on("connection",(socket)=>{
  socket.on("join",group=>socket.join(group));

  socket.on("send",async data=>{
    const msg = await Message.create(data);
    io.to(data.groupName).emit("receive",msg);
  });

  socket.on("delete",async id=>{
    await Message.findByIdAndDelete(id);
    io.emit("deleted",id);
  });
});

/* ---------- ADMIN ---------- */
app.post("/admin/login", async(req,res)=>{
  const { username,password } = req.body;
  const admin = await User.findOne({username,role:"admin"});
  if(!admin) return res.json({success:false});

  const ok = await bcrypt.compare(password,admin.password);
  res.json({success:ok});
});

app.get("/admin/messages", async(req,res)=>{
  res.json(await Message.find());
});

app.delete("/admin/message/:id", async(req,res)=>{
  await Message.findByIdAndDelete(req.params.id);
  res.json({success:true});
});

/* ---------- START ---------- */
server.listen(process.env.PORT||3000,()=>{
  console.log("🚀 Server running");
});
