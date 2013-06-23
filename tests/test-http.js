var couchup = require('../')
  , path = require('path')
  , http = require('http')
  , request = require('request')
  , assert = require('assert')
  , cleanup = require('cleanup')
  , rimraf = require('rimraf')
  , ok = require('okdone')
  , port = 5984
  , url = 'http://localhost:'+port
  ;

var d = cleanup(function (error) {
  rimraf.sync(__dirname+'/testdb')
  if (error) return process.exit(1)
  server.close()
  ok.done()
})

var server = http.createServer(couchup.http(couchup(path.join(__dirname, 'testdb'))))
server.listen(port, function () {
  request.put(url+'/testdb', function (e, resp, body) {
    if (e) throw e
    assert.equal(resp.statusCode, 201)
    ok('create database')
    request.get(url+'/testdb', function (e, resp, body) {
      if (e) throw e
      assert.equal(resp.statusCode, 200)
      ok('get database')
      request.post(url+'/testdb', {json:{test:1}}, function (e, resp, info) {
        if (e) throw e
        assert.equal(resp.statusCode, 201)
        assert.ok(info)
        ok('create document')
        request.get(url+'/testdb/'+info.id, {json:true}, function (e, resp, doc) {
          if (e) throw e
          assert.equal(resp.statusCode, 200)
          assert.ok(doc)
          assert.ok(doc._id, info.id)
          assert.ok(doc._rev, info.rev)
          ok('get document')
          d.cleanup()
        })
      })
    })
  })
})