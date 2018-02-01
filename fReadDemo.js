let fs = require('fs');
let ReadStream = require('./FlowReadStream.js')
// let rs = fs.createReadStream('demo.txt', {
//     flags:'r',
//     mode: 0o666,
//     encoding:'utf8',
//     start: 2,
//     end:6,
//     autoClose: true,
//     highWaterMark: 4
// });
let rs = new ReadStream('demo.txt', {
    flags:'r',
    mode: 0o666,
    encoding:'utf8',
    start: 2,
    end:6,
    autoClose: true,
    highWaterMark: 3
});

rs.on('open',()=>{
    console.log('打开文件');
});

rs.on('data',data=>{
    console.log(data);
})
rs.on('close',()=>{
    console.log('关闭文件');
})

rs.on('error',err=>{
    console.log('出错了，详细信息:'+err);
})