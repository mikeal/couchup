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

function count (lev, cb) {
  var r = lev.createReadStream()
    , i = 0
    ;
  r.on('data', function () { i = i + 1})
  r.on('end', function () {cb(null, i)})
  r.on('error', function (err) {cb(err)})
}

var c = couchup(__dirname+'/testdb')
c.put('test', function (e, db) {
  if (e) throw e
  ok('create db')
  db.put({_id:'asdf', test:1}, function (e, info) {
    if (e) throw e
    db.delete({_id:'asdf'}, function (e) {
      assert.ok(e)
      ok('delete')
      db.delete({_id:'asdf', _rev:info.rev}, function (e) {
        db.get('asdf', function (e, info) {
          assert.ok(e)
          ok('removed')
          count(db.store.lev, function (e, num) {
            if (e) throw e
            assert.equal(num, 5)
            ok('size')
            d.cleanup()
            // db.compact(function (e) {
            //   if (e) throw e
            //   count(db.store.lev, function (e, num) {
            //     assert.equal(1, num)
            //   })
            // })
          })
        })
      })
    })
  })
})