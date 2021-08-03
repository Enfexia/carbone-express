const mongoose = require("mongoose");

module.exports = () => {
  mongoose.connect("mongodb://db:27017/forge", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  mongoose.connection.on("open", () => {
    console.log("MongoDB: Connected");
  });
  mongoose.connection.on("error", (err) => {
    console.log("MongoDB: Error", err);
  });

  mongoose.Promise = global.Promise;
};
