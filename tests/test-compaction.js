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

var store = couchup(__dirname+'/testdb')

function storelength (cb) {
  var l = 0
  var s = store.lev.createKeyStream()
  s.on('data', function () {l += 1})
  s.on('end', function () {cb(null, l)})
  s.on('error', cb)
}

store.put('db', function (e, db) {
  var i = 0
    , rev
    ;
  function write (e, meta) {
    if (e) throw e
    i += 1
    if (i === 100) return compact()
    var doc = {_id:'testid', test:1}
    if (meta) doc._rev = meta.rev
    db.put(doc, write)
  }
  write()

  function compact () {
    ok('writes')
    db.mutex.afterWrite(function () {
      storelength(function (e, l) {
        db.compact(function (e, m) {
          assert.equal(m, 98)
          ok('compact')
          storelength(function (e, l) {
            assert.equal(3, l)
            ok('length')
            d.cleanup()
          })
        })
      })
    })
  }
})

ok.expect(3)

