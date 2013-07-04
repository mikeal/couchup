var couchup = require('../')
  , cleanup = require('cleanup')
  , rimraf = require('rimraf')
  , assert = require('assert')
  , ok = require('okdone')
  , bytewise = require('bytewise')
  , uuid = require('node-uuid')
  ;

var d = cleanup(function (error) {
  rimraf.sync(__dirname+'/testdb')
  if (error) process.exit(1)
  ok.done()
})

function count (lev, cb) {
  var r = lev.createReadStream()
    , i = 0
    ;
  r.on('data', function (data) {console.log('left', bytewise.decode(data.key)); i = i + 1})
  r.on('end', function () {cb(null, i)})
  r.on('error', function (err) {cb(err)})
}

var c = couchup(__dirname+'/testdb')
c.put('test', function (e, db) {
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

            function write (i) {
              if (i > 100) return finish()
              db.put({_id:uuid(), test:2}, function (e, info) {
                write(i + 1)
              })
            }
            write(0)

            function finish () {
              db.put({_id:'asdf', test:2, _rev:'asdf'}, function (e, info) {
                assert.ok(e)
                ok('bad rev')
                c.delete('test', function (e) {
                  c.get('test', function (e) {
                    assert.ok(e)
                    count(c.lev, function (e, count) {
                      assert.equal(count, 0)
                      d.cleanup()
                    })
                  })
                })
              })
            }

          })
        })
      })
    })
  })
})