const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },

  sender: {
    type: String,
    required: true
  },

  groupName: {
    type: String,
    required: true
  },

  deletedByUser: {
    type: Boolean,
    default: false
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Message", MessageSchema);
