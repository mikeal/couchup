var request = require('request').defaults({headers:{accept:'application/json'}})
  , jsonstream = require('JSONStream')
  , once = require('once')
  , async = require('async')
  , bytewise = require('bytewise')
  ;

function revint (rev) {
  var seq
  if (!rev) seq = 0
  else seq = parseInt(rev.slice(0, rev.indexOf('-')))
  if (isNaN(seq)) { console.error('BAD!'); seq = 0}
  return seq
}

function compactRevision (changes) {
  return changes.map(function (c) {return revint(c.rev)}).reduce(function (x,y) {return x+y}, 0)+changes[0].rev.slice(changes[0].rev.indexOf('-'))
}

function pull (db, url, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  var u = url
  cb = once(cb)
  if (url[url.length - 1] !== '/') url += '/'

  var json = jsonstream.parse('results.*')
    , success = 0
    ;

  var pending = []
    , writing = false
    ;

  function saveSequence (seq, cb) {
    db.mutex.put(bytewise.encode([db.name, 4, u]), seq, cb)
  }

  function writePending (cb) {
    var p = pending
    pending = []

    function onRow (row, cb) {
      row.doc._rev = compactRevision(row.changes)
      db.put(row.doc, {new_edits:false}, cb)
    }

    async.map(p, onRow, function (e, results) {
      if (e) {
        r.abort()
        return cb(e)
      }

      saveSequence(p[p.length - 1].seq, function (e) {
        if (e) {
          r.abort()
          return cb(e)
        }

        if (pending.length) {
          writePending(cb)
        } else {
          cb()
        }
      })
    })
  }

  json.on('data', function (row) {
    pending.push(row)
    if (!writing) {
      writing = true
      writePending(function (e) {
        if (e) throw e
        writing = false
      })
    }
  })

  var r = request(url+'_changes?style=all_docs&include_docs=true')
  r.on('response', function (resp) {
    // resp.on('data', function (c) {console.log(c.toString())})
    resp.pipe(json)
    resp.on('error', cb)
    json.on('error', cb)
    json.on('end', function () {
      cb(null)
    })
  })

}

module.exports = pull

