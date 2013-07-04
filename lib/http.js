var mapleTree = require('mapleTree')
  , _ = require('lodash')
  , crypto = require('crypto')
  , md5 = function (data){ return crypto.createHash('md5').update(data).digest('hex') }
  , async = require('async')
  , once = require('once')
  , uuid = require('node-uuid')
  ;

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
  console.error(e.stack)
  resp.statusCode = 500
  resp.end()
}

function json (resp, obj, statusCode) {
  var buffer = new Buffer(JSON.stringify(obj))
  resp.statusCode = statusCode || 200
  resp.setHeader('content-type', 'application/json')
  resp.setHeader('etag', obj._rev || md5(buffer))
  resp.setHeader('content-length', buffer.length)
  resp.end(buffer)
}

function build (store) {
  var tree = new mapleTree.RouteTree()
  function route (path, cb) {
    tree.define(path, function () {
      return cb
    })
  }
  route('/:db', function (r, req, resp) {
    if (req.method === 'PUT') {
      store.put(r.params.db, function (e, db) {
        if (e) return error(resp, e)
        json(resp, {ok:true}, 201)
      })
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      store.get(r.params.db, function (e, db) {
        if (e) return error(resp, e)
        // http://wiki.apache.org/couchdb/HTTP_database_API
        // {
        //    "compact_running": false,
        //    "db_name": "dj",
        //    "disk_format_version": 5,
        //    "disk_size": 12377,
        //    "doc_count": 1,
        //    "doc_del_count": 1,
        //    "instance_start_time": "1267612389906234",
        //    "purge_seq": 0,
        //    "update_seq": 4
        //  }
        db.info(function (e, info) {
          if (e) return error(resp, e)
          json(resp, _.extend({dbname: r.params.db}, info))
        })
      })
    } else if (req.method === 'POST') {
      var p =
        { body: body.bind(body, req)
        , db: store.get.bind(store, r.params.db)
        }
      async.parallel(p, function (e, results) {
        if (e) return error(resp, e)
        if (!results.body._id) results.body._id = uuid()
        results.db.put(results.body, function (e, info) {
          if (e) return error(resp, e)
          json(resp, info, 201)
        })
      })
    } else if (req.method === 'DELETE') {
      store.delete(r.params.db, function (e) {
        if (e) return error(resp, e)
        resp.statusCode = 201
        resp.end()
      })
    } else {
      // invalid http method
      resp.statusCode = 405
      resp.end()
    }
  })
  route('/:db/:doc', function (r, req, resp) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      store.get(r.params.db, function (e, db) {
        if (e) return error(resp, e)
        db.get(r.params.doc, function (e, doc) {
          if (e) return error(resp, e)
          json(resp, doc)
         })
      })
    }
  })
  return tree
}

function app (store) {
  var tree = build(store)
  function handler (req, res) {
    var match = tree.match(req.url)
    if (!match.fn) {
      res.statusCode = 404
      res.end()
      return
    }
    match.fn()(match, req, res)
  }
  return handler
}
module.exports = app