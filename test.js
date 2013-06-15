var couchup = require('./index')
  , cleanup = require('cleanup')
  , rimraf = require('rimraf')
  , assert = require('assert')
  ;

var d = cleanup(function (error) {
  rimraf.sync(__dirname+'/testdb')
  if (error) process.exit(1)
})

var c = couchup(__dirname+'/testdb')
c.createDatabase('test', function (e, db) {
  if (e) throw e
  db.put({_id:'asdf', test:1}, function (e, info) {
    if (e) throw e
    db.get('asdf', function (e, doc) {
      if (e) throw e
      assert.equal(doc.test, 1)
      assert.equal(doc._rev, info.rev)
      db.put({_id:'asdf', test:2, _rev:info.rev}, function (e, info) {
        if (e) throw e
        db.get('asdf', function (e, doc) {
          if (e) throw e
          assert.equal(doc.test, 2)
          assert.equal(doc._rev, info.rev)
          d.cleanup()
        })
      })
    })
  })
})