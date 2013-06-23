var couchup = require('../')
  , cleanup = require('cleanup')
  , rimraf = require('rimraf')
  , assert = require('assert')
  , ok = require('okdone')
  ;

var d = cleanup(function (error) {
  rimraf.sync(__dirname+'/testdb')
  if (error) process.exit(1)
  ok.done()
})

var c = couchup(__dirname+'/testdb')
c.createDatabase('test', function (e, db) {
  if (e) throw e
  ok('create db')
  db.put({_id:'asdf', test:1}, function (e, info) {
    if (e) throw e
    db.get('asdf', function (e, doc) {
      if (e) throw e
      assert.equal(doc.test, 1)
      assert.equal(doc._rev, info.rev)
      ok('write 1')
      db.put({_id:'asdf', test:2, _rev:info.rev}, function (e, info) {
        if (e) throw e
        db.get('asdf', function (e, doc) {
          if (e) throw e
          assert.equal(doc.test, 2)
          assert.equal(doc._rev, info.rev)
          ok('write 2')
          db.put({_id:'asdf', test:2}, function (e, info) {
            assert.ok(e)
            ok('no _rev')
            db.put({_id:'asdf', test:2, _rev:'asdf'}, function (e, info) {
              assert.ok(e)
              ok('bad rev')
              d.cleanup()
            })
          })
        })
      })
    })
  })
})