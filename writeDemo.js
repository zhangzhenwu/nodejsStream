let fs = require('fs');
let WriteStream = require('./WriteStream');
// let ws = fs.createWriteStream('./demo.txt', {
//     flags:'w',
//     mode: 0o666,
//     encoding:'utf8',
//     highWaterMark:3,
//     start: 0
// });
let ws = new WriteStream('./demo.txt', {
    flags:'w',
    mode: 0o666,
    encoding:'utf8',
    highWaterMark:3,
    start: 0,
    autoClose: true
});

let n = 9;

let write = ()=>{
    let flag = true;
    while(flag && n > 0){
        flag = ws.write(n.toString(),'utf8',function () {
                   console.log('成功写入');
        })
        n--;
        console.log(`是否可以接着写入${flag}`);
    }
}


ws.on('drain',()=>{
    console.log('已满');
    write();
})

write();