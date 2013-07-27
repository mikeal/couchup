var replicate = require('../../lib/couch-replicate')
  , couchup = require('../../')
  ;

var store = couchup(__dirname+'/npmdb')

store.put('npm', function (e, db) {
  if (e) throw e

  replicate(db, 'http://isaacs.iriscouch.com/registry', function (e, i) {
    if (e) throw e
  })
})