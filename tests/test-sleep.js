var couchup = require('../')
  , cleanup = require('cleanup')
  , rimraf = require('rimraf')
  , assert = require('assert')
  , ok = require('okdone')
  , bytewise = require('bytewise')
  , uuid = require('node-uuid')
  , async = require('async')
  , sleepref = require('SLEEP')
  , http = require('http')
  ;

var d = cleanup(function (error) {
  rimraf.sync(__dirname+'/testdb')
  if (error) process.exit(1)
  ok.done()
  process.exit()
})

ok.expect(4)

function count (lev, cb) {
  var r = lev.createReadStream()
    , i = 0
    ;
  r.on('data', function (data) {console.log('left', bytewise.decode(data.key)); i = i + 1})
  r.on('end', function () {cb(null, i)})
  r.on('error', function (err) {cb(err)})
}

function writeThings (prefix, c, cb) {
  async.map([0,1,2,3,4,5,6,7,8,9], function (i, cb) {
    c.put({_id:prefix+i, test:i}, cb)
  }, cb)
}

function testServers (db, db2) {
  writeThings('new', db, function () {
    var s = sleepref(db.sleep.bind(db))

    http.createServer(s.httpHandler.bind(s)).listen(8080, function () {
      db2.pull('http://localhost:8080', function (e) {
        if (e) throw e
        ok('pull')
        assert.equal(db.doc_count, db2.doc_count)
        ok('matching count')
        d.cleanup()
      })
    })

  })
}

var c = couchup(__dirname+'/testdb')
c.put('db', function (e, db) {
  if (e) throw e

  writeThings('test1', db, function (x) {
    var changes = db.sleep({since:2})
    var len = 0
      , lastSeq = 0
      ;
    changes.on('entry', function (entry) {
      assert.ok(entry.seq > lastSeq)
      lastSeq = entry.seq
      len += 1
      if (len === 2) {
        db.put({_id:"testmiddle", test:1}, function (e) {
          if (e) throw e
        })
      }
    })
    changes.on('end', function () {
      assert.equal(len, 10)
      ok('changes')
      c.put('db2', function (e, db2) {
        db2.clone(db, function (e) {
          assert.equal(db2.doc_count, db.doc_count)
          ok('clone')
          testServers(db, db2)
        })
      })
    })
  })

})



//
//
// c.put('test', function (e, db) {
//   if (e) throw e
//   ok('create db')
//   db.put({_id:'asdf', test:1}, function (e, info) {
//     if (e) throw e
//     db.get('asdf', function (e, doc) {
//       if (e) throw e
//       assert.equal(doc.test, 1)
//       assert.equal(doc._rev, info.rev)
//       ok('write 1')
//       db.put({_id:'asdf', test:2, _rev:info.rev}, function (e, info) {
//         if (e) throw e
//         db.get('asdf', function (e, doc) {
//           if (e) throw e
//           assert.equal(doc.test, 2)
//           assert.equal(doc._rev, info.rev)
//           ok('write 2')
//           db.put({_id:'asdf', test:2}, function (e, info) {
//             assert.ok(e)
//             ok('no _rev')
//
//             function write (i) {
//               if (i > 100) return finish()
//               db.put({_id:uuid(), test:2}, function (e, info) {
//                 write(i + 1)
//               })
//             }
//             write(0)
//
//             function finish () {
//               db.put({_id:'asdf', test:2, _rev:'asdf'}, function (e, info) {
//                 assert.ok(e)
//                 ok('bad rev')
//                 c.delete('test', function (e) {
//                   c.get('test', function (e) {
//                     assert.ok(e)
//                     count(c.lev, function (e, count) {
//                       assert.equal(count, 0)
//                       d.cleanup()
//                     })
//                   })
//                 })
//               })
//             }
//
//           })
//         })
//       })
//     })
//   })
// })