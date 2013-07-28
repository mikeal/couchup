var util = require('util')
  , events = require('events')
  , levelup = require('levelup')
  , once = require('once')
  , lru = require('lru-cache')
  , uuid = require('node-uuid')
  , peek = require('level-peek')
  , http = require('./lib/http')
  , mutex = require('level-mutex')
  , crypto = require('crypto')
  , byteslice = require('byteslice')
  , bloomfilter = require('bloomfilter')
  , noop = function () {}
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
  // if (!opts.cacheSize) opts.cacheSize = 32 * 1024 * 1024
  // if (!opts.writeBufferSize) opts.cacheSize = 32 * 1024 * 1024
  this.opts = opts
  this.lev = levelup(opts.location, opts)
  this.mutex = mutex(this.lev)
  this._writes = []
  this.deferring = true
  this.databases = {}

  var opts =
    { start: this.bytes.encode([null])
    , end: this.bytes.encode([{}])
    }

  var reader = this.mutex.lev.createReadStream(opts)
  reader.on('data', function (data) {
    var key = self.bytes.decode([data.key])
    self.databases[key[0]] = new Database(self, key[0], data.value)
  })
  reader.on('end', function () {
    self.kick()
  })
}
util.inherits(Store, Deferring)
Store.prototype.bytes = byteslice(['_meta', 'couchup'])
Store.prototype.put = function (name, cb) {
  var self = this
  this.defer(function () {
    if (self.databases[name]) return cb(new Error("Database already exists."))
    self.mutex.put(self.bytes.encode([name]), 0, function (err) {
      if (err) return cb(err)
      return cb(null, self.databases[name])
    })
    self.databases[name] = new Database(self, name, 0)
  })
}
Store.prototype.get = function (name, cb) {
  var self = this
  this.defer(function () {
    if (!self.databases[name]) return cb(new Error('Database does not exist.'))
    cb(null, self.databases[name])
  })
}
Store.prototype.delete = function (name, cb) {
  var p = {}
    , self = this
    ;
  self.get(name, function (e, db) {
    if (e) return cb(e)
    db.deleteDatabase(cb)
  })
}

function hashdoc (doc) {
  if (doc._rev) {
    var rev = doc._rev
    delete doc._rev
  }
  var hash = crypto.createHash('md5').update(JSON.stringify(doc)).digest("hex")
  if (rev) {
    doc._rev = rev
  }
  return hash
}

function revint (rev) {
  var seq
  if (!rev) seq = 0
  else seq = parseInt(rev.slice(0, rev.indexOf('-')))
  if (isNaN(seq)) { console.error('BAD!'); seq = 0}
  return seq
}

function Database (store, name, seq) {
  this.store = store
  this.name = name
  this.mutex = mutex(store.lev)
  this.cache = lru()
  this.pending = []

  this.bytes = byteslice([name, 'couchup'])

  var self = this
  self.mutex.on('flushed', function () {
    self.pending = []
  })

  // get sequence
  //   because this is the first read sent to the mutex
  //   we'll be able to get the first sequence
  //   before we do any writes.

  var lastSeekOptions =
    { end: self.bytes.encode(['seq', {}])
    , start: self.bytes.encode(['seq', null])
    }

  self.mutex.peekLast(lastSeekOptions, function (e, key, info) {
    if (e) {
      self.sequence = 0
      self.doc_count = 0
    } else {
      key = self.bytes.decode(key)
      self.sequence = key[1]
      self.doc_count = info[1]
    }
    self.emit('init')
  })

  // start bloom filter
  if (typeof store.opts.bloom === 'undefined') {
    store.opts.bloom = {size: 64 * 256 * 256, hashes: 16}
  }
  if (store.opts.bloom) {
    var changes = self.sleep()
    self._bloom = new bloomfilter.BloomFilter(store.opts.bloom.size, store.opts.bloom.hashes)
    function onRow (row) {
      self._bloom.add(row.id)
    }
    self.on('change', onRow)
    changes.on('row', onRow)
    changes.on('end', function () {
      // Make sure we don't create documents that aren't in the bloom
      // filter before the sequence has been initialized.
      if (typeof self.sequence !== 'undefined') self.bloom = self._bloom
      else self.on('init', function () { self.bloom = self._bloom })
    })
  }
}
util.inherits(Database, events.EventEmitter)
Database.prototype.deleteDatabase = function (cb) {
  var self = this

  self.mutex.del(self.store.bytes.encode([self.name]), function () {
    var all = self.mutex.lev.createKeyStream(
        { start: self.bytes.encode([null])
        , end: self.bytes.encode([{}])
        })
      , count = 0
      ;
    all.on('data', function (rawkey) {
      self.mutex.del(rawkey, noop)
      count += 1
    })
    all.on('end', function () {
      delete self.store.databases[self.name]
      if (count === 0) cb(null)
      else self.mutex.afterWrite(function () {cb(null)})
    })
  })
}

Database.prototype.get = function (id, cb) {
  var self = this
  var opts =
    { start:self.bytes.encode(['docs', id, null])
    , end: self.bytes.encode(['docs', id, {}])
    }
  self.mutex.peekLast(opts, function (err, key, value) {
    if (err) return cb(new Error('Not found.'))
    if (value._deleted) return cb(new Error('Not found. Deleted.'))
    cb(null, value)
  })
}

Database.prototype.put = function (doc, opts, cb) {
  var self = this
  if (!cb) {
    cb = opts
    opts = {}
  }
  if (typeof doc._id !== 'string') doc._id = uuid()

  function _save (meta) {
    var seq
      ;
    // There is a question about whether or not this is necessary.
    // Because we don't store the whole rev tree metadata there isn't much that people
    // will do with revs that don't win.
    // But, I'm concerned that replication clients will write and then immediately read
    // the rev they just wrote, which will cause problems if we don't have it stored while they
    // replicate. Regardless, it'll be gone after compaction if it doesn't win.
    if (opts.new_edits === false) {
      // If the newedit rev wins (has more edits) write that rev as a new seq
      // If the newedit doesn't win write it to the document store
      // but don't write a sequence, use -1 as the sequence in meta
      var prev = revint(meta.rev)
        , curr = revint(doc._rev)
        ;
      if (curr === prev) {
        // string check (Q: is this compatible with other implementations?)
        if (meta.rev > doc._rev) {
          seq = -1
        } else {
          seq = self.sequence + 1
        }
      } else if (curr > prev) {
        seq = self.sequence + 1
      } else {
        seq = -1
      }
    } else {
      var prev = revint(meta.rev)
      doc._rev = prev + 1 + '-' + hashdoc(doc)
      seq = self.sequence + 1
    }

    meta.rev = doc._rev
    meta._deleted = doc._deleted
    meta.seq = seq
    meta.id = doc._id

    self.sequence = seq

    if (meta._deleted) self.doc_count = self.doc_count - 1
    else self.doc_count + 1

    // Write the new sequence
    if (seq !== -1) self.mutex.put(self.bytes.encode(['seq', meta.seq]), [meta, self.doc_count], noop)

    // Write an entry for this revision
    self.mutex.put(self.bytes.encode(['docs', doc._id, meta.seq, doc._rev, !!doc._deleted]), doc, function (e) {
      if (e) return cb(e)
      self.emit('change', meta)
      cb(null, meta)
    })

    // write cache and pending
    self.cache.set(doc._id, meta)
    self.pending.push(doc._id)
  }

  function _write (e, meta) {
    if (_checkPending()) return

    if (!e && opts.new_edits === false && meta.rev === doc._rev) cb(null, meta)
    else if (e || meta.rev === doc._rev || opts.new_edits === false) {
      _save(meta || {})
    } else {
      cb(new Error('rev does not match.'))
    }
  }

  function _checkPending () {
    // If a write on this document is already pending then
    // we *know* the rev is out of date.
    if (self.pending.indexOf(doc._id) !== -1) {
      if (opts.new_edits === false) self.meta(doc._id, _write)
      else cb(new Error('rev does not match.'))
      return true
    }
    return false
  }
  if (_checkPending()) return

  if (self.cache.has(doc._id)) {
    _write(null, this.cache.get(doc._id))
  } else if (self.bloom && !doc._rev && !self.bloom.test(doc._id)) {
    _write(true)
  } else {
    self.meta(doc._id, _write)
  }
}
Database.prototype.del = function (doc, cb) {
  if (!doc._id) return cb(new Error('must have _id.'))
  doc._deleted = true
  this.put(doc, cb)
}
Database.prototype.compact = function (cb) {
  var self = this
    , keys = self.store.lev.createKeyStream(
      { end: self.bytes.encode(['docs', null])
      , start: self.bytes.encode(['docs', {}])
      , reverse: true
      })
    , current = null
    , pending = null
    , count = 0
    ;
  keys.on('data', function (rawkey) {
    var key = self.bytes.decode(rawkey)
      , seq = key[2]
      , docid = key[1]
      ;

    if (current === docid) {
      self.mutex.del(self.bytes.encode(['seq', seq]), noop)
      self.mutex.del(rawkey, noop)
      count = count + 1
    }
    current = docid
  })
  keys.on('end', function () {
    if (count === 0) cb()
    else self.mutex.afterWrite(function () { cb(null, count) })
  })
}
Database.prototype.sleep = function (opts) {
  var self = this
  if (!opts) opts = {}
  // TODO: continuous
  // TODO: include_data
  var r = this.mutex.lev.createReadStream(
    { start: self.bytes.encode(['seq', opts.since || 0])
    , end: self.bytes.encode(['seq', {}])
    })
  r.on('data', function (row) {
    if (opts.include_data) {
      console.log(row)
      // self.mutex.peekLast(row)
    }
    r.emit('row', row.value[0])
  })
  return r
}
Database.prototype.delete = Database.prototype.del
Database.prototype.meta = function (id, cb) {
  var self = this
    , opts =
      { end: self.bytes.encode(['docs', id, {}])
      , start: self.bytes.encode(['docs', id, null])
      }
  self.mutex.peekLast(opts, function (err, key, value) {
    if (err) return cb(new Error('Not found.'))
    key = self.bytes.decode(key)
    cb(null, {_deleted: key[4], rev: key[3], id: id, seq: key[2]})
  })
}
Database.prototype.info = function (cb) {
  var self = this
  if (typeof this.sequence !== 'undefined') {
    cb(null, {update_seq:self.sequence, doc_count:self.doc_count})
  } else {
    self.on('init', function () { self.info(cb) })
  }
}
// Database.prototype.getSequences = function (opts) {
//   var self = this
//     , cachedRows = []
//     , ee = new events.EventEmitter()
//     ;
//   var r = this.mutex.lev.createReadStream(
//     { start: encode([this.name, 0, opts.since || null])
//     , end: encode([this.name, 0, {}])
//     })
//   function cacheRow (row) {
//     cachedRows.append(row)
//   }
//   function onRow (row) {
//     console.log(row)
//     // ee.emit('entry', {seq:row.seq, rev})
//   }
//   r.on('data', function (row) {
//     r.emit('row', row.value[0])
//   })
//   r.on('end', function () {
//     cachedRows.forEach(onRow)
//     self.removeListener('change', cacheRow)
//     if (opts.continuous) {
//       self.on('change', onRow)
//     }
//   })
// }

function couchup (filename) {
  return new Store({location:filename})
}

module.exports = couchup
module.exports.http = http