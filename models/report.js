const mongoose = require("mongoose");

var Schema = mongoose.Schema;

var report = new Schema({
  title: String,
  uid: String,
  filename: String,
  date: Date,
  totalDownloads: Number,
  fileSize: Number,
  averageGenerationTime: Number,
});

module.exports = mongoose.model("report", report);
