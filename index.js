var util = require('util')
  , events = require('events')
  , levelup = require('levelup')
  , mapleTree = require('mapleTree')
  , bytewise = require('bytewise')
  , once = require('once')
  , lru = require('lru-cache')
  , uuid = require('node-uuid')
  , peek = require('level-peek')
  ;

var encode = bytewise.encode
  , decode = bytewise.decode
  ;

function Deferring () {
  this.deferred = []
}
util.inherits(Deferring, events.EventEmitter)
Deferring.prototype.defer = function (fn) {
  if (this.deferring) this.deferred.push(fn)
  else fn()
}
Deferring.prototype.kick = function () {
  this.deferring = false
  while (this.deferred.length) {
    this.deferred.shift()()
  }
}

function Store (opts) {
  Deferring.call(this)
  var self = this
  opts.keyEncoding = 'binary'
  opts.valueEncoding = 'json'
  this.opts = opts
  this.lev = levelup(opts.location, opts)
  this._writes = []
  this.deferring = true
  this.databases = {}

  var opts =
    { start: encode([0, null])
    , end: encode([0, {}])
    }
  var reader = this.lev.createReadStream(opts)
  reader.on('data', function (data) {
    var key = decode(data.key)
    self.databases[key[2]] = new Database(self, key[2], data.value)
  })
  reader.on('end', function () {
    self.kick()
  })
}
util.inherits(Store, Deferring)
Store.prototype.createDatabase = function (name, cb) {
  var self = this
  this.defer(function () {
    if (self.databases[name]) return cb(new Error("Database already exists."))
    self._write({type:'put', key:[0, name], value:0}, function (err) {
      if (err) return cb(err)
      return cb(null, self.databases[name])
    })
    self.databases[name] = new Database(self, name, 0)
  })
}
Store.prototype.getDatabase = function (name, cb) {
  var self = this
  this.defer(function () {
    if (!this.databases[name]) return cb(new Error('Database does not exist.'))
    cb(null, this.databases[name])
  })
}
Store.prototype._write = function (obj, cb) {
  var self = this
  cb = cb ? once(cb) : function () {}
  this._writes.push([obj, cb])
  if (!this._nt) {
    setImmediate(function () {
      self._batch(self._writes)
      self._writes = []
      self._nt = false
    })
    this._nt = true
  }
}
Store.prototype._batch = function (writes) {
  var _writes = writes.map(function (w) {
    var r = w[0]
    if (r.key) r.key = encode(r.key)
    return r
  })
  this.lev.batch(_writes, function (err) {
    if (err) writes.forEach(function (w) { w[1](err) })
    else writes.forEach(function (w) { w[1](null) })
  })
}

function Mutex (database, seq) {
  Deferring.call(this)
  this.database = database
  this.sequence = seq
  this.cache = lru()
}
util.inherits(Mutex, Deferring)
Mutex.prototype.clear = function () {
  var self = this
  if (this.deferring) return
  this.deferring = true
  this.cache = lru()
  this.database.store.lev.get(encode([0, this.database.name]), function (e, seq) {
    // TODO: how and why would we get an error here and what is the best way to handle it
    if (e) throw e
    self.sequence = seq
    self.kick()
  })
}
Mutex.prototype.put = function (doc, cb) {
  var self = this
  self.defer(function () {self.write(doc, cb)})
}
Mutex.prototype.write = function (doc, cb) {
  var self = this
  if (this.cache.has(doc._id)) {
    self._write(this.cache.get(doc._id), doc, cb)
  } else {
    this.database.meta(doc._id, function (e, meta) {
      if (e) return self._write({id:doc._id}, doc, cb)
      self._write(meta, doc, cb)
    })
  }
}
Mutex.prototype._write = function (meta, doc, cb) {
  var rev = meta.rev
  if (rev !== doc._rev) return cb(new Error('rev does not match.'))
  if (!rev) doc._rev = '1-'+uuid()
  else {
    var seq = parseInt(rev.slice(0, rev.indexOf('-')))
    if (isNaN(seq)) { console.error('BAD!'); seq = 1}
    doc._rev = (seq + 1)+'-'+uuid()
  }
  if (!meta.revs) meta.revs = []

  meta.rev = doc._rev

  // Cache the sequence change
  this.sequence = this.sequence + 1
  meta.revs.push([this.sequence, doc._rev])

  // Update the database sequence
  this.database.store._write(
    { type: 'put'
    , key: [0, this.database.name]
    , value: this.sequence
    }
  )

  if (meta.seq) {
    // Remove previous sequence
    this.database.store._write(
      { type: 'delete'
      , key: [this.database.name, 0, this.sequence]
      }
    )
  }
  meta.seq = this.sequence

  // Write the new sequence
  this.database.store._write(
    { type: 'put'
    , key: [this.database.name, 0, this.sequence]
    , value: meta
    }
  )

  // Update the document metadata
  this.database.store._write(
    { type: 'put'
    , key: [this.database.name, 1, doc._id]
    , value: meta
    }
  )
  this.cache.set(doc._id, meta)

  // Write an entry for this revision
  this.database.store._write(
    { type: 'put'
    , key: [this.database.name, 1, doc._id, this.sequence, doc._rev]
    , value: doc
    }
    , this.callback({id:doc._id, rev:doc._rev, seq:this.sequence}, cb) // This is only necessary once since batch() will err for all.
  )

}
Mutex.prototype.callback = function (info, cb) {
  var self = this
    , ret = function (err) {
        if (err) {
          self.clear()
          cb(err)
        } else {
          cb(null, info)
        }
      }
    ;
  return ret
}

function Database (store, name, seq) {
  this.store = store
  this.name = name
  this.mutex = new Mutex(this, seq)
}
util.inherits(Database, events.EventEmitter)
Database.prototype.get = function (key, cb) {
  peek.last(this.store.lev, {end: encode([this.name, 1, key, {}])}, function (err, key, value) {
    if (err) return cb(err)
    throw new Error('no implemented')
  })
}
Database.prototype.put = function (obj, cb) {
  if (!obj._id) return cb(new Error('must have _id.'))
  this.mutex.put(obj, function (e, info) {
    console.log(e, info)
  })
}
Database.prototype.meta = function (key, cb) {
  this.store.lev.get(encode([this.name, 1, key]), cb)
}

function couchup (filename) {
  return new Store({location:filename})
}

module.exports = couchup