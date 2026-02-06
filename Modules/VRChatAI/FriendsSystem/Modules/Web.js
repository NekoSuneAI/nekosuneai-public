async function BOTAPIPOINT() {
  require("log-timestamp"); //npm log-timestamp
  const express = require("express");
  const bodyParser = require("body-parser");

  const app = express();

  app.use(
    bodyParser.urlencoded({
      extended: false
    })
  );
  app.use(bodyParser.json());

  var port = 9065;
  app.listen(port, () =>
    console.log(`App listening at http://localhost:${port}`)
  );

  app.get("/v4/self/get", async (req, res) => {
    const { GetSelf } = require("./VRChat");
    GetSelf().then(resp => {
      res.header("Access-Control-Allow-Origin", "*");
      res.contentType("application/json");
      res.json(resp);
    });
  });

  app.post("/v4/worldinstance/get", async (req, res) => {
    const { GetWorldInstance } = require("./VRChat");
    GetWorldInstance(req).then(resp => {
      res.header("Access-Control-Allow-Origin", "*");
      res.contentType("application/json");
      res.json(resp);
    });
  });

  app.post("/v4/world/get", async (req, res) => {
    const { GetWorld } = require("./VRChat");
    GetWorld(req).then(resp => {
      res.header("Access-Control-Allow-Origin", "*");
      res.contentType("application/json");
      res.json(resp);
    });
  });

  app.post("/v4/users/get", async (req, res) => {
    const { GetUser } = require("./VRChat");
    GetUser(req).then(resp => {
      res.header("Access-Control-Allow-Origin", "*");
      res.contentType("application/json");
      res.json(resp);
    });
  });

  app.post("/v4/inivte/public/send", async (req, res) => {
    const { InvPub } = require("./VRChat");
    if (req.body.senderUserId == "" || req.body.senderUserId == null) {
      res.header("Access-Control-Allow-Origin", "*");
      res.contentType("application/json");
      res.json({ status: 404, message: "You Missing `senderUserId` in BODY" });
    }
    InvPub(req).then(data => {
      res.header("Access-Control-Allow-Origin", "*");
      res.contentType("application/json");
      res.json(data);
    });
  });
}

module.exports = {
  BOTAPIPOINT
};
