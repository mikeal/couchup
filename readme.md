
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

