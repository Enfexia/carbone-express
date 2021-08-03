const mongoose = require("mongoose");
const Report = require("./report").schema;

var Schema = mongoose.Schema;

var reports = new Schema({
  title: String,
  date: Date,
  uid: String,
  filename: String,
  totalGeneratedReports: Number,
  fileSize: Number,
  averageGenerationTime: Number,
  report: [Report],
});

module.exports = mongoose.model("reports", reports);
