let ReadStream = require('./FlowReadStream.js');
let WriteStream = require('./WriteStream');
let rs = new ReadStream('./demo.txt',{
    start:3,
    end:8,
    highWaterMark:3
})
let ws = new WriteStream('./1.txt', {
    highWaterMark:3,
});
rs.pipe(ws);