var express = require('express');
var fs = require('fs');
var https = require('httpolyglot');
var path = require('path');

const options = {
    key: fs.readFileSync('./etc/ssl/key.pem', 'utf-8'),
    cert: fs.readFileSync('./etc/ssl/cert.pem', 'utf-8')
}
const PORT = 8080

const app = express();
const httpsServer = https.createServer(options,app);
httpsServer.listen(PORT, () => {
    console.log('listening on port: ' + PORT)
  })

app.use('/',express.static(path.join(__dirname, 'public')))