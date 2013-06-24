
The goal is to support the entire CouchDB API that is not specific to the Apache CouchDB implementation. Examples of features that will not be supported are _config and Erlang views.

A quick writeup on early performance comparisons with Apache CouchDB (very promising) https://gist.github.com/mikeal/5847297

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

