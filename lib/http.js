


function body (req, cb) {
  var chunks = []
    , size = 0
    ;
  cb = once(cb)
  req.on('data', function (chunk) {
    chunks.push(chunk)
    size = size + chunk.length
  })
  req.on('end', function () {
    var b = Buffer.concat(chunks)
      , obj = JSON.parse(b.toString())
      ;
    cb(null, obj)
  })
  req.on('error', function (e) {
    cb(e)
  })
}

function error (resp, e) {
  resp.statusCode = 500
  resp.end()
}

function json (resp, obj) {
  resp.statusCode = 200
  resp.setHeader('content-type', 'application/json')
  resp.end(JSON.stringify(obj))
}

function http (store) {
  var tree = new mapleTree.RouteTree()
  function route (path, cb) {
    tree.define(path, function () {
      return cb.bind(cb, this)
    })
  }
  route('/:db', function (r, req, resp) {
    if (req.method === 'PUT') {
      store.createDatabase(r.params.db, function (e, resp) {
        if (e) return error(resp, e)
        json(resp, {ok:true})
      })
    }
  })
}