var replicate = require('../../lib/replicate')
  , couchup = require('../../')
  ;

var store = couchup(__dirname+'/testdb')

store.put('npm', function (e, db) {
  if (e) throw e
  replicate(db, 'http://isaacs.iriscouch.com/registry', function (e, i) {
    console.error(e, i)
  })
})