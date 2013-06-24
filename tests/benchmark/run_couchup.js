var couchup = require('../..')
  , store = couchup(__dirname+'/testdb')
  , rimraf = require('rimraf')
  , http = require('http')
  , port = parseInt(process.argv[process.argv.length - 1])
  ;

var server = http.createServer(couchup.http(store))
server.listen(port, function () {
  console.log('listening on port '+port)
})