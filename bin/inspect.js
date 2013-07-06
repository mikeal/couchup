var couchup = require('../')
  , bytewise = require('bytewise')
  ;

if (process.argv.length < 3) throw new Error('must supply a leveldb filename')
var filename = process.argv[process.argv.length - 1]

var store = couchup(filename)

var range = store.lev.createKeyStream({start:null, end:{}})

var databases = 0
  , meta = 0
  , current = null
  ;

function print () {
  var str = current.split(',')
  if (str[1] === '0') {
    str[1] = 'sequences'
  } else if (str[1] === '1') {
    str[1] = 'documents'
  }
  console.log(str[0], str[1], meta)
}

range.on('data', function (obj) {
  var key = bytewise.decode(obj)
  if (key[0] === 0) {
    databases += 1
  } else {
    if (current === null) {
      console.log('databases', databases)
      current = key[0]+','+key[1]
    }
    if (current !== key[0]+','+key[1]) {
      print()
      current = key[0]+','+key[1]
      meta = 0
    }
    meta += 1
  }

})
range.on('end', function () {
  print()
})