
The goal is to support the entire CouchDB API that is not specific to the Apache CouchDB implementation. Examples of features that will not be supported are _config and Erlang views.

A quick writeup on early performance comparisons with Apache CouchDB (very promising) https://gist.github.com/mikeal/5847297

## Why CouchDB?

The roots of CouchDB's storage layer and data model go back a little more than 20 years to Lotus Notes. This data model is idea for peer-to-peer replication and for the ability to take a database offline, write and read to it for some time, and then sync it back up with any number of peers over an indefinite time span.

There is a lot of focus out there on distributed databases and the operations you can and cannot do in a distributed fashion. CouchDB's goals are different but it has, in my opinion, achieved them to a greater degree than any other modern database.

While the new **NodeBase** movement is coming up with a lot of great new ideas it's worth stealing a few of the best ones and for peer-to-peer sync the best ideas live in CouchDB.

While this project will implement the visible portion of CouchDB's API it will not try to directly copy CouchDB's internal storage format, append-only btree, and some of the other implementation specifics (sparse sequence index on every write, view generation at read time). Also, while it is currently unclear among other node and level libraries what the best interface might be for accessing a database (local node.js api, socket, HTTP) this project will first provide a good API in node.js for locally accessing all the database operations as well as an HTTP API that is compatible with Apache CouchDB's. Once this project stabilizes this gives people a simple migration path and it allows this project to measure its performance and feature set directly against CouchDB.

This library will also stick to conventional node.js patterns and that includes keeping things tiny and modular. This module and its README will serve as a progress list for compatibility but a lot of the functionality will be built with extensions in other libraries. This library will *only* include the storage layer, database primitives, and document store, and an HTTP API for extending routes in other libraries. Indexes such as views as well as replication clients will be built as other related libraries.

### Checklist

First box is for a local node API, second box is for the compatible HTTP interface.

#### Instance

- [x] [ ] all db
- [ ] [ ] server info

#### Database

- [x] [x] db info
- [x] [x] db create
- [ ] [ ] all docs
- [ ] [ ] bulk docs

#### Documents

- [x] [x] write
- [x] [x] get
- [x] [ ] delete

#### Views

- [ ] [ ] map
- [ ] [ ] reduce (w/o storage)
- [ ] [ ] builtin reduce
- [ ] [ ] reduce (w/ storage)

#### Replication

- [ ] [ ] _changes

### Divergences

CouchDB and TouchDB both store and replicate the revision info for the full revision tree. They don't store all of the bodies, especially after compaction, but they do store a tree of all the revs of every replica they've replication with. This has always been intended to be used by application developers who would like to resolve conflicts in a more application specific way than the default "most edits wins" model that *all* couch compatible databases **MUST** implement (otherwise different nodes would come to different conclusions about which document is the current winner when there is a conflict).

Being that the vast majority of people using CouchDB compatible data stores don't poll for _conflicts and resolve them, relying instead on the default "most edits wins" model, `couchup` has decided not to store the full revision tree for other replicas.

All revisions written to a couchup node are stored unless compaction. The latest rev from any replica is stored even if it doesn't *win* but the rev tree of other nodes is not stored, only the latest revision, and no sequence index is written for revisions that don't with (they are only retrievable by querying for the document at that specific revision).

This tradeoff makes couchup a much better storage system for documents that have a high update ration, especially when there are many documents that all have high update ratios. It means that compaction will bring the overall size of the database back down to what it would be if all updated documents were new. The downside is that application authors who want to use the rev tree of replicated nodes to do more advanced conflict resolution won't have access to a replicated rev tree.

*It should also be noted that even Apache CouchDB has a maximum number of revisions that are stored before being "stemmed", without some kind of limit the metadata could grow to be exponentially larger than the actual document data.*


