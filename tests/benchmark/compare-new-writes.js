var request = require('request')
  , exec = require('child_process').exec
  , http = require('http')
  , assert = require('assert')
  , concastack = require('concastack')
  , duration = 60 * 1000
  , parallel = 10
  ;

http.globalAgent.maxSockets = parallel

function test (str, port, cb) {

  put(port, function () {
    startTest(port, str)
    setTimeout(function () {
      stopTest(str, function () {
        deleteDatabase(port, function () {
          cb()
        })
      })
    }, duration)
  })
}

function put (port, cb) {
  request.put('http://localhost:'+port+'/test-benchmark', {json:true}, function (e, resp, body) {
    if (e) throw e
    assert(resp.statusCode, 201)
    cb(null, body)
  })
}

function deleteDatabase (port, cb) {
  request.del('http://localhost:'+port+'/test-benchmark', {json:true}, function (e, resp, body) {
    if (e) throw concastack(e, new Error())
    assert(resp.statusCode, 201)
    cb(null, body)
  })
}

var testRunning = false
  , writes = 0
  , inflight = 0
  ;

function startTest (port, cb) {
  testRunning = true

  function go () {
    request.post('http://localhost:'+port+'/test-benchmark', {json:{test:1}}, function (e, resp, body) {
      if (!testRunning) return inflight = inflight - 1
      if (e) throw concastack(e, new Error())
      assert.equal(resp.statusCode, 201)
      writes = writes + 1
      go()
    })
  }

  for (var i=0;i<parallel + 1;i++) {
    go()
    inflight = inflight + 1
  }
}

function stopTest (str, cb) {
  testRunning = false

  function wait () {
    setTimeout(function () {
      if (inflight !== 0) {
        console.log('waiting on ', inflight, 'clients')
        wait()
      } else {
        console.log(str, writes, 'writes')
        writes = 0
        cb()
      }
    }, 100)
  }
  wait()
}

function test_couchdb (port, cb) {
  test('Apache CouchDB', port, cb)
}

function test_couchup (port, cb) {
  test('couchup', port, cb)
}

test_couchdb(5984, function () {
  test_couchup(5985, function () {
    process.exit()
  })
})