require('dotenv').config();
let mysql = require('mysql');

dbConnection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
}),

module.exports = {



  // MySQL keeps disconnecting if it is inactive for a period of time,
  // In order to avoid that, this function will be pinging it each hour or so
  StartServerPokingRoutine: function(){
    PokeServer();
  }, 

  dbConnect: function(){
    dbConnection.connect(function(err) {
      if (err) throw err;
      console.log("Connected to database!");
    });
  },

  AddServer: function(server, ResultCallback){
    var sql = "SELECT * FROM `servers` WHERE `dscr_id` = " + server.id;
    dbConnection.query(sql, function (err, result, fields) {
      if (err) throw err;
      if(result == ""){
        InsertServer(server);
        ResultCallback(true);
      }
      else{
        console.log("Server already exists in database.");
        ResultCallback(false);
      }
    });
  },

  AddUser: function(serverID, userID, ResultCallback){
    // Get server FK ID. If server does not exist, FK will be -1
    this.GetServerFK(serverID, FK => {
      if(FK >= 0){
        this.DoesUserExistInDB(userID, serverID, userExists => {
          if(userExists === true){
            ResultCallback("User already exists");
          }
          else{
            AddUserToDB(userID, FK);
            ResultCallback("OK"); 
          }
        });
      }
      else{
        console.log("Tried accessing server which does not exist in database.");
        ResultCallback("Server not found");
      }
    });
  },

  GetServerFK: function(serverID, CallbackFK){
    var sqlServerID = "SELECT `id` FROM `servers` WHERE `dscr_id` = " + serverID;
    dbConnection.query(sqlServerID, function (err, result, fields) {
      if (err) throw err;
      if(result != ""){
        CallbackFK(result[0].id);
      }
      else{
        CallbackFK(-1);
      }
    });
  },
  
  DoesUserExistInDB: function(userID, serverID, ExistsCallback){
    var sql = "SELECT `users`.`id` FROM `users`, `servers` WHERE `servers`.`dscr_id` = " + serverID + 
    " AND `users`.`server_fk` = `servers`.`id` AND `users`.`dscr_id` = " + userID;
    dbConnection.query(sql, function (err, result, fields) {
      if (err) throw err;
      if(result == ""){
        ExistsCallback(false);
      }
      else{
        ExistsCallback(true);
      }
    });
  },

  GetUserStats: function(userID, serverID, ResultsCallback){
    var sql = "SELECT `user_stats`.`id`, `user_stats`.`honored`, `user_stats`.`spare_honors` " + 
              "FROM `users`, `servers`, `user_stats` " +
              "WHERE `servers`.`dscr_id` = " + serverID + " " +
              "AND `users`.`server_fk` = `servers`.`id` " + 
              "AND `users`.`dscr_id` = " + userID + " " +
              "AND `user_stats`.`user_fk` = `users`.`id`";
    dbConnection.query(sql, function (err, result, fields) {
      if (err) throw err;
      if(result != ""){
        ResultsCallback(result[0]);
      }
      else{
        ResultsCallback(null);
      }
    });
  },

  GiveHonorPoints: function(senderID, receiverID, serverID, amount, statusCallback){
    this.GetUserStats(senderID, serverID, senderStats =>{
      this.GetUserStats(receiverID, serverID, receiverStats =>{
        // at this point, both stats should exist.
        if(senderStats.spare_honors < amount){
          statusCallback("NotEnoughSparePoints");
        }
        else{
          var sqlGivePoints = "UPDATE `user_stats` SET `honored` = " + (receiverStats.honored + parseInt(amount)) + " WHERE `user_stats`.`id` = " + receiverStats.id + ";"; 
          var sqlTakePoints = "UPDATE `user_stats` SET `spare_honors` = " + (senderStats.spare_honors - parseInt(amount)) + " WHERE `user_stats`.`id` = " + senderStats.id + ";";
          dbConnection.query(sqlGivePoints, function (err, result) {
            if (err) throw err;
          });
          dbConnection.query(sqlTakePoints, function (err, result){
            if (err) throw err;
          });
          console.log(receiverID + " has been honored");
          statusCallback("OK");
        }
      });
    });
  },
  
};





function PokeServer(){
  setInterval(() => {
    var sql = "SELECT `name` FROM `users` WHERE `users`.`id` = 1";
    dbConnection.query(sql, function (err, result, fields) {
      if (err) throw err;
      var date = new Date();
      var printMessage =  "[" + date.getDate() + "/" + date.getMonth() + "/" + date.getFullYear() +
                          " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + "] " + 
                          "Ping... Selected name: " + result[0].name;
      console.log(printMessage);
    });
  }, 14400000);// Pinging each 4 hours
}

function InsertServer(server){
  var sqlInsertServConf =  "INSERT INTO `server_conf` (`id`, `admin_role`) VALUES (NULL, NULL);";
  dbConnection.query(sqlInsertServConf, function (err_ins_conf, result_ins_conf) {
    if (err_ins_conf) throw err_ins_conf;

    var sqlInsertServer = "INSERT INTO `servers` (`id`, `dscr_id`, `admin_fk`, `server_conf_fk`) VALUES (NULL, '" + 
                          server.id + "', NULL, '" + result_ins_conf.insertId + "');";

    dbConnection.query(sqlInsertServer, function(err_ins_server, result_ins_server){
      if(err_ins_server) throw err_ins_server;
      console.log("Server was added to database.");

      InsertServerOwner(server.owner, result_ins_server.insertId);
    });
  });
}

function InsertServerOwner(serverOwner, serverTableID){
  // Might do user insert inside AddUser function, but it needs a callback.
  // I am leaving it as is for now
  var sqlInsertServConf =  "INSERT INTO `users` (`id`, `name`, `dscr_id`, `server_fk`) VALUES " +
  "(NULL, '" + serverOwner.user.tag + "', '" + serverOwner.id + "', '" + serverTableID + "');";
  dbConnection.query(sqlInsertServConf, function (err_ins_usr, result_ins_usr) {
    if (err_ins_usr) throw err_ins_usr;
    console.log("Main admin was added to DB.");

    // Update server admin fk
    var sqlUpdateServ = "UPDATE `servers` SET `admin_fk` = '" + result_ins_usr.insertId + "' WHERE `servers`.`id` = " + serverTableID;
    dbConnection.query(sqlUpdateServ, function (err_upd_serv, result_upd_serv) {
      if (err_upd_serv) throw err_upd_serv;
      console.log(result_upd_serv.affectedRows + " record(s) updated");
    });

    // Insert into user_stats table
    AddUserStatsRow(result_ins_usr.insertId);
  });
}

function AddUserToDB(userID, serverID){
  var sqlInsertUser =  "INSERT INTO `users` (`id`, `name`, `dscr_id`, `server_fk`) VALUES " +
  "(NULL, '" + userID + "', '" + userID + "', '" + serverID + "');";
  dbConnection.query(sqlInsertUser, function (error, result) {
    if (error) throw error;
    AddUserStatsRow(result.insertId);
    console.log("New user was added to users DB.");
  });
}

function AddUserStatsRow(userFK){
  var sqlInsertUStats = "INSERT INTO `user_stats` (`id`, `user_fk`, `honored`, `spare_honors`) " +
  "VALUES (NULL, '" + userFK + "', '0', '15');";
  dbConnection.query(sqlInsertUStats, function (err_ins_ustats, result_ins_ustats) {
    if (err_ins_ustats) throw err_ins_ustats;
  });
}

